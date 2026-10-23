import mongoose from 'mongoose';
import User from './models/User.js';
import SuperAdmin from './models/SuperAdmin.js';
import Company from './models/Company.js';
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

    const username = (process.env.SUPER_ADMIN_USERNAME || 'Vyshwa').trim();
    const password = (process.env.SUPER_ADMIN_PASSWORD || 'S@@ttv1k@').trim();
    const hashed = await bcrypt.hash(password, 10);

    // 1. Inbuild company
    let saCompany = await Company.findOne({ ownerId: username }) || await Company.findOne({ name: /krish/i });
    if (!saCompany) {
      saCompany = await Company.create({
        name: 'krish Tech Computer',
        phoneNumber: '9092024444',
        email: 'info@krishub.in',
        city: 'CBE',
        category: 'it',
        ownerId: username,
        ownerName: username,
        status: 'active',
        companyPolicies: []
      });
    }

    // 2. SuperAdmin Sector
    let sa = await SuperAdmin.findOne({ $or: [{ username }, { adminId: username }] });
    if (sa) {
      sa.username = username;
      sa.adminId = username;
      sa.password = hashed;
      sa.tokenVersion = Number(sa.tokenVersion || 0) + 1;
      await sa.save();
      console.log(`✅ SuperAdmin sector synchronized for "${username}"`);
    } else {
      await SuperAdmin.create({
        adminId: username,
        username,
        password: hashed,
        name: username,
        role: 'param',
        status: 'active'
      });
      console.log(`✅ SuperAdmin sector created for "${username}"`);
    }

    // 3. Company Owner Sector
    let owner = await User.findOne({
      $or: [
        { userId: username },
        { username, role: 'owner' },
        { companyId: saCompany._id, role: 'owner' }
      ]
    });
    if (owner) {
      owner.userId = username;
      owner.username = username;
      owner.name = username;
      owner.password = hashed;
      owner.role = 'owner';
      owner.company = saCompany.name;
      owner.companyId = saCompany._id;
      owner.status = 'active';
      owner.tokenVersion = Number(owner.tokenVersion || 0) + 1;
      await owner.save();
      console.log(`✅ Company Owner account synchronized for "${username}" in "${saCompany.name}"`);
    } else {
      await User.create({
        userId: username,
        username,
        password: hashed,
        name: username,
        role: 'owner',
        company: saCompany.name,
        companyId: saCompany._id,
        status: 'active',
        joiningDate: new Date().toISOString().slice(0, 10),
      });
      console.log(`✅ Company Owner account created for "${username}" in "${saCompany.name}"`);
    }

    await User.deleteMany({ role: 'param' });

    await mongoose.disconnect();
    console.log('Done!');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

seedAdmin();
