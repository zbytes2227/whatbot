import mongoose from 'mongoose';

export const CAMPAIGN_STATUSES = ['pending', 'running', 'paused', 'completed', 'stopped', 'scheduled', 'error', 'needs_review', 'draft'];

const messageSchema = new mongoose.Schema({
  text: { type: String, default: '' },
  hasMedia: { type: Boolean, default: false },
  mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },
  mediaType: { type: String },
  mediaName: { type: String },
  mediaSize: { type: Number },
  // Legacy: base64 media embedded in the campaign. New campaigns use mediaId.
  mediaData: { type: String },
}, { _id: false });

const campaignSchema = new mongoose.Schema({
  campaignId: { type: String, required: true, unique: true },
  campaignName: { type: String, required: true, maxlength: 120 },
  userId: { type: String, required: true },
  contactList: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactList', required: true },

  messages: [messageSchema],

  scheduling: {
    startDate: { type: Date },
    startAt: { type: Date },
    windowEnabled: { type: Boolean, default: true },
    startTime: { type: String }, // "07:00" in `timezone`
    endTime: { type: String },   // "21:00" in `timezone`
    timezone: { type: String, default: 'Asia/Kolkata' },
    pauseOnEndTime: { type: Boolean, default: true },
    resumeNextDay: { type: Boolean, default: true },
  },

  selectedClients: [{ type: String }],
  delaySettings: {
    minDelay: { type: Number, default: 5 },
    maxDelay: { type: Number, default: 25 },
    unit: { type: String, enum: ['seconds', 'minutes'], default: 'minutes' },
  },
  dailyLimit: { type: Number, default: 0 }, // 0 = unlimited
  dailyCount: { type: Number, default: 0 },
  dailyCountDate: { type: String },

  status: { type: String, enum: CAMPAIGN_STATUSES, default: 'pending' },
  pauseReason: { type: String },
  createdAt: { type: Date, default: Date.now },
  startTime: { type: Date },
  endTime: { type: Date },
  lastPausedAt: { type: Date },
  nextResumeAt: { type: Date },
  lastSentAt: { type: Date },
  lastError: { type: String },
  review: {
    historyId: { type: mongoose.Schema.Types.ObjectId },
    number: { type: String },
    reason: { type: String },
  },

  // Each rerun increments runNumber so history from earlier runs is kept.
  runNumber: { type: Number, default: 1 },
  runnerLeaseId: { type: String },
  runnerLeaseExpiresAt: { type: Date },
  runnerOwner: { type: String },

  totalNumbers: { type: Number, default: 0 },
  processedNumbers: { type: Number, default: 0 },
  successCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  skippedCount: { type: Number, default: 0 },
  currentIndex: { type: Number, default: 0 },

  // Legacy per-number reports. Superseded by MessageHistory; never loaded.
  numberReports: { type: Array, select: false },

  summary: {
    totalProcessed: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },
    averageDeliveryTime: { type: Number, default: 0 },
    messagesDistribution: [{ _id: false, messageIndex: Number, sentCount: Number }],
  },
}, { timestamps: { createdAt: false, updatedAt: true } });

campaignSchema.index({ userId: 1, createdAt: -1 });
campaignSchema.index({ status: 1, nextResumeAt: 1 });
campaignSchema.index({ status: 1, runnerLeaseExpiresAt: 1 });
campaignSchema.index({ 'messages.mediaId': 1 });

export default mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
