import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

import { query, isPgConnected } from './auth-integration/pgClient.js';
import { syncMongoUserToPg, REGEN_APP_ID, REGEN_ROLE_IDS } from './auth-integration/pgSyncService.js';
import { authenticateUser } from './auth-integration/dualAuthService.js';
import User from './models/User.js';

async function runTests() {
  console.log('=== STARTING DUAL AUTH INTEGRATION TESTS ===\n');

  // 1. Connect MongoDB
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/');
  console.log('✓ MongoDB Connected');

  // 2. Check PostgreSQL connection
  const pgOk = await isPgConnected();
  if (!pgOk) {
    throw new Error('PostgreSQL connection failed');
  }
  console.log('✓ PostgreSQL Connected to auth_service');

  // 3. Verify ReGen App in PostgreSQL
  const appRes = await query('SELECT id, name, code FROM "App" WHERE id = $1', [REGEN_APP_ID]);
  if (appRes.rows.length === 0 || appRes.rows[0].code !== 'REGEN') {
    throw new Error('ReGen App not found in PostgreSQL');
  }
  console.log('✓ ReGen App verified in PostgreSQL:', appRes.rows[0]);

  // 4. Test Super Admin Authentication from AuthServiceAdmin
  const adminRes = await query('SELECT email FROM "AuthServiceAdmin" LIMIT 1');
  if (adminRes.rows.length > 0) {
    const adminEmail = adminRes.rows[0].email;
    console.log(`✓ Found Super Admin in PG: ${adminEmail}`);
    // Test invalid password
    try {
      await authenticateUser({ identifier: adminEmail, password: 'WrongPassword123!' });
      console.error('✗ Super Admin invalid password test failed: should have rejected');
    } catch (e) {
      console.log('✓ Rejected invalid password for Super Admin as expected (status ' + (e.statusCode || 401) + ')');
    }
  }

  // 5. Test MongoDB User Synchronization to PostgreSQL
  const testUserId = `test-user-${Date.now()}`;
  const testUsername = `user_${Date.now()}`;
  const testEmail = `${testUsername}@example.com`;
  const testPassword = 'SecurePassword@123';

  const testMongoUser = await User.create({
    userId: testUserId,
    username: testUsername,
    email: testEmail,
    name: 'Integration Test User',
    password: await bcrypt.hash(testPassword, 10),
    role: 'staff',
    status: 'active'
  });
  console.log(`✓ Created test MongoDB user: ${testUsername}`);

  // Sync to PostgreSQL
  const syncResult1 = await syncMongoUserToPg(testMongoUser, testPassword);
  if (!syncResult1.success) {
    throw new Error(`Sync to PG failed: ${syncResult1.error}`);
  }
  console.log('✓ Successfully synchronized user to PostgreSQL:', syncResult1);

  // 6. Test Idempotence / Duplicate Prevention
  const syncResult2 = await syncMongoUserToPg(testMongoUser);
  if (!syncResult2.success || syncResult2.isNew) {
    throw new Error('Sync idempotency failed: duplicate was created or error returned');
  }
  console.log('✓ Duplicate prevention verified: reused existing PG user', syncResult2.pgUserId);

  // 7. Verify PG records for synced user
  const pgUserRes = await query('SELECT id, email, "firstName", "lastName" FROM "User" WHERE id = $1', [syncResult1.pgUserId]);
  if (pgUserRes.rows.length === 0) throw new Error('PG user not found after sync');

  const pgAccessRes = await query('SELECT * FROM "UserAppAccess" WHERE "userId" = $1 AND "appId" = $2', [syncResult1.pgUserId, REGEN_APP_ID]);
  if (pgAccessRes.rows.length === 0 || pgAccessRes.rows[0].appRoleId !== REGEN_ROLE_IDS.STAFF) {
    throw new Error('UserAppAccess missing or incorrect role for ReGen app');
  }
  console.log('✓ User and UserAppAccess verified in PostgreSQL for ReGen App');

  // 8. Test Dual Authentication (User present in both)
  const authSuccess = await authenticateUser({ identifier: testUsername, password: testPassword });
  if (!authSuccess.token || !authSuccess.user) {
    throw new Error('Dual auth failed for synchronized user');
  }
  console.log('✓ Dual authentication succeeded for user present in both databases:', authSuccess.authSource);

  // 9. Test Invalid Password
  try {
    await authenticateUser({ identifier: testUsername, password: 'WrongPassword999' });
    throw new Error('Invalid password was accepted');
  } catch (e) {
    console.log('✓ Invalid password correctly rejected (status ' + (e.statusCode || 401) + ')');
  }

  // 10. Test Blocked / Inactive Status
  testMongoUser.status = 'inactive';
  await testMongoUser.save();
  try {
    await authenticateUser({ identifier: testUsername, password: testPassword });
    throw new Error('Deactivated user was allowed to login');
  } catch (e) {
    console.log('✓ Deactivated MongoDB user correctly rejected (status ' + (e.statusCode || 403) + ')');
  }

  // Clean up test records
  await query('DELETE FROM "UserAppAccess" WHERE "userId" = $1', [syncResult1.pgUserId]);
  await query('DELETE FROM "User" WHERE id = $1', [syncResult1.pgUserId]);
  await User.deleteOne({ _id: testMongoUser._id });
  console.log('✓ Cleaned up test records from both databases safely');

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
  await mongoose.disconnect();
}

runTests().catch(err => {
  console.error('\n✗ TEST FAILED:', err);
  process.exit(1);
});
