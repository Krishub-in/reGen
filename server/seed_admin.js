import mongoose from 'mongoose';
import User from './models/User.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function seedAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const username = process.env.SUPER_ADMIN_USERNAME || 'Vyshwa';
    const password = process.env.SUPER_ADMIN_PASSWORD || 'admin123';

    const existing = await User.findOne({ username });
    if (existing) {
      console.log(`User "${username}" already exists with role: ${existing.role}`);
      // Force update password and role
      existing.password = await bcrypt.hash(password, 10);
      existing.role = 'param';
      existing.mustChangePassword = false;
      await existing.save();
      console.log(`✅ Updated password and role to "param" for "${username}"`);
    } else {
      const hashed = await bcrypt.hash(password, 10);
      await User.create({
        userId: username,
        username: username,
        password: hashed,
        name: username,
        role: 'param',
        status: 'active',
        mustChangePassword: false,
        joiningDate: new Date().toISOString().slice(0, 10),
      });
      console.log(`✅ Created Super Admin "${username}" with password "${password}"`);
    }

    await mongoose.disconnect();
    console.log('Done!');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

seedAdmin();
