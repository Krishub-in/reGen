// ReGen Backend Server Entry Point
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';
import { TOTP } from 'otpauth';
import rateLimit from 'express-rate-limit';
import { initSocketIO, emitToCompany } from './socket.js';

import userRoutes from './routes/users.js';
import taskRoutes from './routes/tasks.js';
import attendanceRoutes from './routes/attendance.js';
import companyRoutes from './routes/company.js';
import leavesRoutes from './routes/leaves.js';
import notificationRoutes from './routes/notifications.js';
import messageRoutes from './routes/messages.js';
import dmRoutes from './routes/dm.js';
import meetingNoteRoutes from './routes/meetingNotes.js';
import scrumRoutes from './routes/scrum.js';
import holidayRoutes from './routes/holidays.js';
import payrollRoutes from './routes/payroll.js';
import policyRoutes from './routes/policyRoutes.js';
import projectRoutes from './routes/projects.js';
import { runBirthdayReminderJob } from './controllers/notificationController.js';
import SystemSetting from './models/SystemSetting.js';
import { maintenanceCheck } from './middleware/maintenanceCheck.js';
import { globalInputValidator } from './middleware/inputValidation.js';
import { isPort3004Reachable } from './utils/portCheck.js';
import { signToken, verifyToken } from './middleware/authJwt.js';
import { companyScope } from './middleware/companyScope.js';
import User from './models/User.js';
import Company from './models/Company.js';
import Task from './models/Task.js';
import { isTaskExpired } from './controllers/taskController.js';
import { authenticateUser } from './auth-integration/dualAuthService.js';
import { isPgConnected } from './auth-integration/pgClient.js';
import { syncMongoUserToPg } from './auth-integration/pgSyncService.js';
import { startDeletionSyncWorker } from './auth-integration/pgDeletionSyncService.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5006;
const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || '1234';
const SUPER_ADMIN_USERNAME = process.env.SUPER_ADMIN_USERNAME || 'Vyshwa';

// === In-Memory System Log Buffer ===
const MAX_LOG_ENTRIES = 500;
const systemLogs = [];

export function pushLog(level, message, meta = '') {
  const now = new Date();
  const time = now.toLocaleTimeString('en-GB', { hour12: false });
  const entry = {
    ts: now.toISOString(),
    time,
    level: level.toUpperCase(),
    message,
    meta,
  };
  systemLogs.unshift(entry); // newest first
  if (systemLogs.length > MAX_LOG_ENTRIES) systemLogs.length = MAX_LOG_ENTRIES;
}

// Seed startup log
pushLog('INFO', 'Server process started', `Port ${process.env.PORT || 5006}`);

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_BASE_URL || 'https://regen.krishub.in',
  'http://localhost:2000',
  'http://127.0.0.1:2000',
  'http://localhost:2001',
  'http://127.0.0.1:2001',
];
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (server-to-server, curl, mobile apps) or localhost/LAN
    if (!origin || ALLOWED_ORIGINS.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(globalInputValidator);

// Setup attachment directory & profiles directory
const assetsDir = path.resolve(__dirname, '..', 'assets');
const profilesDir = path.resolve(assetsDir, 'profiles');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}
if (!fs.existsSync(profilesDir)) {
  fs.mkdirSync(profilesDir, { recursive: true });
}

// Setup uploads directory with safety check against corrupted files
const uploadsDir = path.resolve(__dirname, '..', 'uploads');
try {
  if (fs.existsSync(uploadsDir) && !fs.statSync(uploadsDir).isDirectory()) {
    fs.unlinkSync(uploadsDir);
  }
} catch (e) {}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use('/assets', express.static(assetsDir));
app.use('/profiles', express.static(profilesDir));
app.use('/uploads/assets/profiles', express.static(profilesDir));
app.use('/uploads/profiles', express.static(profilesDir));
app.use('/uploads', express.static(uploadsDir));
app.use('/uploads', express.static(profilesDir));
app.get(/^\/avatar-[^/]+\.(jpg|jpeg|png|gif|webp)$/i, (req, res) => {
  const fileName = path.basename(req.path);
  const profilePath = path.join(profilesDir, fileName);
  if (fs.existsSync(profilePath)) return res.sendFile(profilePath);
  const filePath = path.join(uploadsDir, fileName);
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  return res.status(404).end();
});

// Configure multer for avatar & company logo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, profilesDir);
  },
  filename: (req, file, cb) => {
    const id = req.body.userId || req.params.userId || req.params.companyId || req.body.companyId || Date.now();
    const ext = path.extname(file.originalname) || '.png';
    const isLogo = req.path?.includes('logo') || req.baseUrl?.includes('logo') || file.fieldname === 'logo';
    const prefix = isLogo ? 'logo' : 'avatar';
    cb(null, `${prefix}-${id}-${Date.now()}${ext}`);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});

// Seed Super Admin & Company Owner into separate sectors
async function seedSuperAdmin() {
  try {
    const targetUsername = (process.env.SUPER_ADMIN_USERNAME || 'Vyshwa').trim();
    const targetPassword = (process.env.SUPER_ADMIN_PASSWORD || 'S@@ttv1k@').trim();
    const pwdHash = await bcrypt.hash(targetPassword, 10);

    // 1. Ensure Super Admin's inbuild company exists
    let saCompany = await Company.findOne({ ownerId: targetUsername });
    if (!saCompany) {
      saCompany = await Company.findOne({ name: 'krish Tech Computer' });
    }
    if (!saCompany) {
      saCompany = await Company.create({
        name: 'krish Tech Computer',
        phoneNumber: '9092024444',
        email: 'info@krishub.in',
        city: 'CBE',
        category: 'it',
        ownerId: targetUsername,
        ownerName: targetUsername,
        status: 'active',
        companyPolicies: []
      });
      pushLog('INFO', `Super Admin inbuild company created: ${saCompany._id}`);
    } else {
      if (saCompany.ownerId !== targetUsername || saCompany.ownerName !== targetUsername) {
        saCompany.ownerId = targetUsername;
        saCompany.ownerName = targetUsername;
        await saCompany.save();
      }
    }

    // 2. SECTOR 1: Super Admin (Isolated in SuperAdmin collection)
    const { default: SuperAdmin } = await import('./models/SuperAdmin.js');
    let superAdmin = await SuperAdmin.findOne({
      $or: [{ username: targetUsername }, { adminId: targetUsername }]
    }).select('+password');

    if (!superAdmin) {
      superAdmin = await SuperAdmin.create({
        adminId: targetUsername,
        username: targetUsername,
        password: pwdHash,
        name: targetUsername,
        role: 'param',
        email: 'info@krishub.in',
        phone: '9092024444',
        avatar: '/assets/profiles/avatar-Vyshwa-1792750287056.png',
        status: 'active'
      });
      pushLog('INFO', `Super Admin sector created with username: ${targetUsername}`);
    } else {
      let changed = false;
      if (superAdmin.username !== targetUsername || superAdmin.adminId !== targetUsername) {
        superAdmin.username = targetUsername;
        superAdmin.adminId = targetUsername;
        changed = true;
      }
      const isMatch = superAdmin.password ? await bcrypt.compare(targetPassword, superAdmin.password) : false;
      if (!isMatch) {
        superAdmin.password = pwdHash;
        superAdmin.tokenVersion = Number(superAdmin.tokenVersion || 0) + 1;
        changed = true;
      }
      if (changed) {
        await superAdmin.save();
        pushLog('INFO', `Super Admin sector synchronized from .env for "${targetUsername}"`);
      }
    }

    // 3. SECTOR 2: Company Owner (Isolated in User collection with role: 'owner')
    let companyOwner = await User.findOne({
      $or: [
        { userId: targetUsername },
        { username: targetUsername, role: 'owner' },
        { companyId: saCompany._id, role: 'owner' }
      ]
    }).select('+password');

    if (!companyOwner) {
      companyOwner = await User.create({
        userId: targetUsername,
        username: targetUsername,
        password: pwdHash,
        mustChangePassword: false,
        name: targetUsername,
        role: 'owner',
        company: saCompany.name,
        companyId: saCompany._id,
        status: 'active',
        joiningDate: new Date().toISOString().slice(0, 10)
      });
      pushLog('INFO', `Company Owner account created for "${targetUsername}" in company "${saCompany.name}"`);
    } else {
      let changed = false;
      if (companyOwner.role !== 'owner') {
        companyOwner.role = 'owner';
        changed = true;
      }
      if (companyOwner.username !== targetUsername || companyOwner.userId !== targetUsername) {
        companyOwner.username = targetUsername;
        companyOwner.userId = targetUsername;
        changed = true;
      }
      if (!companyOwner.companyId || String(companyOwner.companyId) !== String(saCompany._id)) {
        companyOwner.companyId = saCompany._id;
        companyOwner.company = saCompany.name;
        changed = true;
      }
      const isMatch = companyOwner.password ? await bcrypt.compare(targetPassword, companyOwner.password) : false;
      if (!isMatch) {
        companyOwner.password = pwdHash;
        companyOwner.tokenVersion = Number(companyOwner.tokenVersion || 0) + 1;
        changed = true;
      }
      if (changed) {
        await companyOwner.save();
        pushLog('INFO', `Company Owner account synchronized from .env for "${targetUsername}"`);
      }
    }

    // 4. Clean up any stray param records from User collection
    const cleaned = await User.deleteMany({ role: 'param' });
    if (cleaned.deletedCount > 0) {
      pushLog('WARN', `Removed ${cleaned.deletedCount} legacy param accounts from User collection`);
    }

    // 5. Also synchronize PostgreSQL AuthServiceAdmin if connected
    try {
      const { isPgConnected, query } = await import('./auth-integration/pgClient.js');
      if (await isPgConnected()) {
        await query(
          'UPDATE "AuthServiceAdmin" SET "passwordHash" = $1, "fullName" = $2, "updatedAt" = NOW() WHERE LOWER("fullName") = LOWER($2) OR LOWER("fullName") = \'vyshwa\'',
          [pwdHash, targetUsername]
        );
      }
    } catch {}

    pushLog('INFO', 'Super Admin and Company Owner sector check complete');
  } catch (e) {
    console.error('seedSuperAdmin failed:', e.message);
    pushLog('ERROR', 'seedSuperAdmin failed', e.message);
  }
}

async function seedMaintenanceMode() {
  try {
    const existing = await SystemSetting.findOne({ key: 'maintenance_mode' });
    if (!existing) {
      await SystemSetting.create({ key: 'maintenance_mode', value: false });
    }
  } catch (e) {
    console.error('seedMaintenanceMode failed:', e.message);
    pushLog('ERROR', 'seedMaintenanceMode failed', e.message);
  }
}

let dbInitDone = false;
async function runDbInit() {
  if (dbInitDone) return;
  dbInitDone = true;

  pushLog('INFO', 'MongoDB connection ready, executing startup tasks');
  await seedSuperAdmin();
  await seedMaintenanceMode();

  // Startup initialization complete

  try {
    await runBirthdayReminderJob();
    pushLog('CRON', 'Birthday reminder job initialized');
  } catch {
    // no-op
  }

  const scheduleDaily = () => {
    const now = new Date();
    const next = new Date(now);
    next.setDate(now.getDate() + 1);
    next.setHours(0, 5, 0, 0);
    const delay = Math.max(0, next.getTime() - now.getTime());
    setTimeout(async () => {
      try {
        await runBirthdayReminderJob();
        pushLog('CRON', 'Daily birthday reminder job executed');
      } catch {
        // no-op
      }
      scheduleDaily();
    }, delay);
  };

  scheduleDaily();

  isPgConnected().then(connected => {
    if (connected) {
      pushLog('INFO', 'PostgreSQL Auth Service connection established');
      console.log('PostgreSQL Auth Service (auth_service) connected successfully');
    } else {
      pushLog('WARN', 'PostgreSQL Auth Service not reachable at startup');
      console.warn('PostgreSQL Auth Service connection warning: service not reachable');
    }
    // Start background PostgreSQL user deletion & reconciliation worker
    startDeletionSyncWorker();
  }).catch(() => {});
}

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    pushLog('INFO', 'Database connection established', `URI: ${process.env.MONGODB_URI?.replace(/\/\/.*@/, '//***@')}`);
    await runDbInit();
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    pushLog('ERROR', 'Database connection failed', err.message);
  });

if (mongoose.connection.readyState === 1) {
  runDbInit();
} else {
  mongoose.connection.once('open', runDbInit);
}

// Routes
app.get('/', async (req, res) => {
  const is3004Up = await isPort3004Reachable().catch(() => false);
  const maint = await isMaintenanceMode().catch(() => false);
  if (!is3004Up || maint) {
    return res.status(503).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Server Under Maintenance</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { margin: 0; background: #111111; color: #ffffff; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui, -apple-system, sans-serif; text-align: center; }
            h1 { font-size: 2.5rem; font-weight: 800; margin: 0 0 1rem 0; color: #ffffff; }
            p { font-size: 1.125rem; color: #ffffff; opacity: 0.9; margin: 0; }
          </style>
        </head>
        <body>
          <div>
            <h1>Server Under Maintenance</h1>
            <p>Our services are currently undergoing maintenance. Please check back shortly.</p>
          </div>
        </body>
      </html>
    `);
  }
  res.send('ReGen Backend Running');
});

let _maintenanceCache = { value: false, ts: 0 };
const isMaintenanceMode = async (force = false) => {
  const is3004Up = await isPort3004Reachable(force);
  if (!is3004Up) return true;
  if (!force && (Date.now() - _maintenanceCache.ts < 2000)) return _maintenanceCache.value;
  const setting = await SystemSetting.findOne({ key: 'maintenance_mode' });
  _maintenanceCache = { value: setting?.value === true, ts: Date.now() };
  return _maintenanceCache.value;
};

// Monitor port 3004 reachability regularly
setInterval(() => {
  isPort3004Reachable(true).catch(() => {});
}, 1500);

// Auto-check and expire incomplete tasks every 3 seconds
setInterval(async () => {
  try {
    const activeTasks = await Task.find({
      status: { $nin: ['done', 'completed', 'not_completed', 'notCompleted'] }
    });
    for (const t of activeTasks) {
      if (isTaskExpired(t)) {
        await Task.updateOne({ _id: t._id }, { status: 'not_completed' });
        emitToCompany('task:change', t.companyId, { action: 'expired', id: t.id });
      }
    }
  } catch (err) {
    // ignore
  }
}, 3000);

// Maintenance status check endpoint (bypasses auth and maintenance check)
app.get('/api/system/maintenance', async (req, res) => {
  try {
    const is3004Up = await isPort3004Reachable(false);
    if (!is3004Up) {
      return res.status(503).json({ maintenance: true, portDown: true, message: 'Server Under Maintenance' });
    }
    const status = await isMaintenanceMode(false);
    if (status) {
      return res.status(503).json({ maintenance: true, message: 'Server Under Maintenance' });
    }
    res.json({ maintenance: false });
  } catch (e) {
    res.status(503).json({ maintenance: true, message: 'Server Under Maintenance', error: e.message });
  }
});

// Maintenance Mode Middleware — applied BEFORE all API operations (blocks with HTTP 503 if maintenance active)
app.use((req, res, next) => {
  const bypass = [
    '/api/health',
    '/api/system/maintenance'
  ];
  if (bypass.some(p => req.path.startsWith(p))) return next();
  maintenanceCheck(req, res, next);
});

// Rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 10 : 200, // 200 in dev
  message: { message: 'Too many attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const identifier = String(req.body?.identifier || '').trim();
    const password = String(req.body?.password || '');
    const portal = req.body?.portal || req.headers['x-portal-view'] || (req.headers.referer?.includes('/superadmin') ? 'superadmin' : 'company');
    if (!identifier || !password) {
      return res.status(400).json({ message: 'Identifier and password are required' });
    }

    // Maintenance Mode Check
    const maintenance = await isMaintenanceMode();

    // Authenticate across PostgreSQL (Auth Service) and MongoDB securely with isolated sector resolution
    const authResult = await authenticateUser({
      identifier,
      password,
      ipAddress: req.ip,
      deviceName: req.headers['user-agent'],
      portal
    });

    const user = authResult.user;

    // Maintenance check: only Super Admin (param) can login during maintenance
    if (maintenance && user.role !== 'param') {
      return res.status(503).json({ message: 'Maintenance Process Ongoing. Only Super Admin can login currently.' });
    }

    // Check if user is suspended
    if (user.role !== 'param' && user.status === 'inactive') {
      return res.status(403).json({ message: 'Your account has been suspended by the Super Admin. Please contact system administrator.', code: 'USER_SUSPENDED' });
    }

    // Resolve companyId if missing (for owner users)
    if (!user.companyId && user.role === 'owner') {
      const comp = await Company.findOne({ ownerId: user.userId });
      if (comp) {
        user.companyId = comp._id;
        await User.updateOne({ userId: user.userId }, { companyId: comp._id });
      }
    }

    // Check if user's company is blocked (skip for SuperAdmin/param)
    if (user.role !== 'param' && user.companyId) {
      const company = await Company.findById(user.companyId).lean();
      if (company && company.status === 'blocked') {
        return res.status(403).json({ message: 'Your company has been blocked. Please contact system admin (ReGen) for assistance.', code: 'COMPANY_BLOCKED' });
      }
    }

    // Update lastLogin and lastActive timestamps in the appropriate sector
    const loginNow = new Date();
    if (user.role === 'param') {
      const { default: SuperAdmin } = await import('./models/SuperAdmin.js');
      await SuperAdmin.updateOne({ _id: user._id }, { $set: { lastLogin: loginNow, lastActive: loginNow } });
    } else {
      await User.updateOne({ _id: user._id }, { $set: { lastLogin: loginNow, lastActive: loginNow } });
    }

    pushLog('AUTH', `User logged in: ${user.username}`, `role=${user.role}, portal=${portal}, source=${authResult.authSource}`);

    const token = authResult.token || signToken(user);
    res.status(200).json({
      _id: user._id,
      userId: user.userId,
      username: user.username,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      company: user.company,
      avatar: user.avatar,
      mustChangePassword: user.mustChangePassword || false,
      token,
      authSource: authResult.authSource
    });
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ message: e.message, code: e.code });
    }
    pushLog('WARN', 'Login error:', e.message);
    res.status(500).json({ message: e.message });
  }
});

app.post('/api/auth/change-password', authLimiter, async (req, res) => {
  try {
    const identifier = String(req.body?.identifier || '').trim();
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!identifier || !currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Identifier, currentPassword and newPassword are required' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ message: 'Password must be at least 4 characters' });
    }

    const user = await User.findOne({ $or: [{ userId: identifier }, { username: identifier }] }).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const stored = user.password ? String(user.password) : '';
    let ok = false;
    if (stored.startsWith('$2')) {
      ok = await bcrypt.compare(currentPassword, stored);
    } else {
      ok = stored === currentPassword;
    }
    if (!ok) return res.status(401).json({ message: 'Invalid current password' });

    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = newPassword === DEFAULT_PASSWORD;
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    await user.save();

    // Synchronize new password to PostgreSQL Auth Service
    syncMongoUserToPg(user, newPassword).catch(err => {
      console.warn('[AUTH-INTEGRATION] PG sync on password change failed:', err.message);
    });

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Admin resets a user's password directly (no admin password prompt needed)
app.post('/api/auth/admin-reset-password', verifyToken, async (req, res) => {
  try {
    const adminId = String(req.user?.userId || '').trim();
    const targetIdentifier = String(req.body?.targetIdentifier || '').trim();
    const newPassword = String(req.body?.newPassword || '') || DEFAULT_PASSWORD;

    if (!adminId || !targetIdentifier) {
      return res.status(400).json({ message: 'Admin header and targetIdentifier are required' });
    }

    const admin = await User.findOne({ $or: [{ userId: adminId }, { username: adminId }] });
    if (!admin || !['admin', 'owner', 'param'].includes(String(admin.role))) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const target = await User.findOne({ $or: [{ userId: targetIdentifier }, { username: targetIdentifier }] }).select('+password');
    if (!target) return res.status(404).json({ message: 'Target user not found' });

    // Company isolation: non-param admins can only reset users in their own company
    if (admin.role !== 'param') {
      const adminCid = admin.companyId ? admin.companyId.toString() : null;
      const targetCid = target.companyId ? target.companyId.toString() : null;
      if (!adminCid || !targetCid || adminCid !== targetCid) {
        return res.status(403).json({ message: 'Cannot reset password for users in another company' });
      }
    }

    target.password = await bcrypt.hash(newPassword, 10);
    target.mustChangePassword = newPassword === DEFAULT_PASSWORD;
    target.resetTokenHash = undefined;
    target.resetTokenExpiresAt = undefined;
    await target.save();

    // Synchronize new password to PostgreSQL Auth Service
    syncMongoUserToPg(target, newPassword).catch(err => {
      console.warn('[AUTH-INTEGRATION] PG sync on admin password reset failed:', err.message);
    });

    res.status(200).json({ message: `Password reset to "${newPassword}" successfully` });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post('/api/auth/reset-link', authLimiter, async (req, res) => {
  try {
    const adminIdentifier = String(req.body?.adminIdentifier || '').trim();
    const adminPassword = String(req.body?.adminPassword || '');
    const targetIdentifier = String(req.body?.targetIdentifier || '').trim();
    if (!adminIdentifier || !adminPassword || !targetIdentifier) {
      return res.status(400).json({ message: 'adminIdentifier, adminPassword and targetIdentifier are required' });
    }

    const admin = await User.findOne({ $or: [{ userId: adminIdentifier }, { username: adminIdentifier }] }).select('+password');
    if (!admin) return res.status(401).json({ message: 'Invalid admin credentials' });

    const adminStored = admin.password ? String(admin.password) : '';
    const adminOk = adminStored.startsWith('$2')
      ? await bcrypt.compare(adminPassword, adminStored)
      : (adminStored === adminPassword);
    if (!adminOk) return res.status(401).json({ message: 'Invalid admin credentials' });
    if (!['admin', 'owner', 'param'].includes(String(admin.role))) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const target = await User.findOne({ $or: [{ userId: targetIdentifier }, { username: targetIdentifier }] }).select('+resetTokenHash');
    if (!target) return res.status(404).json({ message: 'Target user not found' });

    // Company isolation: non-param admins can only generate reset links for their own company's users
    if (admin.role !== 'param') {
      const adminCid = admin.companyId ? admin.companyId.toString() : null;
      const targetCid = target.companyId ? target.companyId.toString() : null;
      if (!adminCid || !targetCid || adminCid !== targetCid) {
        return res.status(403).json({ message: 'Cannot reset password for users in another company' });
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    target.resetTokenHash = tokenHash;
    target.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await target.save();

    const base = process.env.FRONTEND_BASE_URL || `https://regen.krishub.in`;
    const link = `${base}/?resetToken=${token}`;
    res.status(200).json({ link, expiresInMinutes: 60 });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'token and newPassword are required' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ message: 'Password must be at least 4 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetTokenHash: tokenHash,
      resetTokenExpiresAt: { $gt: new Date() }
    }).select('+resetTokenHash +password');
    if (!user) return res.status(400).json({ message: 'Invalid or expired reset token' });

    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = newPassword === DEFAULT_PASSWORD;
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    await user.save();

    res.status(200).json({ message: 'Password reset successfully', userId: user.userId });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Health check: BEFORE auth so external monitoring can reach it
app.get('/api/health', (req, res) => {
  try {
    const state = mongoose.connection.readyState; // 1=connected
    res.json({
      status: 'ok',
      mongoConnected: state === 1,
      mongoState: state,
      port: PORT
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// JWT Authentication Middleware — applies to all routes below
app.use(verifyToken);
// Company data isolation — resolves companyId for the current user
app.use(companyScope);

// Switch from Super Admin console to Company Owner (EMS App)
app.post('/api/auth/switch-to-ems', async (req, res) => {
  try {
    if (req.user?.role !== 'param') {
      return res.status(403).json({ message: 'Only Super Admin can switch to EMS Company Owner mode' });
    }
    const targetUsername = (process.env.SUPER_ADMIN_USERNAME || 'Vyshwa').trim();
    let saCompany = await Company.findOne({ ownerId: targetUsername });
    if (!saCompany) {
      saCompany = await Company.findOne({ name: 'krish Tech Computer' });
    }
    if (!saCompany) {
      saCompany = await Company.create({
        name: 'krish Tech Computer',
        phoneNumber: '9092024444',
        email: 'info@krishub.in',
        city: 'CBE',
        category: 'it',
        ownerId: targetUsername,
        ownerName: targetUsername,
        status: 'active',
        companyPolicies: []
      });
    }

    let companyOwner = await User.findOne({
      $or: [
        { userId: targetUsername },
        { username: targetUsername, role: 'owner' },
        { companyId: saCompany._id, role: 'owner' }
      ]
    }).select('+password');

    const targetPassword = (process.env.SUPER_ADMIN_PASSWORD || 'S@@ttv1k@').trim();
    const ownerPwdHash = await bcrypt.hash(targetPassword, 10);

    if (!companyOwner) {
      companyOwner = await User.create({
        userId: targetUsername,
        username: targetUsername,
        password: ownerPwdHash,
        mustChangePassword: false,
        name: targetUsername,
        role: 'owner',
        company: saCompany.name,
        companyId: saCompany._id,
        status: 'active',
        joiningDate: new Date().toISOString().slice(0, 10)
      });
    } else {
      if (companyOwner.role !== 'owner' || companyOwner.companyId?.toString() !== saCompany._id.toString()) {
        companyOwner.role = 'owner';
        companyOwner.companyId = saCompany._id;
        companyOwner.company = saCompany.name;
        await companyOwner.save();
      }
    }

    const token = signToken({
      userId: companyOwner.userId,
      username: companyOwner.username,
      role: 'owner',
      companyId: companyOwner.companyId,
      tokenVersion: companyOwner.tokenVersion
    });

    res.status(200).json({
      _id: companyOwner._id,
      userId: companyOwner.userId,
      username: companyOwner.username,
      name: companyOwner.name,
      role: 'owner',
      companyId: companyOwner.companyId,
      company: companyOwner.company,
      avatar: companyOwner.avatar,
      token,
      redirect: '/?view=ems'
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Switch from Company Owner back to Super Admin console
app.post('/api/auth/switch-to-superadmin', async (req, res) => {
  try {
    const targetUsername = (process.env.SUPER_ADMIN_USERNAME || 'Vyshwa').trim();
    const isSaUser = req.user?.username?.toLowerCase() === targetUsername.toLowerCase() ||
                     req.user?.userId?.toLowerCase() === targetUsername.toLowerCase() ||
                     req.user?.role === 'param';

    if (!isSaUser) {
      return res.status(403).json({ message: 'Unauthorized to switch to Super Admin console' });
    }

    const { default: SuperAdmin } = await import('./models/SuperAdmin.js');
    let sa = await SuperAdmin.findOne({
      $or: [{ adminId: targetUsername }, { username: targetUsername }]
    });

    if (!sa) {
      const targetPassword = (process.env.SUPER_ADMIN_PASSWORD || 'S@@ttv1k@').trim();
      const pwdHash = await bcrypt.hash(targetPassword, 10);
      sa = await SuperAdmin.create({
        adminId: targetUsername,
        username: targetUsername,
        password: pwdHash,
        name: targetUsername,
        role: 'param',
        email: 'info@krishub.in',
        phone: '9092024444',
        status: 'active'
      });
    }

    const token = signToken({
      userId: sa.adminId,
      username: sa.username,
      role: 'param',
      companyId: null,
      tokenVersion: sa.tokenVersion
    });

    res.status(200).json({
      _id: sa._id,
      userId: sa.adminId,
      username: sa.username,
      name: sa.name,
      role: 'param',
      companyId: null,
      company: 'ReGen Central',
      avatar: sa.avatar,
      token,
      redirect: '/superadmin'
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Dedicated Super Admin Profile Get
app.get('/api/superadmin/profile', async (req, res) => {
  try {
    if (req.user?.role !== 'param') {
      return res.status(403).json({ message: 'Super Admin access required' });
    }
    const { default: SuperAdmin } = await import('./models/SuperAdmin.js');
    const sa = await SuperAdmin.findOne({
      $or: [{ adminId: req.user.userId }, { username: req.user.username }]
    }).lean();
    if (!sa) return res.status(404).json({ message: 'Super Admin record not found' });
    res.status(200).json({
      _id: sa._id,
      userId: sa.adminId,
      username: sa.username,
      name: sa.name,
      role: 'param',
      companyId: null,
      company: 'ReGen Central',
      email: sa.email,
      phone: sa.phone,
      designation: sa.designation,
      department: sa.department,
      avatar: sa.avatar,
      status: sa.status
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Dedicated Super Admin Profile Update (Only touches SuperAdmin sector)
app.put('/api/superadmin/profile', async (req, res) => {
  try {
    if (req.user?.role !== 'param') {
      return res.status(403).json({ message: 'Super Admin access required' });
    }
    const { default: SuperAdmin } = await import('./models/SuperAdmin.js');
    const sa = await SuperAdmin.findOne({
      $or: [{ adminId: req.user.userId }, { username: req.user.username }]
    });
    if (!sa) return res.status(404).json({ message: 'Super Admin record not found' });
    if (req.body.name !== undefined) sa.name = req.body.name;
    if (req.body.email !== undefined) sa.email = req.body.email;
    if (req.body.phone !== undefined) sa.phone = req.body.phone;
    if (req.body.designation !== undefined) sa.designation = req.body.designation;
    if (req.body.department !== undefined) sa.department = req.body.department;
    if (req.body.avatar !== undefined) sa.avatar = req.body.avatar;
    await sa.save();
    res.status(200).json({
      _id: sa._id,
      userId: sa.adminId,
      username: sa.username,
      name: sa.name,
      role: 'param',
      companyId: null,
      company: 'ReGen Central',
      email: sa.email,
      phone: sa.phone,
      designation: sa.designation,
      department: sa.department,
      avatar: sa.avatar,
      status: sa.status
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Dedicated Super Admin Avatar Upload (Only touches SuperAdmin sector)
app.post('/api/superadmin/avatar', (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5MB)' : err.message });
    }
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (req.user?.role !== 'param') {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: 'Super Admin access required' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const avatarPath = `/assets/profiles/${req.file.filename}`;
    try {
      const uploadCopy = path.join(uploadsDir, req.file.filename);
      fs.copyFileSync(req.file.path, uploadCopy);
    } catch {}

    const { default: SuperAdmin } = await import('./models/SuperAdmin.js');
    const sa = await SuperAdmin.findOneAndUpdate(
      { $or: [{ adminId: req.user.userId }, { username: req.user.username }] },
      { avatar: avatarPath, lastAvatarUpdate: new Date() },
      { new: true }
    );
    res.status(200).json({
      message: 'Super Admin avatar updated successfully',
      avatar: avatarPath,
      user: {
        userId: sa.adminId,
        username: sa.username,
        name: sa.name,
        avatar: sa.avatar
      }
    });
  } catch (err) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/users/:userId/avatar', (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5MB)' : err.message });
    }
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const userId = req.params.userId;
    const isSuperAdmin = req.user?.role === 'param';

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const avatarPath = `/assets/profiles/${req.file.filename}`;
    try {
      const uploadCopy = path.join(uploadsDir, req.file.filename);
      fs.copyFileSync(req.file.path, uploadCopy);
    } catch (e) {}

    // If caller is Super Admin updating their own profile, update SuperAdmin collection ONLY
    if (isSuperAdmin && (userId === req.user?.userId || userId === req.user?.username)) {
      const { default: SuperAdmin } = await import('./models/SuperAdmin.js');
      const sa = await SuperAdmin.findOneAndUpdate(
        { $or: [{ adminId: userId }, { username: userId }] },
        { avatar: avatarPath, lastAvatarUpdate: new Date() },
        { new: true }
      );
      return res.status(200).json({
        message: 'Super Admin avatar updated successfully',
        avatar: avatarPath,
        user: {
          userId: sa.adminId,
          username: sa.username,
          name: sa.name,
          avatar: sa.avatar
        }
      });
    }

    const filter = { userId };
    if (req.companyId && !isSuperAdmin) filter.companyId = req.companyId;
    const existingUser = await User.findOne(filter);
    if (!existingUser) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Update user's avatar field in User collection
    const avatarFilter = { userId };
    if (req.companyId && !isSuperAdmin) avatarFilter.companyId = req.companyId;
    const user = await User.findOneAndUpdate(
      avatarFilter,
      { avatar: avatarPath, lastAvatarUpdate: new Date() },
      { new: true }
    );
    if (user && user.companyId && user.role === 'owner') {
      await Company.findByIdAndUpdate(user.companyId, { logo: avatarPath }).catch(() => {});
    }
    
    res.status(200).json({ 
      message: 'Avatar uploaded successfully', 
      avatar: avatarPath,
      user: {
        userId: user.userId,
        username: user.username,
        name: user.name,
        avatar: user.avatar
      }
    });
  } catch (error) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ message: error.message });
  }
});

// Company Logo Upload Endpoint
app.post(['/api/company/:companyId/logo', '/api/company/logo'], (req, res, next) => {
  upload.single('logo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5MB)' : err.message });
    }
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const companyId = req.params.companyId || req.companyId;
    if (!companyId) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Company ID is required' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const logoPath = `/assets/profiles/${req.file.filename}`;
    try {
      const uploadCopy = path.join(uploadsDir, req.file.filename);
      fs.copyFileSync(req.file.path, uploadCopy);
    } catch (e) {}

    const company = await Company.findByIdAndUpdate(
      companyId,
      { logo: logoPath },
      { new: true }
    );
    if (!company) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'Company not found' });
    }

    await User.updateMany(
      { $or: [{ userId: company.ownerId }, { companyId: company._id, role: 'owner' }] },
      { $set: { avatar: logoPath } }
    ).catch(() => {});

    res.status(200).json({
      message: 'Company logo uploaded successfully',
      logo: logoPath,
      company
    });
  } catch (error) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ message: error.message });
  }
});

// Protected API routes (all behind verifyToken + companyScope + maintenanceCheck)
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/leaves', leavesRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/dm', dmRoutes);
app.use('/api/meeting-notes', meetingNoteRoutes);
app.use('/api/scrum', scrumRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/projects', projectRoutes);

// === SuperAdmin Deploy Endpoints ===
const execAsync = promisify(exec);

const REPO_DIR = process.env.REPO_DIR || '/home/vyshwa/web/reGen';
const LIVE_DIR = process.env.LIVE_DIR || '/web/regen_live';

const isSuperAdmin = (req) => req.user?.role === 'param';

const verifySuperAdminOtp = (otpCode) => {
  const secret = process.env.TOTP_SECRET;
  if (!secret) {
    return { ok: false, status: 500, message: 'TOTP not configured on server' };
  }
  const token = String(otpCode || '').trim();
  if (!token) {
    return { ok: false, status: 400, message: 'Authenticator code is required' };
  }

  
  const totp = new TOTP({ issuer: 'reGen', label: 'SuperAdmin', secret, algorithm: 'SHA1', digits: 6, period: 30 });
  const delta = totp.validate({ token, window: 1 });
  if (delta === null) {
    return { ok: false, status: 403, message: 'Invalid authenticator code' };
  }
  return { ok: true };
};

app.post('/api/deploy/git-pull', async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: 'Forbidden' });
  const otp = verifySuperAdminOtp(req.body?.otpCode);
  if (!otp.ok) return res.status(otp.status).json({ message: otp.message });
  try {
    const { stdout, stderr } = await execAsync('git pull origin main', { cwd: REPO_DIR, timeout: 30000 });
    res.json({ success: true, output: stdout + (stderr || '') });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message, output: e.stderr || e.stdout || '' });
  }
});

app.post('/api/deploy/rebuild', async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: 'Forbidden' });
  const otp = verifySuperAdminOtp(req.body?.otpCode);
  if (!otp.ok) return res.status(otp.status).json({ message: otp.message });
  try {
    // 1. Build frontend
    const buildResult = await execAsync('npm run build', { cwd: path.join(REPO_DIR, 'frontend'), timeout: 120000 });

    // 2. Sync to live directory (nginx root)
    await execAsync(`rm -rf ${LIVE_DIR}/assets ${LIVE_DIR}/index.html ${LIVE_DIR}/logo.png`, { cwd: REPO_DIR });
    await execAsync(`cp -r ${REPO_DIR}/frontend/dist/* ${LIVE_DIR}/`, { cwd: REPO_DIR });
    await execAsync(`cp -r ${REPO_DIR}/server/* ${LIVE_DIR}/server/`, { cwd: REPO_DIR });

    // 3. Install server deps if needed
    await execAsync('npm install --production', { cwd: path.join(LIVE_DIR, 'server'), timeout: 60000 });

    res.json({ success: true, output: 'Build & deploy complete.\n' + buildResult.stdout });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message, output: e.stderr || e.stdout || '' });
  }
});

// === SuperAdmin System Control ===
app.post('/api/system/maintenance/toggle', async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: 'Forbidden' });
  const otp = verifySuperAdminOtp(req.body?.otpCode);
  if (!otp.ok) return res.status(otp.status).json({ message: otp.message });
  try {
    const current = await isMaintenanceMode();
    await SystemSetting.findOneAndUpdate(
      { key: 'maintenance_mode' },
      { value: !current },
      { upsert: true }
    );
    pushLog('SYSTEM', `Maintenance mode ${!current ? 'ENABLED' : 'DISABLED'}`, `by Super Admin`);
    _maintenanceCache = { value: !current, ts: Date.now() }; // update cache immediately
    res.json({ success: true, maintenance: !current });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
// === System Logs API ===
app.get('/api/system/logs', (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: 'Forbidden' });
  const limit = parseInt(req.query.limit) || 50;
  res.json({ logs: systemLogs.slice(0, limit), total: systemLogs.length });
});

app.get('/api/system/logs/download', (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: 'Forbidden' });
  const lines = systemLogs
    .map(e => `[${e.ts}] [${e.level.padEnd(6)}] ${e.message}${e.meta ? ' | ' + e.meta : ''}`)
    .join('\n');
  const filename = `regen-system-logs-${new Date().toISOString().split('T')[0]}.txt`;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(lines);
});

// === Critical Actions ===
app.post('/api/system/flush-cache', async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: 'Forbidden' });
  const otp = verifySuperAdminOtp(req.body?.otpCode);
  if (!otp.ok) return res.status(otp.status).json({ message: otp.message });
  try {
    pushLog('SYSTEM', 'System cache flush requested by Super Admin');
    res.json({ success: true, message: 'System cache flushed successfully' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post('/api/system/restart', async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: 'Forbidden' });
  const otp = verifySuperAdminOtp(req.body?.otpCode);
  if (!otp.ok) return res.status(otp.status).json({ message: otp.message });
  try {
    pushLog('SYSTEM', 'Module restart triggered by Super Admin');
    res.json({ success: true, message: 'Restarting modules... System will be back in a few seconds.' });
    
    // Graceful exit - assuming PM2 or similar will restart the process
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get('/api/system/pm2-status', async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: 'Forbidden' });
  try {
    const { stdout } = await execAsync('pm2 jlist', { timeout: 5000 });
    const processes = JSON.parse(stdout);
    const data = processes.map(p => ({
      name: p.name,
      pid: p.pid,
      status: p.pm2_env?.status || 'unknown',
      cpu: p.monit?.cpu ?? 0,
      memory: p.monit?.memory ?? 0,
      uptime: p.pm2_env?.pm_uptime ?? 0,
      restarts: p.pm2_env?.restart_time ?? 0,
      version: p.pm2_env?.version || '—',
      node: p.pm2_env?.node_version || '—',
      mode: p.pm2_env?.exec_mode === 'cluster_mode' ? 'cluster' : 'fork',
    }));
    res.json({ success: true, processes: data, timestamp: Date.now() });
  } catch (e) {
    const mem = process.memoryUsage();
    res.json({
      success: true,
      pm2Active: false,
      processes: [{
        name: 'regen-backend',
        pid: process.pid,
        status: 'online',
        cpu: 0,
        memory: mem.rss || 0,
        uptime: Date.now() - Math.floor(process.uptime() * 1000),
        restarts: 0,
        version: process.version,
        node: process.version,
        mode: 'standalone (node)',
        note: 'Standalone Node process active'
      }],
      timestamp: Date.now()
    });
  }
});

app.post('/api/system/factory-reset', async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: 'Forbidden' });
  const otp = verifySuperAdminOtp(req.body?.otpCode);
  if (!otp.ok) return res.status(otp.status).json({ message: otp.message });
  try {
    // 1. Clear all major collections
    const collections = mongoose.connection.collections;
    
    for (const key in collections) {
      if (key === 'users') {
        // Keep only the Super Admin
        await User.deleteMany({ username: { $ne: SUPER_ADMIN_USERNAME } });
      } else if (key === 'systemsettings') {
        // Keep maintenance mode setting
        await SystemSetting.deleteMany({ key: { $ne: 'maintenance_mode' } });
      } else {
        await collections[key].deleteMany({});
      }
    }
    
    pushLog('CRITICAL', 'Factory Global Reset executed by Super Admin — all data wiped');
    res.json({ success: true, message: 'Factory Global Reset completed. All data except Super Admin has been wiped.' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Global error handler — prevent leaking internal details to clients
app.use((err, req, res, _next) => {
  pushLog('ERROR', `Unhandled: ${req.method} ${req.path}`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

const server = http.createServer(app);
initSocketIO(server);

// Graceful shutdown
const shutdown = (signal) => {
  pushLog('SYSTEM', `${signal} received — shutting down gracefully`);
  server.close(() => {
    mongoose.connection.close(false).then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000); // force exit after 10s
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[PORT CONFLICT] Port ${PORT} is already in use by another running process.`);
    console.error(`Please terminate the conflicting process or choose a different port.\n`);
  } else {
    console.error('Server startup error:', err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (with WebSocket)`);
  pushLog('INFO', `Server listening on port ${PORT}`);
});
