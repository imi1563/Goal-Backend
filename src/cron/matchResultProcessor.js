import cron from 'node-cron';
import Match from '../models/matchModel.js';
import { processMatchPredictions } from '../services/matchPredictionService.js';
import MatchPrediction from '../models/matchPredictionModel.js';
import { createCronJob, withRetry, withTimeout } from '../utils/cronWrapper.js';
import { startCronTracking } from '../utils/cronTracker.js';

const FINISHED_STATUSES = ['FT', 'AET', 'PEN'];

export const processFinishedMatchesOnce = async () => {
  const tracker = await startCronTracking('Match Result Processor');
  
  try {
    const pendingPredictions = await MatchPrediction.find({ isProcessed: false }).select('match');
    if (pendingPredictions.length === 0) {
      await tracker.success({ message: 'No pending predictions to process' });
      return;
    }

    const matchIds = pendingPredictions.map(p => p.match);
    const finishedMatches = await Match.find({ _id: { $in: matchIds }, 'status.short': { $in: FINISHED_STATUSES } }).select('_id');
    if (finishedMatches.length === 0) {
      await tracker.success({ message: 'No finished matches to process' });
      return;
    }

    let processed = 0;
    let failed = 0;
    
    for (const m of finishedMatches) {
      try {
        await processMatchPredictions(m._id);
        processed++;
      } catch (e) {
        failed++;
        console.warn(`⚠️ Failed to process finished match ${m._id}:`, e?.message || e);
      }
    }
    
    await tracker.success({ processed, failed });
  } catch (error) {
    await tracker.fail(error);
    console.error('💥 Error in match result processor:', error.message);
    throw error;
  }
};

export const startMatchResultProcessorJob = () => {
  const wrappedProcessorJob = createCronJob(
    'Match Result Processor',
    withTimeout(withRetry(processFinishedMatchesOnce, 2, 5000), 300000),
    {
      sendSuccessNotification: false,
      context: { jobType: 'result_processing', frequency: 'daily' }
    }
  );

  cron.schedule('0 5 * * *', wrappedProcessorJob, {
    timezone: 'UTC'
  });
  console.log('⏰ Finished match processor scheduled: daily at 05:00 UTC');
};


