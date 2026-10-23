import mongoose from 'mongoose';

const superAdminSchema = new mongoose.Schema({
  adminId: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, select: false },
  name: { type: String, default: 'Super Admin' },
  role: { type: String, default: 'param' },
  email: { type: String, default: 'info@krishub.in' },
  phone: { type: String, default: '9092024444' },
  designation: { type: String, default: 'Platform Administrator' },
  department: { type: String, default: 'Central Administration' },
  avatar: { type: String, default: '' },
  lastAvatarUpdate: { type: Date },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  tokenVersion: { type: Number, default: 0 },
  lastLogin: { type: Date },
  lastActive: { type: Date }
}, { timestamps: true });

export default mongoose.model('SuperAdmin', superAdminSchema);
