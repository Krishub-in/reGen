import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, // Principal ID
  username: { type: String, required: true },
  password: { type: String, select: false }, 
  mustChangePassword: { type: Boolean, default: true },
  resetTokenHash: { type: String, select: false },
  resetTokenExpiresAt: { type: Date },
  name: { type: String },
  age: { type: Number },
  dateOfBirth: { type: String },
  gender: { type: String },
  aadhaar: { type: String },
  role: { type: String, enum: ['admin', 'owner', 'param', 'staff', 'intern', 'freelancer'], required: true },
  email: { type: String },
  phone: { type: String },
  company: { type: String }, // NEW
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  department: { type: String },
  designation: { type: String },
  salary: { type: String }, 
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  joiningDate: { type: String },
  referralSource: { type: String },
  avatar: { type: String }, 
  lastAvatarUpdate: { type: Date },
  address: { type: String },
  tokenVersion: { type: Number, default: 0 },
  lastLogin: { type: Date },
  lastActive: { type: Date }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
