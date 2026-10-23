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
export async function authenticateUser({ identifier, password, ipAddress = null, deviceName = null, portal = 'company' }) {
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
  // 1. SUPER ADMIN / COMPANY OWNER CREDENTIAL CHECK (ENV ENFORCED)
  // ─────────────────────────────────────────────────────────────────────────────
  const targetSaUsername = (process.env.SUPER_ADMIN_USERNAME || 'Vyshwa').trim();
  const targetSaPassword = (process.env.SUPER_ADMIN_PASSWORD || 'S@@ttv1k@').trim();
  const isSaIdentifier = 
    cleanId.toLowerCase() === targetSaUsername.toLowerCase() ||
    cleanId.toLowerCase() === 'info@krishub.in' ||
    cleanId.toLowerCase() === 'admin@krishub.in';

  if (isSaIdentifier) {
    if (cleanPwd !== targetSaPassword) {
      // Old password or wrong password must NEVER work
      const err = new Error('Invalid credentials');
      err.statusCode = 401;
      throw err;
    }

    // 1A. Ensure Super Admin's company exists
    let saCompany = await Company.findOne({ ownerId: targetSaUsername });
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
        ownerId: targetSaUsername,
        ownerName: targetSaUsername,
        status: 'active',
        companyPolicies: []
      });
    }

    const { default: SuperAdmin } = await import('../models/SuperAdmin.js');

    // ─────────────────────────────────────────────────────────────────────────
    // CASE A: LOGGING IN THROUGH SUPER ADMIN PORTAL
    // Returns isolated SuperAdmin record with role 'param'
    // ─────────────────────────────────────────────────────────────────────────
    if (portal === 'superadmin') {
      let superAdmin = await SuperAdmin.findOne({
        $or: [{ username: targetSaUsername }, { adminId: targetSaUsername }]
      }).select('+password');

      const pwdHash = await bcrypt.hash(cleanPwd, 10);
      if (!superAdmin) {
        superAdmin = await SuperAdmin.create({
          adminId: targetSaUsername,
          username: targetSaUsername,
          password: pwdHash,
          name: targetSaUsername,
          role: 'param',
          email: 'info@krishub.in',
          phone: '9092024444',
          avatar: '',
          status: 'active'
        });
      } else {
        let changed = false;
        if (superAdmin.username !== targetSaUsername || superAdmin.adminId !== targetSaUsername) {
          superAdmin.username = targetSaUsername;
          superAdmin.adminId = targetSaUsername;
          changed = true;
        }
        const isHashMatch = superAdmin.password ? await bcrypt.compare(cleanPwd, superAdmin.password) : false;
        if (!isHashMatch) {
          superAdmin.password = pwdHash;
          superAdmin.tokenVersion = Number(superAdmin.tokenVersion || 0) + 1;
          changed = true;
        }
        if (changed) {
          await superAdmin.save();
        }
      }

      if (pgAvailable) {
        try {
          await query(
            'UPDATE "AuthServiceAdmin" SET "passwordHash" = $1, "updatedAt" = NOW() WHERE LOWER("fullName") = LOWER($2) OR LOWER("fullName") = \'vyshwa\' OR LOWER("email") = \'info@krishub.in\'',
            [pwdHash, targetSaUsername]
          );
        } catch {}
      }

      const token = signToken({
        userId: superAdmin.adminId,
        username: superAdmin.username,
        role: 'param',
        companyId: null,
        tokenVersion: superAdmin.tokenVersion
      });

      return {
        user: {
          _id: superAdmin._id,
          userId: superAdmin.adminId,
          username: superAdmin.username,
          name: superAdmin.name,
          role: 'param',
          companyId: null,
          company: 'ReGen Central',
          avatar: superAdmin.avatar,
          email: superAdmin.email,
          phone: superAdmin.phone,
          designation: superAdmin.designation,
          department: superAdmin.department,
          mustChangePassword: false,
          token
        },
        token,
        authSource: 'superadmin:isolated_sector'
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE B: LOGGING IN THROUGH NORMAL COMPANY LOGIN
    // Acts strictly as Company Owner (role 'owner') of his company
    // ─────────────────────────────────────────────────────────────────────────
    let companyOwner = await User.findOne({
      $or: [
        { userId: targetSaUsername },
        { username: targetSaUsername, role: 'owner' },
        { companyId: saCompany._id, role: 'owner' }
      ]
    }).select('+password');

    const ownerPwdHash = await bcrypt.hash(cleanPwd, 10);
    if (!companyOwner) {
      companyOwner = await User.create({
        userId: targetSaUsername,
        username: targetSaUsername,
        password: ownerPwdHash,
        mustChangePassword: false,
        name: targetSaUsername,
        role: 'owner',
        company: saCompany.name,
        companyId: saCompany._id,
        status: 'active',
        joiningDate: new Date().toISOString().slice(0, 10)
      });
    } else {
      let changed = false;
      if (companyOwner.role !== 'owner') {
        companyOwner.role = 'owner';
        changed = true;
      }
      if (companyOwner.username !== targetSaUsername || companyOwner.userId !== targetSaUsername) {
        companyOwner.username = targetSaUsername;
        companyOwner.userId = targetSaUsername;
        changed = true;
      }
      if (!companyOwner.companyId || String(companyOwner.companyId) !== String(saCompany._id)) {
        companyOwner.companyId = saCompany._id;
        companyOwner.company = saCompany.name;
        changed = true;
      }
      const isHashMatch = companyOwner.password ? await bcrypt.compare(cleanPwd, companyOwner.password) : false;
      if (!isHashMatch) {
        companyOwner.password = ownerPwdHash;
        companyOwner.tokenVersion = Number(companyOwner.tokenVersion || 0) + 1;
        changed = true;
      }
      if (changed) {
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

    return {
      user: {
        _id: companyOwner._id,
        userId: companyOwner.userId,
        username: companyOwner.username,
        name: companyOwner.name,
        role: 'owner',
        companyId: companyOwner.companyId,
        company: companyOwner.company,
        avatar: companyOwner.avatar,
        mustChangePassword: false,
        token
      },
      token,
      authSource: 'company_owner:isolated_sector'
    };
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
