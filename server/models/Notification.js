import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: [
      'text_message',
      'voice_message',
      'voice_call',
      'video_call',
      'team_meeting',
      'general',
      'payment',
      'payroll',
      'bonus',
      'deduction',
      'attendance'
    ],
    default: 'general'
  },
  senderId: { type: String },
  senderName: { type: String },
  conversationId: { type: String },
  callId: { type: String },
  meetingId: { type: String },
  actionStatus: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'missed', 'ended', 'none'],
    default: 'none'
  },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: String, required: true },
  read: { type: Boolean, default: false, index: true }
}, { timestamps: true });

export default mongoose.model('Notification', notificationSchema);

