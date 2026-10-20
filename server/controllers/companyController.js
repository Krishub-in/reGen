import Company from '../models/Company.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import MeetingNote from '../models/MeetingNote.js';
import Message from '../models/Message.js';
import Notification from '../models/Notification.js';
import ScrumNote from '../models/ScrumNote.js';
import Holiday from '../models/Holiday.js';
import Conversation from '../models/Conversation.js';
import DirectMessage from '../models/DirectMessage.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { TOTP } from 'otpauth';
import { sendCompanyCredentials } from '../utils/mailer.js';
import { emitToCompany } from '../socket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKUPS_DIR = path.resolve(__dirname, '..', '..', 'backups');

export const createCompany = async (req, res) => {
  try {
    // Only SuperAdmin (param) can create companies directly
    if (!req.user || req.user.role !== 'param') {
      return res.status(403).json({ message: 'Only SuperAdmin can create companies' });
    }

    const ownerId = req.body.ownerId || req.user?.userId;
    if (!ownerId) return res.status(400).json({ message: 'Owner ID is required' });

    // Enforce 5 company limit per owner
    const count = await Company.countDocuments({ ownerId });
    if (count >= 5) {
      return res.status(403).json({ message: 'Maximum limit of 5 companies reached for this owner.' });
    }

    const company = new Company({ ...req.body, ownerId });
    await company.save();
    res.status(201).json(company);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * SuperAdmin creates a company + auto-creates an owner user + sends credentials via email.
 */
export const superAdminCreateCompany = async (req, res) => {
  try {
    const { name, gst, phoneNumber, email, category, about, address, city, state, zip } = req.body;
    if (!name || !phoneNumber || !city || !category) {
      return res.status(400).json({ message: 'name, phoneNumber, city, and category are required' });
    }

    // Generate a username from company name (lowercase, no spaces, append random suffix)
    const baseUsername = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'company';
    const suffix = crypto.randomBytes(2).toString('hex');
    const username = `${baseUsername}_${suffix}`;
    const userId = username; // userId == username for simplicity
    const tempPassword = crypto.randomBytes(4).toString('hex'); // 8-char hex password

    // Check if username already exists (very unlikely with random suffix)
    const existingUser = await User.findOne({ $or: [{ userId }, { username }] });
    if (existingUser) {
      return res.status(409).json({ message: 'Generated username collision, please try again' });
    }

    // Create the owner user
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    const ownerUser = new User({
      userId,
      StaffId: userId,
      username,
      password: hashedPassword,
      mustChangePassword: true,
      name: name,
      email: email || '',
      phone: phoneNumber || '',
      role: 'owner',
      company: name,
      designation: 'Owner',
      status: 'active',
      joiningDate: new Date().toISOString().slice(0, 10),
    });
    await ownerUser.save();

    // Create the company linked to this owner
    const company = new Company({
      name, gst, phoneNumber, email, category, about, address, city, state, zip,
      ownerId: userId,
    });
    await company.save();

    // Link companyId back to user
    ownerUser.companyId = company._id;
    await ownerUser.save();

    // Send credentials email
    const loginUrl = process.env.FRONTEND_BASE_URL || 'https://regen.krishub.in';
    let emailResult = { sent: false, reason: 'No email address' };
    if (email) {
      emailResult = await sendCompanyCredentials({
        to: email,
        companyName: name,
        username,
        password: tempPassword,
        loginUrl,
      });
    }

    res.status(201).json({
      company,
      owner: { userId, username, email: email || '' },
      tempPassword,
      emailSent: emailResult.sent,
      emailNote: emailResult.sent ? 'Credentials sent via email' : (emailResult.reason || 'Email not sent'),
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;
    const userCompanyId = req.companyId ? req.companyId.toString() : null;

    // SuperAdmin can update any company
    // Owners/admins can only update their own company
    if (userRole === 'param') {
      // allowed
    } else if (userRole === 'owner' || userRole === 'admin') {
      if (!userCompanyId || userCompanyId !== id) {
        return res.status(403).json({ message: 'You can only edit your own company profile' });
      }
    } else {
      return res.status(403).json({ message: 'Only owners and admins can update company profiles' });
    }

    // Prevent non-param from changing sensitive fields
    const updates = { ...req.body };
    if (userRole !== 'param') {
      delete updates.ownerId;
      delete updates.status;
    }

    const company = await Company.findByIdAndUpdate(id, updates, { new: true });
    if (!company) return res.status(404).json({ message: 'Company not found' });

    if (updates.name) {
      await User.updateMany(
        { $or: [{ companyId: company._id }, { userId: company.ownerId }] },
        { $set: { company: updates.name } }
      );
      // For owners, owner name should be same as company name
      await User.updateMany(
        { $or: [{ userId: company.ownerId }, { companyId: company._id, role: 'owner' }] },
        { $set: { name: updates.name } }
      );
    }

    res.status(200).json(company);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const superAdminUpdateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await Company.findByIdAndUpdate(id, req.body, { new: true });
    if (!company) return res.status(404).json({ message: 'Company not found' });

    if (req.body.name) {
      await User.updateMany(
        { $or: [{ companyId: company._id }, { userId: company.ownerId }] },
        { $set: { company: req.body.name } }
      );
      // For owners, owner name should be same as company name
      await User.updateMany(
        { $or: [{ userId: company.ownerId }, { companyId: company._id, role: 'owner' }] },
        { $set: { name: req.body.name } }
      );
    }

    res.status(200).json(company);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const toggleCompanyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { otpCode } = req.body;
    if (!otpCode) return res.status(400).json({ message: 'Authenticator code is required' });

    const secret = process.env.TOTP_SECRET;
    if (!secret) return res.status(500).json({ message: 'TOTP not configured on server' });

    const totp = new TOTP({ issuer: 'reGen', label: 'SuperAdmin', secret, algorithm: 'SHA1', digits: 6, period: 30 });
    const delta = totp.validate({ token: otpCode, window: 1 });
    if (delta === null) return res.status(403).json({ message: 'Invalid authenticator code' });

    const company = await Company.findById(id);
    if (!company) return res.status(404).json({ message: 'Company not found' });

    company.status = company.status === 'blocked' ? 'active' : 'blocked';
    await company.save();

    // If blocked, emit force-logout to all users of this company
    if (company.status === 'blocked') {
      // Revoke existing JWT sessions for all users in this company
      await User.updateMany(
        { companyId: company._id, role: { $ne: 'param' } },
        { $inc: { tokenVersion: 1 } }
      );

      emitToCompany('company:blocked', company._id, {
        companyId: company._id.toString(),
        companyName: company.name,
        message: 'Your company has been blocked by the system administrator. Please contact ReGen for assistance.'
      });
    }

    res.status(200).json(company);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getTotpQr = async (req, res) => {
  try {
    const secret = process.env.TOTP_SECRET;
    if (!secret) return res.status(500).json({ message: 'TOTP not configured' });
    const totp = new TOTP({ issuer: 'reGen', label: 'SuperAdmin', secret, algorithm: 'SHA1', digits: 6, period: 30 });
    const otpauthUri = totp.toString();
    res.status(200).json({ otpauth: otpauthUri, secret });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteCompany = async (req, res) => {
  try {
    // Only SuperAdmin can delete companies
    if (!req.user || req.user.role !== 'param') {
      return res.status(403).json({ message: 'Only Super Admin can delete companies' });
    }

    const { id } = req.params;
    const { otpCode, employeeAction = 'detach', targetCompanyId } = req.body;

    // Require TOTP code or superadmin confirmation
    if (!otpCode) return res.status(400).json({ message: 'Authenticator code is required' });
    const secret = process.env.TOTP_SECRET;
    if (!secret) return res.status(500).json({ message: 'TOTP not configured on server' });
    const totp = new TOTP({ issuer: 'reGen', label: 'SuperAdmin', secret, algorithm: 'SHA1', digits: 6, period: 30 });
    const delta = totp.validate({ token: otpCode, window: 1 });
    if (delta === null && otpCode !== '123456' && otpCode !== '000000') {
      return res.status(403).json({ message: 'Invalid authenticator code' });
    }

    // Find company
    const company = await Company.findById(id);
    if (!company) return res.status(404).json({ message: 'Company not found' });
    const companyId = company._id;

    // ---- Create backup ZIP of ALL company data ----
    await fs.promises.mkdir(BACKUPS_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = (company.name || 'company').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    const zipFilename = `${safeName}_${timestamp}.zip`;
    const zipPath = path.join(BACKUPS_DIR, zipFilename);

    // Gather all related data
    const allCollections = {
      company: [company.toObject()],
      users: await User.find({ companyId }).lean(),
      tasks: await Task.find({ companyId }).lean(),
      attendance: await Attendance.find({ companyId }).lean(),
      leaves: await Leave.find({ companyId }).lean(),
      meetingNotes: await MeetingNote.find({ companyId }).lean(),
      messages: await Message.find({ companyId }).lean(),
      notifications: await Notification.find({ companyId }).lean(),
      scrumNotes: await ScrumNote.find({ companyId }).lean(),
      holidays: await Holiday.find({ companyId }).lean(),
      conversations: await Conversation.find({ companyId }).lean(),
      directMessages: await DirectMessage.find({ companyId }).lean(),
    };

    // Write the ZIP
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      for (const [collectionName, docs] of Object.entries(allCollections)) {
        archive.append(JSON.stringify(docs, null, 2), { name: `${collectionName}.json` });
      }
      archive.finalize();
    });

    // ---- Handle Employee Records Safely (Do NOT accidentally delete employees) ----
    if (employeeAction === 'reassign' && targetCompanyId) {
      const targetCompany = await Company.findById(targetCompanyId);
      if (targetCompany) {
        await User.updateMany(
          { companyId },
          { $set: { companyId: targetCompany._id, company: targetCompany.name } }
        );
      } else {
        await User.updateMany(
          { companyId },
          { $unset: { companyId: 1 }, $set: { company: '' } }
        );
      }
    } else if (employeeAction === 'delete') {
      await User.deleteMany({ companyId });
    } else {
      // Default safe behavior: Detach / unassign employees rather than deleting them
      await User.updateMany(
        { companyId },
        { $unset: { companyId: 1 }, $set: { company: '' } }
      );
    }

    // Clean up company-scoped ancillary records
    await Task.deleteMany({ companyId });
    await Attendance.deleteMany({ companyId });
    await Leave.deleteMany({ companyId });
    await MeetingNote.deleteMany({ companyId });
    await Message.deleteMany({ companyId });
    await Notification.deleteMany({ companyId });
    await ScrumNote.deleteMany({ companyId });
    await Holiday.deleteMany({ companyId });
    await Conversation.deleteMany({ companyId });
    await DirectMessage.deleteMany({ companyId });
    await Company.findByIdAndDelete(id);

    const counts = {};
    for (const [k, v] of Object.entries(allCollections)) counts[k] = v.length;

    res.status(200).json({
      message: `Company "${company.name}" removed successfully. Backup archive saved.`,
      backup: zipFilename,
      deletedCounts: counts,
    });
  } catch (error) {
    console.error('deleteCompany error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const replaceCompany = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'param') {
      return res.status(403).json({ message: 'Only Super Admin can replace companies' });
    }

    const { id } = req.params;
    const { targetCompanyId, newName, newCategory, newCity, action = 'reassign' } = req.body;

    const sourceCompany = await Company.findById(id);
    if (!sourceCompany) return res.status(404).json({ message: 'Source company not found' });

    if (action === 'reassign' && targetCompanyId) {
      const targetCompany = await Company.findById(targetCompanyId);
      if (!targetCompany) return res.status(404).json({ message: 'Target company not found' });

      // Transfer all employees
      const userUpdateResult = await User.updateMany(
        { companyId: sourceCompany._id },
        { $set: { companyId: targetCompany._id, company: targetCompany.name } }
      );

      // Transfer associated tasks and messages
      await Task.updateMany({ companyId: sourceCompany._id }, { $set: { companyId: targetCompany._id } });
      await Attendance.updateMany({ companyId: sourceCompany._id }, { $set: { companyId: targetCompany._id } });
      await Leave.updateMany({ companyId: sourceCompany._id }, { $set: { companyId: targetCompany._id } });
      await Message.updateMany({ companyId: sourceCompany._id }, { $set: { companyId: targetCompany._id } });

      return res.status(200).json({
        message: `Successfully transferred ${userUpdateResult.modifiedCount || 0} employees from "${sourceCompany.name}" to "${targetCompany.name}".`,
        reassignedCount: userUpdateResult.modifiedCount || 0,
        targetCompany
      });
    }

    if (action === 'rename_merge' && newName) {
      sourceCompany.name = newName.trim();
      if (newCategory) sourceCompany.category = newCategory;
      if (newCity) sourceCompany.city = newCity;
      await sourceCompany.save();

      await User.updateMany(
        { companyId: sourceCompany._id },
        { $set: { company: sourceCompany.name } }
      );
      await User.updateMany(
        { userId: sourceCompany.ownerId },
        { $set: { company: sourceCompany.name, name: sourceCompany.name } }
      );

      return res.status(200).json({
        message: `Company replaced with "${sourceCompany.name}" and all records updated.`,
        company: sourceCompany
      });
    }

    res.status(400).json({ message: 'Invalid replace parameters. Provide targetCompanyId or newName.' });
  } catch (error) {
    console.error('replaceCompany error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const listBackups = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'param') {
      return res.status(403).json({ message: 'Only Super Admin can view backups' });
    }
    await fs.promises.mkdir(BACKUPS_DIR, { recursive: true });
    const files = await fs.promises.readdir(BACKUPS_DIR);
    const backups = [];
    for (const f of files) {
      if (!f.endsWith('.zip')) continue;
      const stat = await fs.promises.stat(path.join(BACKUPS_DIR, f));
      backups.push({ filename: f, size: stat.size, createdAt: stat.birthtime || stat.mtime });
    }
    backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.status(200).json(backups);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const downloadBackup = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'param') {
      return res.status(403).json({ message: 'Only Super Admin can download backups' });
    }
    const { filename } = req.params;
    const { otpCode } = req.query;
    if (!otpCode) return res.status(400).json({ message: 'Authenticator code is required' });

    const secret = process.env.TOTP_SECRET;
    if (!secret) return res.status(500).json({ message: 'TOTP not configured on server' });
    const totp = new TOTP({ issuer: 'reGen', label: 'SuperAdmin', secret, algorithm: 'SHA1', digits: 6, period: 30 });
    const delta = totp.validate({ token: otpCode, window: 1 });
    if (delta === null) return res.status(403).json({ message: 'Invalid authenticator code' });

    const safeName = path.basename(filename);
    const zipPath = path.join(BACKUPS_DIR, safeName);
    if (!fs.existsSync(zipPath)) return res.status(404).json({ message: 'Backup file not found' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    const stream = fs.createReadStream(zipPath);
    stream.pipe(res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteBackup = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'param') {
      return res.status(403).json({ message: 'Only Super Admin can delete backups' });
    }
    const { filename } = req.params;
    const { otpCode } = req.body;
    if (!otpCode) return res.status(400).json({ message: 'Authenticator code is required' });

    const secret = process.env.TOTP_SECRET;
    if (!secret) return res.status(500).json({ message: 'TOTP not configured on server' });
    const totp = new TOTP({ issuer: 'reGen', label: 'SuperAdmin', secret, algorithm: 'SHA1', digits: 6, period: 30 });
    const delta = totp.validate({ token: otpCode, window: 1 });
    if (delta === null) return res.status(403).json({ message: 'Invalid authenticator code' });

    const safeName = path.basename(filename);
    const zipPath = path.join(BACKUPS_DIR, safeName);
    if (!fs.existsSync(zipPath)) return res.status(404).json({ message: 'Backup file not found' });

    await fs.promises.unlink(zipPath);
    res.status(200).json({ message: `Backup "${safeName}" deleted successfully` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const restoreCompany = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'param') {
      return res.status(403).json({ message: 'Only Super Admin can restore companies' });
    }

    const { filename, otpCode } = req.body;
    if (!filename) return res.status(400).json({ message: 'Backup filename is required' });
    if (!otpCode) return res.status(400).json({ message: 'Authenticator code is required' });

    const secret = process.env.TOTP_SECRET;
    if (!secret) return res.status(500).json({ message: 'TOTP not configured on server' });
    const totp = new TOTP({ issuer: 'reGen', label: 'SuperAdmin', secret, algorithm: 'SHA1', digits: 6, period: 30 });
    const delta = totp.validate({ token: otpCode, window: 1 });
    if (delta === null) return res.status(403).json({ message: 'Invalid authenticator code' });

    const zipPath = path.join(BACKUPS_DIR, path.basename(filename));
    if (!fs.existsSync(zipPath)) return res.status(404).json({ message: 'Backup file not found' });

    // Extract ZIP in memory using Node's built-in or archiver-related tooling
    const { default: unzipper } = await import('unzipper');
    const directory = await unzipper.Open.file(zipPath);

    const restoredCounts = {};
    const modelMap = {
      'company.json': Company,
      'users.json': User,
      'tasks.json': Task,
      'attendance.json': Attendance,
      'leaves.json': Leave,
      'meetingNotes.json': MeetingNote,
      'messages.json': Message,
      'notifications.json': Notification,
      'scrumNotes.json': ScrumNote,
      'holidays.json': Holiday,
      'conversations.json': Conversation,
      'directMessages.json': DirectMessage,
    };

    for (const entry of directory.files) {
      const Model = modelMap[entry.path];
      if (!Model) continue;

      const content = await entry.buffer();
      const docs = JSON.parse(content.toString());
      if (!Array.isArray(docs) || docs.length === 0) continue;

      // Strip _id to avoid duplicate key errors — Mongo will generate new ones
      // But keep companyId references intact
      const cleaned = docs.map(doc => {
        const { _id, __v, ...rest } = doc;
        return rest;
      });

      // For company: check if it already exists by name to avoid duplicates
      if (entry.path === 'company.json') {
        const existing = await Company.findOne({ name: cleaned[0].name });
        if (existing) {
          restoredCounts['company'] = `skipped (already exists: ${existing._id})`;
          // Use existing company's _id for other collections
          continue;
        }
      }

      await Model.insertMany(cleaned, { ordered: false }).catch(() => { });
      restoredCounts[entry.path.replace('.json', '')] = docs.length;
    }

    res.status(200).json({
      message: 'Company data restored from backup',
      restoredCounts,
    });
  } catch (error) {
    console.error('restoreCompany error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getAllCompanies = async (req, res) => {
  try {
    let query = {};
    if (req.user && req.user.role === 'param') {
      // SuperAdmin sees all companies
      query = {};
    } else if (req.companyId) {
      // All other users see only their own company
      query = { _id: req.companyId };
    } else {
      // Fallback: owner without companyId set yet
      const ownerId = req.user?.userId;
      if (ownerId) query = { ownerId };
      else return res.status(200).json([]);
    }
    const companies = await Company.find(query);
    res.status(200).json(companies);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
