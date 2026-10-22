import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },
  title: { type: String, required: true },
  description: { type: String },
  assignedTo: { type: String }, // User ID (Principal)
  status: { type: String, enum: ['todo', 'in_progress', 'paused', 'blocked', 'review', 'done', 'not_completed'], default: 'todo' },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  assignorName: { type: String },
  durationValue: { type: Number },
  durationUnit: { type: String, enum: ['hours', 'days', 'minutes'] },
  dueDate: { type: String },
  dueTime: { type: String },
  startDate: { type: String },
  endDate: { type: String },
  endTime: { type: String },
  projectId: { type: String, index: true },
  projectName: { type: String },
  isProjectTask: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('Task', taskSchema);
