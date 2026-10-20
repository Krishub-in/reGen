import User from '../models/User.js';
import Company from '../models/Company.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveCompanyId } from '../utils/resolveCompanyId.js';

const DEFAULT_PASSWORD = '1234';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');

const ensureUploadsDir = async () => {
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
  const filePath = path.join(uploadsDir, filename);
  await fs.promises.writeFile(filePath, Buffer.from(parsed.data, 'base64'));
  return `/uploads/${filename}`;
};

const normalizeAvatarInput = async (raw, seed) => {
  if (!raw) return raw;
  const s = String(raw).trim();
  if (!s) return s;
  const normalized = s.startsWith('/uploads/data:') ? s.replace(/^\/uploads\//, '') : s;
  if (normalized.startsWith('data:')) {
    const saved = await saveAvatarDataUri(normalized, seed);
    return saved || s;
  }
  if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('/uploads/')) {
    return normalized;
  }
  return `/uploads/${normalized.replace(/^\/+/, '')}`;
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
    if (body.avatar !== undefined) {
      body.avatar = await normalizeAvatarInput(body.avatar, body.userId || body.username || body.name || 'user');
    } else {
      // Auto-generate a gender-based avatar if none is provided
      body.avatar = getDefaultAvatar(body.gender, body.userId || body.username || body.name || 'user');
    }
    const user = new User(body);
    await user.save();
    res.status(201).json(sanitizeUser(user));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const isSuperAdmin = req.user?.role === 'param';
    if (!isSuperAdmin && !req.companyId) {
      // Never expose global users to non-superadmin callers
      return res.status(200).json([]);
    }
    const filter = isSuperAdmin ? {} : { companyId: req.companyId };
    const users = await User.find(filter).populate('companyId', 'name');
    const sanitized = users.map(u => {
      const obj = sanitizeUser(u);
      if (u.companyId && typeof u.companyId === 'object' && u.companyId.name) {
        obj.company = u.companyId.name;
        obj.companyId = u.companyId._id;
      }
      if (u.role === 'owner' && obj.company) {
        obj.name = obj.company;
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

    const isSuperAdmin = req.user?.role === 'param';
    const filter = { userId: currentUserId };
    if (!isSuperAdmin && req.companyId) {
      filter.companyId = req.companyId;
    }

    const user = await User.findOne(filter).populate('companyId', 'name');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const obj = sanitizeUser(user);
    if (user.companyId && typeof user.companyId === 'object' && user.companyId.name) {
      obj.company = user.companyId.name;
      obj.companyId = user.companyId._id;
    }
    if (user.role === 'owner' && obj.company) {
      obj.name = obj.company;
    }
    res.status(200).json(obj);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUser = async (req, res) => {
  try {
    const filter = { userId: req.params.id };
    if (req.companyId) filter.companyId = req.companyId;
    const user = await User.findOne(filter).populate('companyId', 'name');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const obj = sanitizeUser(user);
    if (user.companyId && typeof user.companyId === 'object' && user.companyId.name) {
      obj.company = user.companyId.name;
      obj.companyId = user.companyId._id;
    }
    if (user.role === 'owner' && obj.company) {
      obj.name = obj.company;
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
    const findFilter = {
      $or: [
        { userId: id },
        ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : [])
      ]
    };
    if (req.companyId) findFilter.companyId = req.companyId;
    const existingUser = await User.findOne(findFilter);
    if (!existingUser) return res.status(404).json({ message: 'User not found' });

    if (body.avatar !== undefined && body.avatar !== existingUser.avatar) {
      // 15-day cooldown only applies to self-edits; admin/owner/param can change any user's avatar
      const isSelfEdit = req.user?.userId === id;
      const isPrivileged = ['admin', 'owner', 'param'].includes(req.user?.role);
      if (isSelfEdit || !isPrivileged) {
        if (existingUser.lastAvatarUpdate) {
          const diff = Date.now() - existingUser.lastAvatarUpdate.getTime();
          const days = diff / (1000 * 60 * 60 * 24);
          if (days < 15) {
            return res.status(400).json({ 
              message: `Profile photo can only be changed once every 15 days. Please wait ${Math.ceil(15 - days)} more days.` 
            });
          }
        }
      }
      body.avatar = await normalizeAvatarInput(body.avatar, id || body.userId || body.username || body.name || 'user');
      body.lastAvatarUpdate = new Date();
    }

    // SuperAdmin can change/assign company for a user
    if (req.user?.role === 'param' && body.companyId !== undefined) {
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

    const updateFilter = { userId: id };
    if (req.companyId && req.user?.role !== 'param') updateFilter.companyId = req.companyId;
    const user = await User.findOneAndUpdate(updateFilter, body, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json(sanitizeUser(user));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const filter = { userId: req.params.id };
    if (req.companyId) filter.companyId = req.companyId;
    const user = await User.findOneAndDelete(filter);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const toggleUserStatus = async (req, res) => {
  try {
    if (req.user?.role !== 'param') {
      return res.status(403).json({ message: 'Only Super Admin can suspend or restore users' });
    }
    const { id } = req.params;
    const { action, companyId, company } = req.body; // 'suspend' | 'activate'

    const user = await User.findOne({
      $or: [
        { userId: id },
        ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : [])
      ]
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role === 'param') {
      return res.status(400).json({ message: 'Super Admin cannot be suspended' });
    }

    if (action === 'suspend') {
      user.status = 'inactive';
      // Preserve company affiliation on suspension so they can be reinstated with their company intact
      user.tokenVersion = Number(user.tokenVersion || 0) + 1;
      await user.save();
      return res.status(200).json({
        message: `User ${user.name || user.username} has been suspended`,
        user: sanitizeUser(user)
      });
    } else {
      user.status = 'active';
      if (companyId) {
        if (companyId === 'none') {
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
      return res.status(200).json({
        message: `User ${user.name || user.username} access has been restored`,
        user: sanitizeUser(user)
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

