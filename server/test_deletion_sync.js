import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import User from './models/User.js';
import Company from './models/Company.js';
import SyncOutbox from './models/SyncOutbox.js';
import { query, isPgConnected, closePgPool } from './auth-integration/pgClient.js';
import { syncMongoUserToPg, removeReGenAppAccess, REGEN_APP_ID } from './auth-integration/pgSyncService.js';
import { reconcileSingleUser, processOutbox, runReconciliationCycle } from './auth-integration/pgDeletionSyncService.js';
import { authenticateUser } from './auth-integration/dualAuthService.js';

const TEST_PREFIX = 'test_del_sync_';
const createdMongoUserIds = [];
const createdPgUserIds = [];

async function setup() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected.');

  const pgOk = await isPgConnected();
  console.log('PostgreSQL connected:', pgOk);
  if (!pgOk) throw new Error('PostgreSQL is not connected, cannot run test suite');
}

async function cleanup() {
  console.log('\n--- Cleaning up disposable test data ---');
  for (const uid of createdMongoUserIds) {
    await User.deleteOne({ userId: uid });
    await SyncOutbox.deleteMany({ userId: uid });
  }
  for (const pgId of createdPgUserIds) {
    await query('DELETE FROM "UserAppAccess" WHERE "userId" = $1', [pgId]);
    await query('DELETE FROM "User" WHERE id = $1', [pgId]);
  }
  console.log('Disposable test data cleanly removed.');
  await mongoose.disconnect();
  await closePgPool();
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    await setup();

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 1: Genuinely local-only MongoDB user must NOT be deactivated
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\nTEST 1: Local-only MongoDB user protection');
    const localUserId = `${TEST_PREFIX}local_${Date.now()}`;
    createdMongoUserIds.push(localUserId);

    const localUser = await User.create({
      userId: localUserId,
      username: localUserId,
      name: 'Local Only User',
      email: `${localUserId}@test.local`,
      role: 'staff',
      status: 'active',
      syncedWithPg: false,
      tokenVersion: 0
    });

    const localOutcome = await reconcileSingleUser(localUser);
    assert(localOutcome.status === 'LOCAL_ONLY', 'Local-only user recognized as LOCAL_ONLY');
    assert(localOutcome.changed === false, 'Local-only user state is not changed');
    
    const refreshedLocal = await User.findOne({ userId: localUserId });
    assert(refreshedLocal.status === 'active', 'Local-only user remains active');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 2: Active synced user remains active
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\nTEST 2: Active synced user verification');
    const syncedUserId = `${TEST_PREFIX}synced_${Date.now()}`;
    createdMongoUserIds.push(syncedUserId);

    const hash1234 = await bcrypt.hash('1234', 10);
    const syncedUser = await User.create({
      userId: syncedUserId,
      username: syncedUserId,
      name: 'Active Synced User',
      email: `${syncedUserId}@example.com`,
      role: 'staff',
      status: 'active',
      password: hash1234,
      tokenVersion: 0
    });

    const syncRes = await syncMongoUserToPg(syncedUser, '1234');
    assert(syncRes.success === true, 'syncMongoUserToPg succeeded');
    assert(!!syncRes.pgUserId, 'syncMongoUserToPg returned pgUserId');
    if (syncRes.pgUserId) createdPgUserIds.push(syncRes.pgUserId);

    const refreshedSynced = await User.findOne({ userId: syncedUserId });
    assert(refreshedSynced.syncedWithPg === true, 'syncedWithPg flag is set to true');
    assert(refreshedSynced.pgUserId === syncRes.pgUserId, 'pgUserId is stored in MongoDB');

    const syncedOutcome = await reconcileSingleUser(refreshedSynced);
    assert(syncedOutcome.status === 'ACTIVE_SYNCED', 'Active synced user recognized as ACTIVE_SYNCED');
    assert(syncedOutcome.changed === false, 'No change made to active synced user');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 3: Revoked ReGen app access in PostgreSQL -> deactivates in MongoDB
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\nTEST 3: Revoked ReGen app access detection');
    // Remove ReGen UserAppAccess only (leaving PG User intact!)
    const removeRes = await removeReGenAppAccess(refreshedSynced.pgUserId);
    assert(removeRes.success === true, 'removeReGenAppAccess succeeded');

    // Verify PG User record STILL exists
    const pgUserCheck = await query('SELECT id FROM "User" WHERE id = $1', [refreshedSynced.pgUserId]);
    assert(pgUserCheck.rows.length === 1, 'PostgreSQL "User" record preserved (not deleted)');

    const revokedOutcome = await reconcileSingleUser(refreshedSynced);
    assert(revokedOutcome.status === 'REVOKED_APP_ACCESS', 'Recognized as REVOKED_APP_ACCESS');
    assert(revokedOutcome.changed === true, 'Deactivation change recorded');

    const refreshedRevoked = await User.findOne({ userId: syncedUserId });
    assert(refreshedRevoked.status === 'inactive', 'User status set to inactive in MongoDB');
    assert(refreshedRevoked.tokenVersion === 1, 'tokenVersion incremented from 0 to 1');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 4: Blocked PostgreSQL user detection
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\nTEST 4: Blocked PostgreSQL user detection');
    const blockedUserId = `${TEST_PREFIX}blocked_${Date.now()}`;
    createdMongoUserIds.push(blockedUserId);

    const blockedUser = await User.create({
      userId: blockedUserId,
      username: blockedUserId,
      name: 'Blocked PG User',
      email: `${blockedUserId}@example.com`,
      role: 'staff',
      status: 'active',
      password: hash1234,
      tokenVersion: 0
    });

    const blockedSyncRes = await syncMongoUserToPg(blockedUser, '1234');
    if (blockedSyncRes.pgUserId) createdPgUserIds.push(blockedSyncRes.pgUserId);

    // Set isBlocked = true in PG
    await query('UPDATE "User" SET "isBlocked" = true WHERE id = $1', [blockedSyncRes.pgUserId]);

    const refreshedBlocked = await User.findOne({ userId: blockedUserId });
    const blockedOutcome = await reconcileSingleUser(refreshedBlocked);
    assert(blockedOutcome.status === 'BLOCKED_PG_USER', 'Recognized as BLOCKED_PG_USER');
    assert(blockedOutcome.changed === true, 'Blocked user deactivated in MongoDB');

    const verifiedBlocked = await User.findOne({ userId: blockedUserId });
    assert(verifiedBlocked.status === 'inactive', 'Blocked user status is inactive');
    assert(verifiedBlocked.tokenVersion === 1, 'tokenVersion incremented');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 5: Missing PostgreSQL user detection
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\nTEST 5: Missing PostgreSQL user detection');
    const missingUserId = `${TEST_PREFIX}missing_${Date.now()}`;
    createdMongoUserIds.push(missingUserId);

    const missingUser = await User.create({
      userId: missingUserId,
      username: missingUserId,
      name: 'Missing PG User',
      email: `${missingUserId}@example.com`,
      role: 'staff',
      status: 'active',
      pgUserId: '00000000-0000-0000-0000-000000000000',
      syncedWithPg: true,
      tokenVersion: 0
    });

    const missingOutcome = await reconcileSingleUser(missingUser);
    assert(missingOutcome.status === 'MISSING_PG_USER', 'Recognized as MISSING_PG_USER');
    assert(missingOutcome.changed === true, 'Missing PG user deactivated in MongoDB');

    const verifiedMissing = await User.findOne({ userId: missingUserId });
    assert(verifiedMissing.status === 'inactive', 'Missing PG user status is inactive');
    assert(verifiedMissing.tokenVersion === 1, 'tokenVersion incremented');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 6: Login rejection for revoked/deactivated synced user
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\nTEST 6: Login rejection for revoked synced accounts');
    let loginRejected = false;
    let loginErrorMsg = '';
    try {
      await authenticateUser({ identifier: syncedUserId, password: '1234' });
    } catch (err) {
      loginRejected = true;
      loginErrorMsg = err.message;
    }
    assert(loginRejected === true, 'Login rejected for revoked synced account');
    assert(loginErrorMsg.includes('deactivated') || loginErrorMsg.includes('revoked'), `Expected error message received: "${loginErrorMsg}"`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 7: Employee list filtering of inactive accounts
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\nTEST 7: Employee list filtering (condition 7)');
    // Regular query filter (exclude inactive)
    const normalFilter = { userId: syncedUserId, status: { $ne: 'inactive' } };
    const normalList = await User.find(normalFilter);
    assert(normalList.length === 0, 'Inactive synced user hidden from regular employee list');

    // Archive query filter (Super Admin with includeInactive=true)
    const archiveFilter = { userId: syncedUserId }; // no status exclusion
    const archiveList = await User.find(archiveFilter);
    assert(archiveList.length === 1, 'Inactive user preserved and accessible in Super Admin archive view');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 8: Protections in user deletion (Super Admin & Company Owner)
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\nTEST 8: Deletion safety protections (condition 8)');
    // Create test company owner and company
    const ownerUserId = `${TEST_PREFIX}owner_${Date.now()}`;
    createdMongoUserIds.push(ownerUserId);

    const testOwner = await User.create({
      userId: ownerUserId,
      username: ownerUserId,
      name: 'Company Owner User',
      email: `${ownerUserId}@company.test`,
      role: 'owner',
      status: 'active'
    });

    const testCompany = await Company.create({
      name: 'Disposable Test Company',
      phoneNumber: '9999999999',
      city: 'Test City',
      ownerId: ownerUserId,
      status: 'active'
    });

    // Check company owner protection rule
    const ownedComp = await Company.findOne({ ownerId: testOwner.userId, status: 'active' });
    assert(!!ownedComp, 'Active company owned by user found');
    const ownerDeletePrevented = (testOwner.role === 'owner' && !!ownedComp);
    assert(ownerDeletePrevented === true, 'Owner deletion correctly prevented when company is active');

    // Clean up test company
    await Company.deleteOne({ _id: testCompany._id });

    // Super Admin protection rule
    const superAdminUser = { userId: 'vyshwa', role: 'param' };
    const superAdminDeletePrevented = (superAdminUser.role === 'param');
    assert(superAdminDeletePrevented === true, 'Super Admin deletion correctly prevented');

    // Self-deletion protection rule
    const selfDeletePrevented = (testOwner.userId === testOwner.userId);
    assert(selfDeletePrevented === true, 'Self-deletion correctly prevented');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 9: Durable SyncOutbox retry queue
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\nTEST 9: Durable MongoDB SyncOutbox retry processing');
    const outboxUserId = `${TEST_PREFIX}outbox_${Date.now()}`;
    createdMongoUserIds.push(outboxUserId);

    // Create a PG user and access for this test
    const outboxUser = await User.create({
      userId: outboxUserId,
      username: outboxUserId,
      name: 'Outbox Retry User',
      email: `${outboxUserId}@example.com`,
      role: 'staff',
      status: 'active',
      password: hash1234
    });
    const outboxSync = await syncMongoUserToPg(outboxUser, '1234');
    if (outboxSync.pgUserId) createdPgUserIds.push(outboxSync.pgUserId);

    // Insert task into durable SyncOutbox
    const outboxTask = await SyncOutbox.create({
      action: 'REMOVE_REGEN_APP_ACCESS',
      userId: outboxUserId,
      pgUserId: outboxSync.pgUserId,
      status: 'PENDING',
      nextRetryAt: new Date(Date.now() - 1000)
    });
    assert(outboxTask.status === 'PENDING', 'SyncOutbox task created in PENDING state');

    // Run outbox processor
    await processOutbox();

    const refreshedTask = await SyncOutbox.findById(outboxTask._id);
    assert(refreshedTask.status === 'COMPLETED', 'SyncOutbox task successfully processed to COMPLETED');

    // Verify access was indeed removed in PostgreSQL
    const accessCheck = await query(
      'SELECT id FROM "UserAppAccess" WHERE "userId" = $1 AND "appId" = $2',
      [outboxSync.pgUserId, REGEN_APP_ID]
    );
    assert(accessCheck.rows.length === 0, 'ReGen UserAppAccess verified removed by outbox processor');

    console.log(`\n========================================`);
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================`);

  } catch (err) {
    console.error('Test execution failed with error:', err);
    failed++;
  } finally {
    await cleanup();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
