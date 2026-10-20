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
      syncedFrom: 'mern',
      syncedAt: new Date().toISOString()
    };

    // 1. Check if user already exists in PostgreSQL
    let existingPgUser = null;

    if (email) {
      const byEmail = await query('SELECT id, email, "passwordHash", "isBlocked" FROM "User" WHERE email = $1', [email]);
      if (byEmail.rows.length > 0) existingPgUser = byEmail.rows[0];
    }

    if (!existingPgUser && phone) {
      const byPhone = await query('SELECT id, phone, "passwordHash", "isBlocked" FROM "User" WHERE phone = $1', [phone]);
      if (byPhone.rows.length > 0) existingPgUser = byPhone.rows[0];
    }

    if (!existingPgUser && userId) {
      const byUserId = await query(`SELECT id, "passwordHash", "isBlocked" FROM "User" WHERE "extraData"->>'userId' = $1`, [userId]);
      if (byUserId.rows.length > 0) existingPgUser = byUserId.rows[0];
    }

    if (!existingPgUser && username) {
      const byUsername = await query(`SELECT id, "passwordHash", "isBlocked" FROM "User" WHERE "extraData"->>'username' = $1`, [username]);
      if (byUsername.rows.length > 0) existingPgUser = byUsername.rows[0];
    }

    let pgUserId = null;
    let isNew = false;

    if (existingPgUser) {
      pgUserId = existingPgUser.id;
      // Update extraData and passwordHash if rawPassword was explicitly supplied
      if (rawPassword) {
        await query(
          'UPDATE "User" SET "passwordHash" = $1, "extraData" = $2, "updatedAt" = NOW() WHERE id = $3',
          [passwordHash, JSON.stringify(extraData), pgUserId]
        );
      } else {
        await query(
          'UPDATE "User" SET "extraData" = $1, "updatedAt" = NOW() WHERE id = $2',
          [JSON.stringify(extraData), pgUserId]
        );
      }
    } else {
      // Insert new PostgreSQL User
      pgUserId = crypto.randomUUID();
      isNew = true;

      // Handle unique constraint collisions gracefully on email/phone
      await query(
        `INSERT INTO "User" 
          (id, email, phone, "passwordHash", "firstName", "lastName", "extraData", "createdAt", "updatedAt") 
         VALUES 
          ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [pgUserId, email, phone, passwordHash, firstName, lastName, JSON.stringify(extraData)]
      );
    }

    // 2. Ensure UserAppAccess exists for ReGen app
    const appRoleId = mapRoleToAppRoleId(mongoUser.role);
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
          ($1, $2, $3, $4, true, NOW(), NOW())`,
        [accessId, pgUserId, REGEN_APP_ID, appRoleId]
      );
    } else {
      // Keep role updated and ensure active
      await query(
        'UPDATE "UserAppAccess" SET "appRoleId" = $1, "isActive" = true, "updatedAt" = NOW() WHERE id = $2',
        [appRoleId, existingAccess.rows[0].id]
      );
    }

    // 3. Persist pgUserId and syncedWithPg flag on MongoDB user document
    try {
      await User.updateOne(
        { userId: mongoUser.userId || userId },
        { $set: { pgUserId, syncedWithPg: true } }
      );
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

