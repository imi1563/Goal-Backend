import cron from 'node-cron';
import PredictionStats from '../models/predictionStatsModel.js';
import MatchPrediction from '../models/matchPredictionModel.js';
import Match from '../models/matchModel.js';
import { createCronJob, withRetry, withTimeout } from '../utils/cronWrapper.js';
import { startCronTracking } from '../utils/cronTracker.js';

const FIELDS_CONSIDERED = ['doubleChance1X','doubleChanceX2','btts','over25','under25','corners'];
const FINISHED = ['FT','AET','PEN'];

export const initializePredictionStatsIfMissing = async () => {
  const tracker = await startCronTracking('Prediction Stats Guard');
  
  try {
    const exists = await PredictionStats.findById('global');
    if (exists) {
      await tracker.success({ message: 'PredictionStats already exists, no initialization needed' });
      return;
    }

  const predictions = await MatchPrediction.find({}, { match: 1 });
  const matchIds = predictions.map(p => p.match);

  const simulatedTotal = predictions.length * FIELDS_CONSIDERED.length;
  const perFieldSimulated = Object.fromEntries(FIELDS_CONSIDERED.map(f => [f, predictions.length]));

  const matches = await Match.find({ _id: { $in: matchIds }, 'status.short': { $in: FINISHED } }, { goals: 1 });
  const finishedMap = new Map(matches.map(m => [String(m._id), m]));

  let wonTotal = 0;
  const perFieldWon = Object.fromEntries(FIELDS_CONSIDERED.map(f => [f, 0]));

  for (const p of predictions) {
    const m = finishedMap.get(String(p.match));
    if (!m) continue;
    const ah = m?.goals?.home ?? null;
    const aa = m?.goals?.away ?? null;
    const totalCorners = m?.corners?.total ?? null;
    if (ah === null || aa === null) continue;
    
    const actualOutcome = ah > aa ? 'home' : (ah < aa ? 'away' : 'draw');
    const totalGoals = (ah || 0) + (aa || 0);
    const winningFields = [];
    
    if (actualOutcome === 'home' || actualOutcome === 'draw') winningFields.push('doubleChance1X');
    
    if (actualOutcome === 'draw' || actualOutcome === 'away') winningFields.push('doubleChanceX2');
    
    if (ah > 0 && aa > 0) winningFields.push('btts');
    
    if (totalGoals > 2.5) winningFields.push('over25');
    
    if (totalGoals < 2.5) winningFields.push('under25');
    
    if (totalCorners !== null && p.manualCorners?.cornerPrediction) {
      const { cornerPrediction, cornerThreshold } = p.manualCorners;
      if (cornerPrediction === 'over' && totalCorners > cornerThreshold) {
        winningFields.push('corners');
      } else if (cornerPrediction === 'under' && totalCorners < cornerThreshold) {
        winningFields.push('corners');
      }
    }
    
    if (winningFields.length > 0) {
      wonTotal += 1;
      for (const f of winningFields) perFieldWon[f] += 1;
    }
  }

  await PredictionStats.updateOne(
    { _id: 'global' },
    {
      $set: {
        simulatedTotal,
        wonTotal,
        perFieldSimulated,
        perFieldWon,
        fieldsConsidered: FIELDS_CONSIDERED
      }
    },
    { upsert: true }
  );
  console.log('📊 PredictionStats initialized from existing data');
  await tracker.success({ message: 'PredictionStats initialized successfully' });
  
  } catch (error) {
    await tracker.fail(error);
    console.error('💥 Error in prediction stats guard:', error.message);
    throw error;
  }
};

export const startPredictionStatsGuardJob = () => {
  const wrappedGuardJob = createCronJob(
    'Prediction Stats Guard',
    withTimeout(withRetry(initializePredictionStatsIfMissing, 1, 10000), 180000),
    {
      sendSuccessNotification: false,
      context: { jobType: 'stats_guard', frequency: 'daily' }
    }
  );

  cron.schedule('30 4 * * *', wrappedGuardJob, {
    timezone: 'UTC'
  });
  console.log('⏰ PredictionStats guard scheduled: daily at 04:30 UTC');
};


