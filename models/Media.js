import mongoose from 'mongoose';

// Campaign attachments. Kept out of the campaign document so campaigns stay
// far below MongoDB's 16 MB document limit.
const MediaSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  sha256: { type: String, required: true },
  data: { type: Buffer, required: true },
}, { timestamps: true });

MediaSchema.index({ userId: 1, sha256: 1 });

export default mongoose.models.Media || mongoose.model('Media', MediaSchema);
