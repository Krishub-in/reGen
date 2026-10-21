import mongoose from 'mongoose';

const paymentTransactionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    default: () => new mongoose.Types.ObjectId().toString(),
  },
  payrollId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payroll',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['salary', 'bonus', 'adjustment', 'other'],
    default: 'salary',
    index: true,
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
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'upi', 'cash', 'cheque', 'other'],
    default: 'bank_transfer',
  },
  referenceId: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ['completed', 'failed', 'refunded'],
    default: 'completed',
    index: true,
  },
  paidAt: {
    type: Date,
    default: Date.now,
  },
  processedBy: {
    type: String,
    required: true,
  },
  processedByName: {
    type: String,
  },
  notes: {
    type: String,
  },
}, { timestamps: true });

export default mongoose.model('PaymentTransaction', paymentTransactionSchema);
