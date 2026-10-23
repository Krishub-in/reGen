import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },
  userId: { type: String, required: true },
  date: { type: String, required: true },
  status: { type: String, enum: ['present', 'absent', 'late', 'half_day'], default: 'present' },
  checkIn: { type: String },
  checkOut: { type: String },
  location: { type: String },
  workMode: { type: String, enum: ['office', 'remote'], default: 'office' },
  // Official Break tracking
  breakStart: { type: String },
  breakEnd: { type: String },
  breakMinutes: { type: Number, default: 0 },
  breakDelayMinutes: { type: Number, default: 0 },
  // Casual Break tracking
  casualBreakStart: { type: String },
  casualBreakEnd: { type: String },
  casualBreakMinutes: { type: Number, default: 0 },
  casualBreakDelayMinutes: { type: Number, default: 0 },
  // Combined break status and deductions
  activeBreakType: { type: String, enum: ['none', 'official', 'casual'], default: 'none' },
  totalBreakDelayMinutes: { type: Number, default: 0 },
  breakDeduction: { type: Number, default: 0 },
  notes: { type: String }
}, { timestamps: true });

export default mongoose.model('Attendance', attendanceSchema);
