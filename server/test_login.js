import mongoose from 'mongoose';
import User from './models/User.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function testLogin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ username: 'Vyshwa' }).select('+password');
    if (!user) {
      console.log('❌ User Vyshwa NOT found');
      return;
    }
    console.log('✅ User found:', user.username, '| role:', user.role);
    console.log('   password hash:', user.password ? user.password.slice(0,20) + '...' : 'MISSING');

    const ok = await bcrypt.compare('admin123', user.password);
    console.log('   Password "admin123" matches:', ok ? '✅ YES' : '❌ NO');

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testLogin();
