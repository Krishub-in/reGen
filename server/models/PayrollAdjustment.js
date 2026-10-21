import mongoose from 'mongoose';

const payrollAdjustmentSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    default: () => new mongoose.Types.ObjectId().toString(),
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  month: {
    type: String,
    required: true, // 'YYYY-MM'
    index: true,
  },
  type: {
    type: String,
    enum: ['bonus', 'deduction'],
    required: true,
    index: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  reason: {
    type: String,
    default: '',
    trim: true,
  },
  addedBy: {
    type: String,
    required: true,
  },
  addedByName: {
    type: String,
  },
}, { timestamps: true });

export default mongoose.model('PayrollAdjustment', payrollAdjustmentSchema);
