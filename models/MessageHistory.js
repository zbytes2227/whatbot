// /models/MessageHistory.js
import mongoose from 'mongoose';

const MessageHistorySchema = new mongoose.Schema({
  number: { type: String, required: true },
  originalNumber: { type: String, required: true },      // As received before formatting

  // Message content and delivery
  message: { type: String, required: true },
  deliveryStatus: {
    type: String, 
    default: 'pending'
  },
  deliveryTime: { type: Number },                        // Delivery time in milliseconds

  // Source tracking
  source: {
    type: String,
    enum: ['campaign', 'api', 'manual'],
    required: true
  },

  // WhatsApp client details
  clientUsed: { type: String, required: true },

  // Media information
  hasMedia: { type: Boolean, default: false },
  mediaType: { type: String },
  mediaName: { type: String },

  sentTime: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.models.MessageHistory || mongoose.model('MessageHistory', MessageHistorySchema);
