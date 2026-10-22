import mongoose from 'mongoose';

const policyAcknowledgmentSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  policyId: { type: String, required: true, index: true }, // _id of the policy in companyPolicies
  policyTitle: { type: String, required: true },
  policyContent: { type: String },
  effectiveDate: { type: String },
  userId: { type: String, required: true, index: true }, // StaffId or user._id
  userName: { type: String },
  userEmail: { type: String },
  department: { type: String },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'allowed'],
    default: 'pending',
    index: true,
  },
  declineReason: { type: String, default: '' },
  declinedAt: { type: Date },
  acceptedAt: { type: Date },
  allowedAt: { type: Date },
  allowedBy: { type: String }, // Owner ID or name who granted exemption
  ownerNotes: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('PolicyAcknowledgment', policyAcknowledgmentSchema);
