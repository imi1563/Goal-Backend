import mongoose from 'mongoose';

const cronExecutionSchema = new mongoose.Schema({
  cronName: {
    type: String,
    required: true,
    index: true
  },
  executionTime: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  executionTimeUTC: {
    type: String,
    required: true
  },
  executionTimeLocal: {
    type: String,
    required: true
  },
  serverTimezone: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['started', 'success', 'failed'],
    required: true,
    default: 'started'
  },
  duration: {
    type: Number, // milliseconds
    default: null
  },
  error: {
    type: String,
    default: null
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Index for efficient queries
cronExecutionSchema.index({ cronName: 1, executionTime: -1 });
cronExecutionSchema.index({ executionTime: -1 });

const CronExecution = mongoose.model('CronExecution', cronExecutionSchema);

export default CronExecution;

