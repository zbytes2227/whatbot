import mongoose from 'mongoose';

const ContactListSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true, maxlength: 120 },
  description: { type: String, maxlength: 500 },
  contacts: [String],
}, { timestamps: true });

ContactListSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.ContactList || mongoose.model('ContactList', ContactListSchema);
