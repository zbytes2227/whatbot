// /models/MessageHistory.js
import mongoose from 'mongoose';

// pending  - recorded, send not yet confirmed
// sent     - accepted by WhatsApp servers
// delivered/read - receipts from the recipient's device
// failed   - definitely not sent
// unknown  - send was attempted but the outcome is uncertain
// skipped  - recipient opted out
export const SENT_STATUSES = ['sent', 'delivered', 'read'];
export const DELIVERY_STATUSES = ['pending', 'sent', 'delivered', 'read', 'failed', 'unknown', 'skipped'];

const MessageHistorySchema = new mongoose.Schema({
  campaignId: { type: String, index: true },
  runNumber: { type: Number },
  messageIndex: { type: Number },
  number: { type: String, required: true },
  originalNumber: { type: String, required: true },

  message: { type: String, default: '' },
  deliveryStatus: { type: String, default: 'pending' },
  deliveryTime: { type: Number },
  waMessageId: { type: String },
  deliveredAt: { type: Date },
  readAt: { type: Date },
  repliedAt: { type: Date },

  source: { type: String, enum: ['campaign', 'api', 'manual'], required: true },
  clientUsed: { type: String, required: true },

  hasMedia: { type: Boolean, default: false },
  mediaType: { type: String },
  mediaName: { type: String },

  sentTime: { type: Date, default: Date.now },
  error: { type: String },
}, { timestamps: true });

MessageHistorySchema.index({ sentTime: -1 });
MessageHistorySchema.index({ campaignId: 1, sentTime: -1 });
MessageHistorySchema.index({ campaignId: 1, runNumber: 1, number: 1 });
MessageHistorySchema.index({ waMessageId: 1 }, { sparse: true });
MessageHistorySchema.index({ number: 1, sentTime: -1 });
MessageHistorySchema.index({ deliveryStatus: 1, sentTime: -1 });

export default mongoose.models.MessageHistory || mongoose.model('MessageHistory', MessageHistorySchema);
