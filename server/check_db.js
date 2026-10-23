import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test');
  const users = await mongoose.connection.collection('users').find({
    $or: [{ role: 'param' }, { role: 'owner' }, { username: 'Vyshwa' }]
  }, { projection: { userId: 1, username: 1, name: 1, role: 1, companyId: 1, company: 1, avatar: 1 } }).toArray();
  for (const u of users) {
    console.log(`USER: id=${u.userId} username=${u.username} name=${u.name} role=${u.role} company=${u.company} companyId=${u.companyId} avatar=${u.avatar}`);
  }

  const companies = await mongoose.connection.collection('companies').find({}).toArray();
  for (const c of companies) {
    console.log(`COMPANY: id=${c._id} name=${c.name} ownerName=${c.ownerName} ownerId=${c.ownerId} logo=${c.logo}`);
  }

  const leaves = await mongoose.connection.collection('leaves').find({}).toArray();
  for (const l of leaves) {
    console.log(`LEAVE: id=${l._id} userId=${l.userId} companyId=${l.companyId} status=${l.status} dates=${l.startDate} to ${l.endDate}`);
  }

  const holidays = await mongoose.connection.collection('holidays').find({}).toArray();
  for (const h of holidays) {
    console.log(`HOLIDAY: id=${h._id} name=${h.name} companyId=${h.companyId} date=${h.date}`);
  }

  await mongoose.disconnect();
}
run();
