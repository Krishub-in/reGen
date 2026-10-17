import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/User.js';
import Company from '../models/Company.js';
import { query, isPgConnected } from './pgClient.js';
import { REGEN_APP_ID, REGEN_ROLE_IDS, syncMongoUserToPg } from './pgSyncService.js';
import { reconcileSingleUser } from './pgDeletionSyncService.js';
import { signToken } from '../middleware/authJwt.js';

/**
 * Map PostgreSQL AppRole code back to MERN role
 */
function mapAppRoleCodeToMongo(code) {
  const c = String(code || '').toUpperCase();
  if (c === 'ADMIN') return 'admin';
  if (c === 'OWNER') return 'owner';
  if (c === 'INTERN') return 'intern';
  if (c === 'PARAM' || c === 'SUPER_ADMIN') return 'param';
  return 'staff';
}

/**
 * Dual Database Authentication Service
 * Validates credentials across PostgreSQL (auth_service) and MongoDB (reGen),
 * respects blocked/inactive states, ensures Super Admin compatibility, and
 * issues secure MERN JWTs with trusted claims.
 */
export async function authenticateUser({ identifier, password, ipAddress = null, deviceName = null }) {
  const cleanId = String(identifier || '').trim();
  const cleanPwd = String(password || '');

  if (!cleanId || !cleanPwd) {
    const err = new Error('Identifier and password are required');
    err.statusCode = 400;
    throw err;
  }

  // Check PG connectivity
  let pgAvailable = false;
  try {
    pgAvailable = await isPgConnected();
  } catch {
    pgAvailable = false;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SUPER ADMIN CHECK (AuthServiceAdmin in PG & Mongo Param)
  // ─────────────────────────────────────────────────────────────────────────────
  if (pgAvailable) {
    try {
      const adminRes = await query(
        'SELECT id, email, "passwordHash", "fullName", "isActive" FROM "AuthServiceAdmin" WHERE LOWER(email) = LOWER($1)',
        [cleanId]
      );
      if (adminRes.rows.length > 0) {
        const admin = adminRes.rows[0];
        if (!admin.isActive) {
          const err = new Error('Super Admin account is deactivated in Auth Service');
          err.statusCode = 403;
          throw err;
        }

        const adminMatch = await bcrypt.compare(cleanPwd, admin.passwordHash);
        if (adminMatch) {
          // Find or sync corresponding Super Admin in MongoDB
          let mongoAdmin = await User.findOne({
            $or: [{ email: admin.email }, { role: 'param' }, { username: 'Vyshwa' }]
          });

          if (!mongoAdmin) {
            mongoAdmin = await User.create({
              userId: admin.id || 'superadmin-pg',
              username: admin.fullName || 'Vyshwa',
              email: admin.email,
              name: admin.fullName,
              role: 'param',
              status: 'active',
              mustChangePassword: false,
              joiningDate: new Date().toISOString()
            });
          }

          const token = signToken(mongoAdmin);
          return {
            user: mongoAdmin,
            token,
            authSource: 'postgresql:AuthServiceAdmin'
          };
        }
      }
    } catch (err) {
      if (err.statusCode) throw err;
      console.warn('[AUTH-INTEGRATION] AuthServiceAdmin check notice:', err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. QUERY BOTH DATABASES FOR USER ACCOUNT
  // ─────────────────────────────────────────────────────────────────────────────
  const escaped = cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const idRegex = new RegExp(`^${escaped}$`, 'i');

  const mongoUserPromise = User.findOne({
    $or: [
      { userId: idRegex },
      { username: idRegex },
      { email: idRegex },
      { phone: idRegex }
    ]
  }).select('+password');

  let pgUserPromise = Promise.resolve(null);
  if (pgAvailable) {
    pgUserPromise = query(
      `SELECT u.id, u.email, u.phone, u."passwordHash", u."firstName", u."lastName", 
              u."isBlocked", u."extraData", a."appRoleId", r.code as role_code, 
              a."isActive" as app_access_active
       FROM "User" u
       JOIN "UserAppAccess" a ON u.id = a."userId" AND a."appId" = $1
       JOIN "AppRole" r ON a."appRoleId" = r.id
       WHERE LOWER(u.email) = LOWER($2) 
          OR u.phone = $2 
          OR u."extraData"->>'userId' = $2 
          OR u."extraData"->>'username' = $2`,
      [REGEN_APP_ID, cleanId]
    ).then(res => res.rows[0] || null).catch(err => {
      console.error('[AUTH-INTEGRATION] PG user lookup error:', err.message);
      return null;
    });
  }

  const [mongoUser, pgUser] = await Promise.all([mongoUserPromise, pgUserPromise]);

  // If neither database has this identifier
  if (!mongoUser && !pgUser) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. CASE: ACCOUNT FOUND IN BOTH DATABASES
  // ─────────────────────────────────────────────────────────────────────────────
  if (mongoUser && pgUser) {
    // Check account status across both
    if (mongoUser.status === 'inactive') {
      const err = new Error('Your account is deactivated in MERN');
      err.statusCode = 403;
      throw err;
    }
    if (pgUser.isBlocked) {
      if (mongoUser.role !== 'param') {
        mongoUser.status = 'inactive';
        mongoUser.tokenVersion = Number(mongoUser.tokenVersion || 0) + 1;
        await mongoUser.save();
      }
      const err = new Error('Your account is blocked in PostgreSQL Auth Service');
      err.statusCode = 403;
      throw err;
    }
    if (!pgUser.app_access_active) {
      if (mongoUser.role !== 'param') {
        mongoUser.status = 'inactive';
        mongoUser.tokenVersion = Number(mongoUser.tokenVersion || 0) + 1;
        await mongoUser.save();
      }
      const err = new Error('Your access to ReGen application is revoked in Auth Service');
      err.statusCode = 403;
      throw err;
    }

    // Verify password against Mongo password
    let valid = false;
    if (mongoUser.password) {
      valid = await bcrypt.compare(cleanPwd, mongoUser.password);
    }
    // Also try PG password if Mongo didn't match (in case changed in Auth Service)
    if (!valid && pgUser.passwordHash) {
      valid = await bcrypt.compare(cleanPwd, pgUser.passwordHash);
      if (valid) {
        // Sync new password to MongoDB safely
        mongoUser.password = await bcrypt.hash(cleanPwd, 10);
        await mongoUser.save();
      }
    }

    if (!valid) {
      const err = new Error('Invalid credentials');
      err.statusCode = 401;
      throw err;
    }

    // Passwords match and active in both
    const token = signToken(mongoUser);
    return {
      user: mongoUser,
      token,
      authSource: 'dual:synchronized'
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. CASE: ACCOUNT FOUND IN MONGODB ONLY
  // ─────────────────────────────────────────────────────────────────────────────
  if (mongoUser && !pgUser) {
    if (mongoUser.status === 'inactive') {
      const err = new Error('Your account is deactivated');
      err.statusCode = 403;
      throw err;
    }

    // If this user was previously synchronized to PostgreSQL, verify whether their PG account/access was revoked
    if (pgAvailable && (mongoUser.syncedWithPg || mongoUser.pgUserId) && mongoUser.role !== 'param') {
      const outcome = await reconcileSingleUser(mongoUser);
      if (outcome.status === 'MISSING_PG_USER') {
        const err = new Error('Your account was deleted from Auth Service');
        err.statusCode = 403;
        throw err;
      }
      if (outcome.status === 'BLOCKED_PG_USER') {
        const err = new Error('Your account is blocked in PostgreSQL Auth Service');
        err.statusCode = 403;
        throw err;
      }
      if (outcome.status === 'REVOKED_APP_ACCESS') {
        const err = new Error('Your access to ReGen application was revoked in Auth Service');
        err.statusCode = 403;
        throw err;
      }
    }

    let valid = false;
    if (mongoUser.password) {
      valid = await bcrypt.compare(cleanPwd, mongoUser.password);
      if (!valid && mongoUser.password === cleanPwd) valid = true;
    }

    if (!valid) {
      const err = new Error('Invalid credentials');
      err.statusCode = 401;
      throw err;
    }

    // Truly local MongoDB user: synchronize account into PostgreSQL in background
    if (pgAvailable && !mongoUser.syncedWithPg) {
      syncMongoUserToPg(mongoUser, cleanPwd).catch(err => {
        console.warn('[AUTH-INTEGRATION] Background sync to PG failed:', err.message);
      });
    }

    const token = signToken(mongoUser);
    return {
      user: mongoUser,
      token,
      authSource: 'mongodb:primary'
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. CASE: ACCOUNT FOUND IN POSTGRESQL ONLY
  // ─────────────────────────────────────────────────────────────────────────────
  if (!mongoUser && pgUser) {
    if (pgUser.isBlocked) {
      const err = new Error('Your account is blocked in PostgreSQL Auth Service');
      err.statusCode = 403;
      throw err;
    }
    if (!pgUser.app_access_active) {
      const err = new Error('Your access to ReGen application is revoked in Auth Service');
      err.statusCode = 403;
      throw err;
    }

    const valid = await bcrypt.compare(cleanPwd, pgUser.passwordHash);
    if (!valid) {
      const err = new Error('Invalid credentials');
      err.statusCode = 401;
      throw err;
    }

    // Verified in PostgreSQL: provision corresponding record in MongoDB
    const mappedRole = mapAppRoleCodeToMongo(pgUser.role_code);
    const newUserId = pgUser.extraData?.userId || `user-${crypto.randomUUID().slice(0, 8)}`;
    const newUsername = pgUser.extraData?.username || pgUser.email || newUserId;
    const fullName = `${pgUser.firstName || ''} ${pgUser.lastName || ''}`.trim() || newUsername;

    const hashedPassword = await bcrypt.hash(cleanPwd, 10);
    const createdMongoUser = await User.create({
      userId: newUserId,
      StaffId: newUserId,
      username: newUsername,
      email: pgUser.email || undefined,
      phone: pgUser.phone || undefined,
      name: fullName,
      password: hashedPassword,
      role: mappedRole,
      status: 'active',
      mustChangePassword: false,
      companyId: pgUser.extraData?.companyId || undefined,
      company: pgUser.extraData?.companyName || undefined,
      joiningDate: new Date().toISOString()
    });

    const token = signToken(createdMongoUser);
    return {
      user: createdMongoUser,
      token,
      authSource: 'postgresql:provisioned'
    };
  }

  const err = new Error('Invalid credentials');
  err.statusCode = 401;
  throw err;
}
