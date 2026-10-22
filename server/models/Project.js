import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  assignedEmployees: [{
    userId: { type: String, required: true },
    name: { type: String },
    username: { type: String },
    email: { type: String },
    department: { type: String },
    avatar: { type: String }
  }],
  status: {
    type: String,
    enum: ['planning', 'active', 'completed', 'on_hold'],
    default: 'active'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  startDate: { type: String },
  dueDate: { type: String },
  createdBy: { type: String }, // User ID or name who created the project
}, { timestamps: true });

export default mongoose.model('Project', projectSchema);
