import mongoose from 'mongoose';

const directMessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: false, index: true },
  senderId: { type: String, required: true },
  senderName: { type: String },
  // E2E encrypted content (base64 ciphertext) — server cannot read it
  content: { type: String, default: '' },
  iv: { type: String, default: '' }, // AES-GCM initialisation vector (base64)
  encrypted: { type: Boolean, default: false },
  attachments: [{ type: mongoose.Schema.Types.Mixed }],
  readBy: [{ type: String }], // userIds who have read the message
  editedAt: { type: Date, default: null }
}, { timestamps: true });

directMessageSchema.index({ conversationId: 1, createdAt: 1 });

export default mongoose.model('DirectMessage', directMessageSchema);
