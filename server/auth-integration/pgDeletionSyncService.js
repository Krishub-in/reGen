import User from '../models/User.js';
import SyncOutbox from '../models/SyncOutbox.js';
import { query, isPgConnected } from './pgClient.js';
import { REGEN_APP_ID, removeReGenAppAccess, linkExistingMongoUsersWithPg } from './pgSyncService.js';

let reconciliationTimer = null;
let outboxTimer = null;
let isReconciliationRunning = false;
let isOutboxRunning = false;

/**
 * Reconciles the sync state of a single MongoDB user against PostgreSQL.
 * Distinguishes:
 * - MISSING_PG_USER: User completely absent from PG User table
 * - BLOCKED_PG_USER: User is marked isBlocked = true in PG
 * - REVOKED_APP_ACCESS: User exists in PG, but UserAppAccess for ReGen is deleted or inactive
 * - ACTIVE_SYNCED: User exists and has active ReGen app access
 * - LOCAL_ONLY: User is not flagged as syncedWithPg and has no pgUserId
 *
 * @param {object} mongoUser - MongoDB user document
 * @returns {object} { status: string, changed: boolean, reason?: string }
 */
export async function reconcileSingleUser(mongoUser) {
  if (!mongoUser) return { status: 'INVALID', changed: false };

  // Never deactivate or reconcile local-only MongoDB users
  if (!mongoUser.syncedWithPg && !mongoUser.pgUserId) {
    return { status: 'LOCAL_ONLY', changed: false };
  }

  // Never deactivate Super Admin accounts
  if (mongoUser.role === 'param') {
    return { status: 'PROTECTED_SUPER_ADMIN', changed: false };
  }

  const pgConnected = await isPgConnected().catch(() => false);
  if (!pgConnected) {
    return { status: 'PG_UNAVAILABLE', changed: false };
  }

  const pgUserId = mongoUser.pgUserId || null;
  const mongoUserId = String(mongoUser.userId || '');

  try {
    const res = await query(
      `SELECT 
         u.id, 
         u."isBlocked", 
         a.id as access_id, 
         a."isActive" as app_access_active
       FROM "User" u
       LEFT JOIN "UserAppAccess" a ON u.id = a."userId" AND a."appId" = $1
       WHERE u.id = $2 OR u."extraData"->>'userId' = $3
       LIMIT 1`,
      [REGEN_APP_ID, pgUserId, mongoUserId]
    );

    // Case 1: User does not exist in PostgreSQL at all
    if (res.rows.length === 0) {
      if (mongoUser.status !== 'inactive') {
        mongoUser.status = 'inactive';
        mongoUser.tokenVersion = Number(mongoUser.tokenVersion || 0) + 1;
        await mongoUser.save();
        return { status: 'MISSING_PG_USER', changed: true, reason: 'User record removed from PostgreSQL Auth Service' };
      }
      return { status: 'MISSING_PG_USER', changed: false };
    }

    const pgRecord = res.rows[0];

    // Ensure pgUserId is recorded if it wasn't populated yet
    if (!mongoUser.pgUserId && pgRecord.id) {
      mongoUser.pgUserId = pgRecord.id;
      mongoUser.syncedWithPg = true;
      await mongoUser.save();
    }

    // Case 2: PostgreSQL user is blocked
    if (pgRecord.isBlocked) {
      if (mongoUser.status !== 'inactive') {
        mongoUser.status = 'inactive';
        mongoUser.tokenVersion = Number(mongoUser.tokenVersion || 0) + 1;
        await mongoUser.save();
        return { status: 'BLOCKED_PG_USER', changed: true, reason: 'User is blocked in PostgreSQL Auth Service' };
      }
      return { status: 'BLOCKED_PG_USER', changed: false };
    }

    // Case 3: ReGen app access revoked or deleted in UserAppAccess
    if (!pgRecord.access_id || !pgRecord.app_access_active) {
      if (mongoUser.status !== 'inactive') {
        mongoUser.status = 'inactive';
        mongoUser.tokenVersion = Number(mongoUser.tokenVersion || 0) + 1;
        await mongoUser.save();
        return { status: 'REVOKED_APP_ACCESS', changed: true, reason: 'ReGen application access revoked or deleted in PostgreSQL' };
      }
      return { status: 'REVOKED_APP_ACCESS', changed: false };
    }

    // Case 4: Active and healthy in both
    return { status: 'ACTIVE_SYNCED', changed: false };
  } catch (err) {
    console.error(`[SYNC-RECONCILIATION] Error reconciling user ${mongoUser.userId}:`, err.message);
    return { status: 'ERROR', changed: false, error: err.message };
  }
}

/**
 * Runs a single cycle of reconciliation across all synced users in MongoDB.
 */
export async function runReconciliationCycle() {
  if (isReconciliationRunning) return { skipped: true, reason: 'Already running' };
  isReconciliationRunning = true;

  try {
    const pgConnected = await isPgConnected().catch(() => false);
    if (!pgConnected) {
      return { skipped: true, reason: 'PostgreSQL offline' };
    }

    // Only select users that were synced with PostgreSQL or have a pgUserId
    // This strictly protects genuinely local-only MongoDB accounts from ever being touched
    const syncedUsers = await User.find({
      role: { $ne: 'param' },
      $or: [
        { syncedWithPg: true },
        { pgUserId: { $exists: true, $ne: null } }
      ]
    });

    let deactivatedCount = 0;
    const results = [];

    for (const user of syncedUsers) {
      const outcome = await reconcileSingleUser(user);
      if (outcome.changed) {
        deactivatedCount++;
        console.log(`[SYNC-RECONCILIATION] Deactivated synced user ${user.userId} (${user.username}): ${outcome.reason}`);
      }
      results.push({ userId: user.userId, ...outcome });
    }

    return { success: true, processedCount: syncedUsers.length, deactivatedCount, results };
  } catch (err) {
    console.error('[SYNC-RECONCILIATION] Cycle error:', err.message);
    return { success: false, error: err.message };
  } finally {
    isReconciliationRunning = false;
  }
}

/**
 * Processes durable pending retry tasks from MongoDB SyncOutbox
 */
export async function processOutbox() {
  if (isOutboxRunning) return { skipped: true, reason: 'Already running' };
  isOutboxRunning = true;

  try {
    const pgConnected = await isPgConnected().catch(() => false);
    if (!pgConnected) return { skipped: true, reason: 'PostgreSQL offline' };

    const pendingTasks = await SyncOutbox.find({
      status: 'PENDING',
      nextRetryAt: { $lte: new Date() }
    }).limit(20);

    for (const task of pendingTasks) {
      task.status = 'PROCESSING';
      task.attempts += 1;
      await task.save();

      try {
        if (task.action === 'REMOVE_REGEN_APP_ACCESS') {
          const res = await removeReGenAppAccess(task.pgUserId);
          if (res.success) {
            task.status = 'COMPLETED';
            task.lastError = null;
          } else {
            throw new Error(res.error || 'Failed to remove ReGen app access');
          }
        }
      } catch (err) {
        task.lastError = err.message;
        if (task.attempts >= task.maxAttempts) {
          task.status = 'FAILED';
          console.error(`[SYNC-OUTBOX] Task ${task._id} permanently failed after ${task.attempts} attempts:`, err.message);
        } else {
          task.status = 'PENDING';
          const delayMs = Math.min(60000, Math.pow(2, task.attempts) * 3000);
          task.nextRetryAt = new Date(Date.now() + delayMs);
        }
      }

      await task.save();
    }
  } catch (err) {
    console.error('[SYNC-OUTBOX] Processor error:', err.message);
  } finally {
    isOutboxRunning = false;
  }
}

/**
 * Start background scheduler for reconciliation and outbox processing
 */
export function startDeletionSyncWorker() {
  // Initial backfill linking on startup
  linkExistingMongoUsersWithPg().catch(err => {
    console.warn('[SYNC-RECONCILIATION] Initial link notice:', err.message);
  });

  // Run reconciliation every 10 seconds
  if (!reconciliationTimer) {
    reconciliationTimer = setInterval(() => {
      runReconciliationCycle().catch(err => {
        console.warn('[SYNC-RECONCILIATION] Periodic cycle notice:', err.message);
      });
    }, 10000);
  }

  // Run outbox processing every 5 seconds
  if (!outboxTimer) {
    outboxTimer = setInterval(() => {
      processOutbox().catch(err => {
        console.warn('[SYNC-OUTBOX] Periodic cycle notice:', err.message);
      });
    }, 5000);
  }

  console.log('[SYNC-RECONCILIATION] Deletion and reconciliation worker started.');
}

/**
 * Stop background scheduler
 */
export function stopDeletionSyncWorker() {
  if (reconciliationTimer) clearInterval(reconciliationTimer);
  if (outboxTimer) clearInterval(outboxTimer);
  reconciliationTimer = null;
  outboxTimer = null;
  console.log('[SYNC-RECONCILIATION] Deletion and reconciliation worker stopped.');
}
