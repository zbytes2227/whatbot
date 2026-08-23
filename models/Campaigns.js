import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema({
  campaignId: { type: String, required: true, unique: true },
  campaignName: { type: String, required: true },
  userId: { type: String, required: true },
  contactList: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactList', required: true },
  
  // Multiple mess ages  
  messages: [{
    text: { type: String, required: true },
    hasMedia: { type: Boolean, default: false },
    mediaType: { type: String },
    mediaName: { type: String },
    mediaData: { type: String }, // base64 encod ed media
  }],
  
  // Time-based scheduling
  scheduling: {
    startDate: { type: Date },
    startTime: { type: String }, // "07:00" format
    endTime: { type: String },   // "21:00" format
    timezone: { type: String, default: 'Asia/Kolkata' },
    pauseOnEndTime: { type: Boolean, default: true },
    resumeNextDay: { type: Boolean, default: true }
  },
  
  selectedClients: [{ type: String }],
  delaySettings: {
    minDelay: { type: Number, default: 5 }, // in minutes
    maxDelay: { type: Number, default: 25 } // in minutes
  },
  
  // Campaign status and timing
  status: { 
    type: String, 
    enum: ['pending', 'running', 'paused', 'completed', 'stopped', 'scheduled', 'error'], 
    default: 'pending' 
  },
  createdAt: { type: Date, default: Date.now },
  startTime: { type: Date },
  endTime: { type: Date },
  lastPausedAt: { type: Date },
  nextResumeAt: { type: Date },
  
  // Progress tracking
  totalNumbers: { type: Number, default: 0 },
  processedNumbers: { type: Number, default: 0 },
  successCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  currentIndex: { type: Number, default: 0 }, // Resume from this index
  
  // Live reporting
  numberReports: [{
    number: String,
    originalNumber: String,
    messageIndex: Number, // which message was sent (0-3)
    messageText: String,
    status: { type: String, enum: ['success', 'failed', 'pending'] },
    client: String,
    timestamp: { type: Date, default: Date.now },
    deliveryTime: Number,
    errorMessage: String,
    attemptNumber: { type: Number, default: 1 }
  }],
  
  summary: {
    totalProcessed: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },
    averageDeliveryTime: { type: Number, default: 0 },
    messagesDistribution: [{
      messageIndex: Number,
      sentCount: Number
    }]
  }
});

export default mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
