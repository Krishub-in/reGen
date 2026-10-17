import mongoose from 'mongoose';

const syncOutboxSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['REMOVE_REGEN_APP_ACCESS', 'SYNC_USER_TO_PG'],
    required: true
  },
  userId: { type: String, required: true, index: true },
  pgUserId: { type: String, index: true },
  payload: { type: mongoose.Schema.Types.Mixed },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
    default: 'PENDING',
    index: true
  },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 5 },
  lastError: { type: String },
  nextRetryAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

syncOutboxSchema.index({ status: 1, nextRetryAt: 1 });

export default mongoose.model('SyncOutbox', syncOutboxSchema);
