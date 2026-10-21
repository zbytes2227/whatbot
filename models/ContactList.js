import mongoose from 'mongoose';

const ContactListSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String },
  contacts: [String],  
}, { timestamps: true });
ContactListSchema.index({ userId: 1, createdAt: -1 });
// done
export default mongoose.models.ContactList || mongoose.model('ContactList', ContactListSchema);
