import User from '../models/User.js';
import Company from '../models/Company.js';
import SyncOutbox from '../models/SyncOutbox.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveCompanyId } from '../utils/resolveCompanyId.js';
import { syncMongoUserToPg, removeReGenAppAccess, REGEN_APP_ID } from '../auth-integration/pgSyncService.js';
import { query } from '../auth-integration/pgClient.js';

const DEFAULT_PASSWORD = '1234';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.resolve(__dirname, '..', '..', 'assets');
const profilesDir = path.resolve(assetsDir, 'profiles');
const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');

const ensureUploadsDir = async () => {
  try {
    if (fs.existsSync(uploadsDir) && !fs.statSync(uploadsDir).isDirectory()) {
      fs.unlinkSync(uploadsDir);
    }
  } catch (e) {}
  await fs.promises.mkdir(profilesDir, { recursive: true });
  await fs.promises.mkdir(uploadsDir, { recursive: true });
};

const parseDataUriImage = (value) => {
  if (!value) return null;
  const match = String(value).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], data: match[2] };
};

const extFromMime = (mime) => {
  const m = String(mime || '').toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/svg+xml') return 'svg';
  return 'bin';
};

const saveAvatarDataUri = async (dataUri, seed) => {
  const parsed = parseDataUriImage(dataUri);
  if (!parsed) return null;
  await ensureUploadsDir();
  const ext = extFromMime(parsed.mime);
  const safeSeed = String(seed || 'user').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'user';
  const filename = `avatar-${safeSeed}-${Date.now()}.${ext}`;
  const profileFilePath = path.join(profilesDir, filename);
  const uploadFilePath = path.join(uploadsDir, filename);
  const buffer = Buffer.from(parsed.data, 'base64');
  await fs.promises.writeFile(profileFilePath, buffer);
  try { await fs.promises.writeFile(uploadFilePath, buffer); } catch (e) {}
  return `/assets/profiles/${filename}`;
};

const normalizeAvatarInput = async (raw, seed) => {
  if (!raw) return raw;
  const s = String(raw).trim();
  if (!s) return s;
  const normalized = s.startsWith('/uploads/data:') ? s.replace(/^\/uploads\//, '') : (s.startsWith('/assets/profiles/data:') ? s.replace(/^\/assets\/profiles\//, '') : s);
  if (normalized.startsWith('data:')) {
    const saved = await saveAvatarDataUri(normalized, seed);
    return saved || s;
  }
  if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('/assets/') || normalized.startsWith('/uploads/')) {
    return normalized;
  }
  return `/assets/profiles/${normalized.replace(/^\/+/, '')}`;
};

const normalizeIsoDate = (value) => {
  if (!value) return value;
  const s = String(value).trim();
  if (!s) return s;
  const isoMatch = s.match(/^(\d{4})\D(\d{2})\D(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const dmyMatch = s.match(/^(\d{2})\D(\d{2})\D(\d{4})$/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
};

const computeAgeFromDob = (dobIso) => {
  if (!dobIso) return undefined;
  const dob = new Date(`${dobIso}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
};

const sanitizeUser = (userDoc) => {
  if (!userDoc) return userDoc;
  const obj = typeof userDoc.toObject === 'function' ? userDoc.toObject() : { ...userDoc };
  delete obj.password;
  return obj;
};

// Generate a gender-appropriate DiceBear avatar URL
const getDefaultAvatar = (gender, seed) => {
  const safeSeed = encodeURIComponent(String(seed || 'user').slice(0, 30));
  const g = String(gender || '').toLowerCase();
  if (g === 'male') {
    // avataaars with male-leaning options using seed
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeSeed}&gender=male&top=shortHair,dreads,frizzle,shaggyMane,shortCurly,shortFlat,shortRound&accessories=prescription01,prescription02,kurt,round,sunglasses&facialHair=beardMedium,beardLight,beardMagestic&facialHairProbability=60`;
  }
  if (g === 'female') {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeSeed}&gender=female&top=longHair,bigHair,bun,curly,curvy,dreads,frida,fro,froAndBand,miaWallace,shavedSides,straight01,straight02,straightAndStrand&facialHairProbability=0`;
  }
  // default neutral
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeSeed}`;
};

export const createUser = async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.contact && !body.phone) {
      body.phone = body.contact;
      delete body.contact;
    }

    // Aadhaar validation (mandatory for new users)
    const aadhaarDigits = (body.aadhaar || '').replace(/\D/g, '');
    if (!aadhaarDigits || aadhaarDigits.length !== 12) {
      return res.status(400).json({ message: 'A valid 12-digit Aadhaar number is required' });
    }
    if (/^[01]/.test(aadhaarDigits)) {
      return res.status(400).json({ message: 'Aadhaar number cannot start with 0 or 1' });
    }
    body.aadhaar = aadhaarDigits;

    const pwdRaw = body.password !== undefined ? String(body.password || '').trim() : '';
    const pwd = pwdRaw || DEFAULT_PASSWORD;
    body.password = await bcrypt.hash(pwd, 10);
    body.mustChangePassword = pwd === DEFAULT_PASSWORD;
    if (body.joiningDate) body.joiningDate = normalizeIsoDate(body.joiningDate);
    if (body.dateOfBirth) body.dateOfBirth = normalizeIsoDate(body.dateOfBirth);
    if (body.dateOfBirth) {
      const age = computeAgeFromDob(body.dateOfBirth);
      if (age !== undefined) body.age = age;
    }
    if (body.firstName || body.lastName) {
      const fn = (body.firstName || '').trim();
      const ln = (body.lastName || '').trim();
      body.name = [fn, ln].filter(Boolean).join(' ').trim();
      delete body.firstName;
      delete body.lastName;
    }
    // Remove skills if present (no longer supported)
    delete body.skills;
    // Stamp companyId for data isolation
    body.companyId = await resolveCompanyId(req, body);
    if (body.companyId) {
      const comp = await Company.findById(body.companyId).select('name').lean();
      if (comp) body.company = comp.name;
    }
    if (!body.avatar) {
      return res.status(400).json({ message: 'Profile picture is mandatory. Please upload an image.' });
    }
    body.avatar = await normalizeAvatarInput(body.avatar, body.userId || body.username || body.name || 'user');
    body.lastAvatarUpdate = new Date();
    const user = new User(body);
    await user.save();

    // Synchronize to PostgreSQL Auth Service safely and immediately
    try {
      const syncResult = await syncMongoUserToPg(user, pwd);
      if (syncResult && syncResult.pgUserId) {
        user.pgUserId = syncResult.pgUserId;
        user.syncedWithPg = true;
      }
    } catch (syncErr) {
      console.warn('[AUTH-INTEGRATION] PG sync for user failed:', syncErr.message);
    }

    res.status(201).json(sanitizeUser(user));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const isSuperAdminMonitoring = (req.user?.role === 'param' || req.user?.role === 'admin') && 
      (req.headers['x-portal-view'] === 'superadmin' || (!req.headers['x-portal-view'] && req.headers.referer?.includes('/superadmin')));
    if (!isSuperAdminMonitoring && !req.companyId) {
      // Never expose global users to non-superadmin callers
      return res.status(200).json([]);
    }

    let filter = {};
    if (isSuperAdminMonitoring) {
      // Super Admin central monitoring sees all users across the platform (active and suspended/inactive)
      // so inactive/suspended counts update accurately and Super Admin can manage/re-enable profiles
      if (req.query.status) {
        filter.status = req.query.status;
      }
    } else {
      // Company admins and staff (and Super Admin switched to EMS app) only see users in their own company
      filter = { companyId: req.companyId, status: { $ne: 'inactive' } };
      if (req.query.includeInactive === 'true') {
        delete filter.status;
      }
      if (req.query.status) {
        filter.status = req.query.status;
      }
    }

    const users = await User.find(filter).populate('companyId', 'name');
    const sanitized = users.map(u => {
      const obj = sanitizeUser(u);
      if (u.companyId && typeof u.companyId === 'object' && u.companyId.name) {
        obj.company = u.companyId.name;
        obj.companyId = u.companyId._id;
      }
      return obj;
    });
    res.status(200).json(sanitized);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const currentUserId = String(req.user?.userId || '').trim();
    if (!currentUserId) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user?.role === 'param') {
      const { default: SuperAdmin } = await import('../models/SuperAdmin.js');
      const sa = await SuperAdmin.findOne({
        $or: [{ adminId: currentUserId }, { username: currentUserId }]
      }).lean();
      if (sa) {
        return res.status(200).json({
          _id: sa._id,
          userId: sa.adminId,
          username: sa.username,
          name: sa.name,
          role: 'param',
          companyId: null,
          company: 'ReGen Central',
          avatar: sa.avatar || '',
          email: sa.email || '',
          phone: sa.phone || '',
          designation: sa.designation || 'Platform Administrator',
          department: sa.department || 'Central Administration',
          status: sa.status
        });
      }
    }

    const filter = { userId: currentUserId };
    if (req.companyId) {
      filter.companyId = req.companyId;
    }

    const user = await User.findOne(filter).populate('companyId', 'name');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const obj = sanitizeUser(user);
    if (user.companyId && typeof user.companyId === 'object' && user.companyId.name) {
      obj.company = user.companyId.name;
      obj.companyId = user.companyId._id;
    }
    res.status(200).json(obj);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUser = async (req, res) => {
  try {
    const targetId = req.params.id;
    if (req.user?.role === 'param' && (targetId === req.user.userId || targetId === req.user.username)) {
      const { default: SuperAdmin } = await import('../models/SuperAdmin.js');
      const sa = await SuperAdmin.findOne({
        $or: [{ adminId: targetId }, { username: targetId }]
      }).lean();
      if (sa) {
        return res.status(200).json({
          _id: sa._id,
          userId: sa.adminId,
          username: sa.username,
          name: sa.name,
          role: 'param',
          companyId: null,
          company: 'ReGen Central',
          avatar: sa.avatar || '',
          email: sa.email || '',
          phone: sa.phone || '',
          designation: sa.designation || 'Platform Administrator',
          department: sa.department || 'Central Administration',
          status: sa.status
        });
      }
    }

    const isPrivileged = req.user?.role === 'param' || req.user?.role === 'admin';
    const filter = {
      $or: [
        { userId: targetId },
        { username: targetId },
        { StaffId: targetId },
        ...(mongoose.isValidObjectId(targetId) ? [{ _id: targetId }] : [])
      ]
    };
    if (req.companyId && !isPrivileged) filter.companyId = req.companyId;
    const user = await User.findOne(filter).populate('companyId', 'name');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const obj = sanitizeUser(user);
    if (user.companyId && typeof user.companyId === 'object' && user.companyId.name) {
      obj.company = user.companyId.name;
      obj.companyId = user.companyId._id;
    }
    res.status(200).json(obj);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    // Expecting id in body or params. Support body.userId or params.id
    const id = req.body.userId || req.params.id;

    // If caller is Super Admin updating their own Super Admin profile, update SuperAdmin collection only
    if (req.user?.role === 'param' && (id === req.user.userId || id === req.user.username)) {
      const { default: SuperAdmin } = await import('../models/SuperAdmin.js');
      const sa = await SuperAdmin.findOne({
        $or: [{ adminId: id }, { username: id }]
      });
      if (sa) {
        if (req.body.name !== undefined) sa.name = req.body.name;
        if (req.body.email !== undefined) sa.email = req.body.email;
        if (req.body.phone !== undefined) sa.phone = req.body.phone;
        if (req.body.designation !== undefined) sa.designation = req.body.designation;
        if (req.body.department !== undefined) sa.department = req.body.department;
        if (req.body.avatar !== undefined) sa.avatar = req.body.avatar;
        await sa.save();
        return res.status(200).json({
          _id: sa._id,
          userId: sa.adminId,
          username: sa.username,
          name: sa.name,
          role: 'param',
          companyId: null,
          company: 'ReGen Central',
          avatar: sa.avatar,
          email: sa.email,
          phone: sa.phone,
          designation: sa.designation,
          department: sa.department,
          status: sa.status
        });
      }
    }

    const body = { ...req.body };
    if (body.contact && !body.phone) {
      body.phone = body.contact;
      delete body.contact;
    }
    if (body.password !== undefined) {
      const pwd = String(body.password || '').trim();
      if (!pwd) {
        delete body.password;
      } else {
        body.password = await bcrypt.hash(pwd, 10);
        body.mustChangePassword = pwd === DEFAULT_PASSWORD;
      }
    }
    if (body.joiningDate) body.joiningDate = normalizeIsoDate(body.joiningDate);
    if (body.dateOfBirth) body.dateOfBirth = normalizeIsoDate(body.dateOfBirth);
    if (body.dateOfBirth) {
      const age = computeAgeFromDob(body.dateOfBirth);
      if (age !== undefined) body.age = age;
    }
    if (body.firstName || body.lastName) {
      const fn = (body.firstName || '').trim();
      const ln = (body.lastName || '').trim();
      body.name = [fn, ln].filter(Boolean).join(' ').trim();
      delete body.firstName;
      delete body.lastName;
    }
    // Remove skills if present (no longer supported)
    delete body.skills;
    // Status can only be changed by Super Admin via toggleUserStatus
    delete body.status;

    // FIND EXISTING USER TO CHECK AVATAR CHANGE
    const isPrivileged = ['admin', 'owner', 'param'].includes(req.user?.role);
    const isSuperOrAdmin = req.user?.role === 'param' || req.user?.role === 'admin';
    const findFilter = {
      $or: [
        { userId: id },
        { username: id },
        ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : [])
      ]
    };
    if (req.companyId && !isSuperOrAdmin) findFilter.companyId = req.companyId;
    const existingUser = await User.findOne(findFilter);
    if (!existingUser) return res.status(404).json({ message: 'User not found' });

    if (body.avatar !== undefined) {
      if (!body.avatar || body.avatar === 'null') {
        body.avatar = existingUser.avatar;
      } else if (body.avatar !== existingUser.avatar) {
        body.avatar = await normalizeAvatarInput(body.avatar, id || body.userId || body.username || body.name || 'user');
        body.lastAvatarUpdate = new Date();
      }
    }

    // Status management by SuperAdmin or Admin
    if (body.status !== undefined && isSuperOrAdmin) {
      const normalizedStatus = (body.status === 'inactive' || body.status === 'suspended') ? 'inactive' : 'active';
      body.status = normalizedStatus;
      if (normalizedStatus === 'inactive') {
        body.tokenVersion = Number(existingUser.tokenVersion || 0) + 1;
        if (existingUser.pgUserId) {
          query('UPDATE "UserAppAccess" SET "isActive" = false, "updatedAt" = NOW() WHERE "userId" = $1 AND "appId" = $2', [existingUser.pgUserId, REGEN_APP_ID]).catch(() => {});
        }
      } else {
        if (existingUser.pgUserId) {
          query('UPDATE "UserAppAccess" SET "isActive" = true, "updatedAt" = NOW() WHERE "userId" = $1 AND "appId" = $2', [existingUser.pgUserId, REGEN_APP_ID]).catch(() => {});
        }
      }
    }

    // SuperAdmin or Admin can change/assign company for a user
    if (isSuperOrAdmin && body.companyId !== undefined) {
      if (!body.companyId || body.companyId === 'none' || body.companyId === 'null') {
        body.companyId = null;
        body.company = '';
      } else {
        const comp = await Company.findById(body.companyId).select('name').lean();
        if (comp) {
          body.company = comp.name;
        }
      }
    }

    const updateFilter = { _id: existingUser._id };
    const user = await User.findOneAndUpdate(updateFilter, body, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Keep PostgreSQL synchronized on updates
    syncMongoUserToPg(user).catch(err => {
      console.warn('[AUTH-INTEGRATION] PG sync on update failed:', err.message);
    });

    res.status(200).json(sanitizeUser(user));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const targetId = req.params.id;
    const filter = { userId: targetId };
    if (req.companyId && req.user?.role !== 'param') filter.companyId = req.companyId;

    const user = await User.findOne(filter);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // 1. Protect Super Admin account
    if (user.role === 'param') {
      return res.status(403).json({ message: 'Super Admin account cannot be deleted' });
    }

    // 2. Prevent self-deletion
    if (req.user?.userId === user.userId) {
      return res.status(400).json({ message: 'Self-deletion is not permitted. Please contact another administrator.' });
    }

    // 3. Prevent deletion of company owner until ownership is safely transferred
    if (user.role === 'owner') {
      const ownedCompany = await Company.findOne({ ownerId: user.userId, status: 'active' });
      if (ownedCompany) {
        return res.status(400).json({
          message: `Cannot delete company owner of "${ownedCompany.name}". Ownership must be transferred first before deleting this account.`
        });
      }
    }

    // 4. Safely deactivate in MongoDB and bump tokenVersion to invalidate all existing sessions
    user.status = 'inactive';
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
    await user.save();

    // 5. Remove ReGen-only UserAppAccess in PostgreSQL (never physically delete shared User record)
    const pgUserId = user.pgUserId;
    if (pgUserId) {
      const pgRes = await removeReGenAppAccess(pgUserId);
      if (!pgRes.success) {
        // Enqueue durable retry in MongoDB SyncOutbox
        await SyncOutbox.create({
          action: 'REMOVE_REGEN_APP_ACCESS',
          userId: user.userId,
          pgUserId: pgUserId,
          status: 'PENDING',
          lastError: pgRes.error,
          nextRetryAt: new Date(Date.now() + 5000)
        });
      }
    } else if (user.syncedWithPg) {
      await SyncOutbox.create({
        action: 'REMOVE_REGEN_APP_ACCESS',
        userId: user.userId,
        status: 'PENDING',
        nextRetryAt: new Date(Date.now() + 5000)
      });
    }

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const toggleUserStatus = async (req, res) => {
  try {
    const isPrivileged = req.user?.role === 'param' || req.user?.role === 'admin';
    if (!isPrivileged) {
      return res.status(403).json({ message: 'Only Super Admin or Admin can suspend or restore users' });
    }
    const { id } = req.params;
    const { action, status, companyId, company } = req.body; // 'suspend' | 'activate' | status

    const targetAction = action || (status === 'inactive' || status === 'suspended' ? 'suspend' : 'activate');

    const user = await User.findOne({
      $or: [
        { userId: id },
        { username: id },
        ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : [])
      ]
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role === 'param') {
      return res.status(400).json({ message: 'Super Admin cannot be suspended' });
    }

    if (targetAction === 'suspend') {
      user.status = 'inactive';
      // Preserve company affiliation on suspension so they can be reinstated with their company intact
      user.tokenVersion = Number(user.tokenVersion || 0) + 1;
      await user.save();

      if (user.pgUserId) {
        query('UPDATE "UserAppAccess" SET "isActive" = false, "updatedAt" = NOW() WHERE "userId" = $1 AND "appId" = $2', [user.pgUserId, REGEN_APP_ID]).catch(() => {});
      }

      return res.status(200).json({
        message: `User ${user.name || user.username} has been suspended`,
        user: sanitizeUser(user)
      });
    } else {
      user.status = 'active';
      if (companyId) {
        if (companyId === 'none' || companyId === 'null') {
          user.companyId = null;
          user.company = '';
        } else {
          user.companyId = companyId;
          const comp = await Company.findById(companyId);
          user.company = comp ? comp.name : (company || user.company || '');
        }
      } else if (!user.company && user.companyId) {
        const comp = await Company.findById(user.companyId);
        if (comp) user.company = comp.name;
      }
      await user.save();

      if (user.pgUserId) {
        query('UPDATE "UserAppAccess" SET "isActive" = true, "updatedAt" = NOW() WHERE "userId" = $1 AND "appId" = $2', [user.pgUserId, REGEN_APP_ID]).catch(() => {});
      }

      return res.status(200).json({
        message: `User ${user.name || user.username} access has been restored`,
        user: sanitizeUser(user)
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

