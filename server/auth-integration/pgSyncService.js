import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from './pgClient.js';
import User from '../models/User.js';

export const REGEN_APP_ID = 'f683ebef-2e05-4070-a3c3-a06825629eb8';

export const REGEN_ROLE_IDS = {
  ADMIN: 'dd5401bb-be8d-4312-a73f-9b0cffda49e7',
  OWNER: '5d8749c1-0d27-4471-bff2-7b0f8479283c',
  STAFF: 'a6bc1f9e-e159-4c96-9db6-a3b3ca908a8b',
  INTERN: '54318f00-aab5-4ff5-bdcc-5ce0c05bbf7e',
  PARAM: '83773e01-f76f-4b82-a725-4bfa443cddad',
};

/**
 * Maps MERN user role string to ReGen AppRole ID in PostgreSQL
 */
export function mapRoleToAppRoleId(role) {
  const r = String(role || 'staff').toLowerCase();
  if (r === 'admin') return REGEN_ROLE_IDS.ADMIN;
  if (r === 'owner') return REGEN_ROLE_IDS.OWNER;
  if (r === 'intern') return REGEN_ROLE_IDS.INTERN;
  if (r === 'param') return REGEN_ROLE_IDS.PARAM;
  return REGEN_ROLE_IDS.STAFF; // default for staff / freelancer
}

/**
 * Synchronize a MongoDB User record to PostgreSQL "User" and "UserAppAccess" tables.
 * Safe, idempotent, non-destructive.
 *
 * @param {object} mongoUser - The Mongoose User document or plain object
 * @param {string|null} rawPassword - Optional plaintext password to hash at 12 rounds
 */
export async function syncMongoUserToPg(mongoUser, rawPassword = null) {
  if (!mongoUser) return { success: false, error: 'No user provided' };

  try {
    const email = mongoUser.email ? mongoUser.email.trim().toLowerCase() : null;
    const phone = mongoUser.phone ? mongoUser.phone.trim() : null;
    const userId = String(mongoUser.userId || mongoUser._id || '');
    const username = String(mongoUser.username || '');

    // Split name into firstName and lastName
    const fullName = String(mongoUser.name || mongoUser.username || 'User').trim();
    const parts = fullName.split(' ');
    const firstName = parts[0] || 'User';
    const lastName = parts.slice(1).join(' ') || '';

    // Determine password hash
    let passwordHash = null;
    if (rawPassword) {
      passwordHash = await bcrypt.hash(String(rawPassword).trim(), 12);
    } else if (mongoUser.password && mongoUser.password.startsWith('$2')) {
      passwordHash = mongoUser.password;
    } else {
      // Default fallback hash (admin123) if no password found
      passwordHash = await bcrypt.hash('admin123', 12);
    }

    const extraData = {
      userId,
      username,
      companyId: mongoUser.companyId ? mongoUser.companyId.toString() : null,
      companyName: mongoUser.company || null,
      role: mongoUser.role || 'staff',
      email: email,
      phone: phone,
      syncedFrom: 'mern',
      syncedAt: new Date().toISOString()
    };

    // 1. Identify if this user already exists in PostgreSQL
    // Primary identification in ReGen is pgUserId, userId, and username
    let existingPgUser = null;

    if (mongoUser.pgUserId) {
      const byPgId = await query('SELECT id, email, phone, "passwordHash", "isBlocked", "extraData" FROM "User" WHERE id = $1', [mongoUser.pgUserId]);
      if (byPgId.rows.length > 0) existingPgUser = byPgId.rows[0];
    }

    if (!existingPgUser && userId) {
      const byUserId = await query(`SELECT id, email, phone, "passwordHash", "isBlocked", "extraData" FROM "User" WHERE "extraData"->>'userId' = $1`, [userId]);
      if (byUserId.rows.length > 0) existingPgUser = byUserId.rows[0];
    }

    if (!existingPgUser && username) {
      const byUsername = await query(`SELECT id, email, phone, "passwordHash", "isBlocked", "extraData" FROM "User" WHERE "extraData"->>'username' = $1`, [username]);
      if (byUsername.rows.length > 0) {
        const rowUserId = byUsername.rows[0].extraData?.userId;
        if (!rowUserId || rowUserId === userId) {
          existingPgUser = byUsername.rows[0];
        }
      }
    }

    // Only match by email if the existing row is not already bound to a different ReGen userId
    if (!existingPgUser && email) {
      const byEmail = await query('SELECT id, email, phone, "passwordHash", "isBlocked", "extraData" FROM "User" WHERE email = $1', [email]);
      if (byEmail.rows.length > 0) {
        const rowUserId = byEmail.rows[0].extraData?.userId;
        if (!rowUserId || rowUserId === userId) {
          existingPgUser = byEmail.rows[0];
        }
      }
    }

    let pgUserId = null;
    let isNew = false;
    const isInactive = mongoUser.status === 'inactive' || mongoUser.status === 'suspended';

    if (existingPgUser) {
      pgUserId = existingPgUser.id;

      // Safe update of email and phone (avoiding duplicate key violations against other users)
      let updateEmail = existingPgUser.email;
      if (email && email !== existingPgUser.email) {
        const emailCollision = await query('SELECT id FROM "User" WHERE email = $1 AND id != $2', [email, pgUserId]);
        if (emailCollision.rows.length === 0) {
          updateEmail = email;
        } else {
          console.warn(`[AUTH-INTEGRATION] Email "${email}" collision in PG; keeping existing email for ${userId}`);
        }
      }

      let updatePhone = existingPgUser.phone;
      if (phone && phone !== existingPgUser.phone) {
        const phoneCollision = await query('SELECT id FROM "User" WHERE phone = $1 AND id != $2', [phone, pgUserId]);
        if (phoneCollision.rows.length === 0) {
          updatePhone = phone;
        } else {
          console.warn(`[AUTH-INTEGRATION] Phone "${phone}" collision in PG; keeping existing phone for ${userId}`);
        }
      }

      // Merge extraData preserving any existing external fields
      const mergedExtra = { ...(existingPgUser.extraData || {}), ...extraData };

      if (rawPassword) {
        await query(
          'UPDATE "User" SET "passwordHash" = $1, "firstName" = $2, "lastName" = $3, email = $4, phone = $5, "extraData" = $6, "isBlocked" = $7, "updatedAt" = NOW() WHERE id = $8',
          [passwordHash, firstName, lastName, updateEmail, updatePhone, JSON.stringify(mergedExtra), isInactive, pgUserId]
        );
      } else {
        await query(
          'UPDATE "User" SET "firstName" = $1, "lastName" = $2, email = $3, phone = $4, "extraData" = $5, "isBlocked" = $6, "updatedAt" = NOW() WHERE id = $7',
          [firstName, lastName, updateEmail, updatePhone, JSON.stringify(mergedExtra), isInactive, pgUserId]
        );
      }
    } else {
      // Insert new PostgreSQL User
      pgUserId = crypto.randomUUID();
      isNew = true;

      // Handle unique constraint collisions gracefully on email/phone
      let safeEmail = email;
      if (safeEmail) {
        const emailTaken = await query('SELECT id FROM "User" WHERE email = $1', [safeEmail]);
        if (emailTaken.rows.length > 0) {
          console.warn(`[AUTH-INTEGRATION] Email "${safeEmail}" already taken in PG; nulling column for user ${userId}`);
          safeEmail = null;
        }
      }

      let safePhone = phone;
      if (safePhone) {
        const phoneTaken = await query('SELECT id FROM "User" WHERE phone = $1', [safePhone]);
        if (phoneTaken.rows.length > 0) {
          console.warn(`[AUTH-INTEGRATION] Phone "${safePhone}" already taken in PG; nulling column for user ${userId}`);
          safePhone = null;
        }
      }

      await query(
        `INSERT INTO "User" 
          (id, email, phone, "passwordHash", "firstName", "lastName", "extraData", "isEmailVerified", "isPhoneVerified", "isBlocked", "createdAt", "updatedAt") 
         VALUES 
          ($1, $2, $3, $4, $5, $6, $7, false, false, $8, NOW(), NOW())`,
        [pgUserId, safeEmail, safePhone, passwordHash, firstName, lastName, JSON.stringify(extraData), isInactive]
      );
    }

    // 2. Ensure UserAppAccess exists for ReGen app
    const appRoleId = mapRoleToAppRoleId(mongoUser.role);
    const appIsActive = !isInactive;
    const existingAccess = await query(
      'SELECT id, "appRoleId", "isActive" FROM "UserAppAccess" WHERE "userId" = $1 AND "appId" = $2',
      [pgUserId, REGEN_APP_ID]
    );

    if (existingAccess.rows.length === 0) {
      const accessId = crypto.randomUUID();
      await query(
        `INSERT INTO "UserAppAccess" 
          (id, "userId", "appId", "appRoleId", "isActive", "createdAt", "updatedAt") 
         VALUES 
          ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [accessId, pgUserId, REGEN_APP_ID, appRoleId, appIsActive]
      );
    } else {
      // Keep role updated and ensure active matches status
      await query(
        'UPDATE "UserAppAccess" SET "appRoleId" = $1, "isActive" = $2, "updatedAt" = NOW() WHERE id = $3',
        [appRoleId, appIsActive, existingAccess.rows[0].id]
      );
    }

    // 3. Persist pgUserId and syncedWithPg flag on MongoDB user document
    try {
      await User.updateOne(
        { userId: mongoUser.userId || userId },
        { $set: { pgUserId, syncedWithPg: true } }
      );
      if (mongoUser) {
        mongoUser.pgUserId = pgUserId;
        mongoUser.syncedWithPg = true;
      }
    } catch (mErr) {
      console.warn('[AUTH-INTEGRATION] Could not update pgUserId on MongoDB user:', mErr.message);
    }

    return { success: true, pgUserId, isNew };
  } catch (error) {
    console.error('[AUTH-INTEGRATION] syncMongoUserToPg failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Remove or deactivate ReGen-only UserAppAccess from PostgreSQL.
 * Strictly avoids touching the shared PostgreSQL "User" record or other apps' access.
 *
 * @param {string} pgUserId - The PostgreSQL User UUID
 */
export async function removeReGenAppAccess(pgUserId) {
  if (!pgUserId) return { success: false, error: 'No pgUserId provided' };
  try {
    const res = await query(
      'DELETE FROM "UserAppAccess" WHERE "userId" = $1 AND "appId" = $2',
      [pgUserId, REGEN_APP_ID]
    );
    return { success: true, rowCount: res.rowCount };
  } catch (err) {
    console.error('[AUTH-INTEGRATION] removeReGenAppAccess error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Backfill pgUserId and syncedWithPg on existing MongoDB users who already exist in PostgreSQL.
 * Safe, idempotent, non-destructive.
 */
export async function linkExistingMongoUsersWithPg() {
  try {
    const pgUsers = await query(`
      SELECT id, "extraData"->>'userId' as "mongoUserId" 
      FROM "User" 
      WHERE "extraData"->>'userId' IS NOT NULL
    `);

    let linkedCount = 0;
    for (const row of pgUsers.rows) {
      if (!row.mongoUserId) continue;
      const res = await User.updateOne(
        { userId: row.mongoUserId, syncedWithPg: { $ne: true } },
        { $set: { pgUserId: row.id, syncedWithPg: true } }
      );
      if (res.modifiedCount > 0) linkedCount++;
    }
    if (linkedCount > 0) {
      console.log(`[AUTH-INTEGRATION] Linked ${linkedCount} existing MongoDB users with PostgreSQL.`);
    }
    return { success: true, linkedCount };
  } catch (err) {
    console.warn('[AUTH-INTEGRATION] linkExistingMongoUsersWithPg notice:', err.message);
    return { success: false, error: err.message };
  }
}

