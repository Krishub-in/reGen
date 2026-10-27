import mongoose from 'mongoose';

const companySchema = new mongoose.Schema({
  name: { type: String, required: true },
  logo: { type: String },
  gst: { type: String },
  phoneNumber: { type: String, required: true },
  email: { type: String },
  category: { type: String },
  about: { type: String },
  address: { type: String }, 
  city: { type: String, required: true },
  state: { type: String },
  zip: { type: String },
  taxDetails: { type: String },
  policies: { type: String },
  companyPolicies: [{
    title: { type: String, required: true },
    content: { type: String, required: true },
    effectiveDate: { type: String },
    createdAt: { type: Date, default: Date.now },
  }],
  ownerId: { type: String, required: true }, // Links to the user who created it (Owner)
  ownerName: { type: String, trim: true }, // Full personal name of company owner
  status: { type: String, enum: ['active', 'blocked'], default: 'active' },
  officeLocation: {
    latitude: { type: Number },
    longitude: { type: Number },
    address: { type: String },
    radius: { type: Number, default: 5 },
    updatedAt: { type: Date },
  },
}, { timestamps: true });

export default mongoose.model('Company', companySchema);
