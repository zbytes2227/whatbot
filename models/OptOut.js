import mongoose from 'mongoose';

// Numbers that must never receive campaign messages.
const OptOutSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  reason: { type: String, maxlength: 300 },
  source: { type: String, enum: ['manual', 'reply', 'import'], default: 'manual' },
}, { timestamps: true });

OptOutSchema.index({ createdAt: -1 });

export default mongoose.models.OptOut || mongoose.model('OptOut', OptOutSchema);
