import cron from 'node-cron';
import Match from '../models/matchModel.js';
import { generatePredictionsForMatches } from '../services/matchPredictionService.js';
import { createCronJob, withRetry, withTimeout } from '../utils/cronWrapper.js';
import { startCronTracking } from '../utils/cronTracker.js';

export const generateMatchPredictionsForUpcomingMatches = async () => {
  const tracker = await startCronTracking('Match Predictions');
  
  try {
    console.log(`🔮 Starting automated match prediction generation for ALL matches (past/present/future)... [Tracked: ${tracker.executionId}]`);
    
    const now = new Date();
    
    const allMatches = await Match.find({
    }).select('_id');
    
    if (allMatches.length === 0) {
      console.log('ℹ️ No matches found in database');
      return;
    }
    
    console.log(`📅 Found ${allMatches.length} total matches in database`);
    
    const MatchPrediction = (await import('../models/matchPredictionModel.js')).default;
    const existingPredictions = await MatchPrediction.find({
      match: { $in: allMatches.map(m => m._id) }
    }).select('match');
    
    const existingMatchIds = new Set(existingPredictions.map(p => p.match.toString()));
    const matchesWithoutPredictions = allMatches.filter(m => !existingMatchIds.has(m._id.toString()));
    
    if (matchesWithoutPredictions.length === 0) {
      console.log('✅ All matches already have predictions');
      return;
    }
    
    console.log(`📊 Found ${matchesWithoutPredictions.length} matches without predictions`);
    console.log(`📊 ${existingPredictions.length} matches already have predictions`);
    
    const matchIds = matchesWithoutPredictions.map(match => match._id);
    
    const results = await generatePredictionsForMatches(matchIds);
    
    console.log(`✅ Successfully generated ${results.length} match predictions`);
    await tracker.success({ predictionsGenerated: results.length });
    
    return results;
    
  } catch (error) {
    await tracker.fail(error);
    console.error('💥 Error in match prediction generation:', error.message);
    throw error;
  }
};

export const generateMatchPredictionsForNext24Hours = async () => {
  try {
    console.log('🔮 Starting 24-hour match prediction generation...');
    
    const now = new Date();
    const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    const upcomingMatches = await Match.find({
      date: { $gte: now, $lte: twentyFourHoursLater },
      'status.short': { $in: ['NS', 'TBD', 'PST'] }
    }).select('_id');
    
    if (upcomingMatches.length === 0) {
      console.log('ℹ️ No upcoming matches found in the next 24 hours');
      return;
    }
    
    console.log(`📅 Found ${upcomingMatches.length} upcoming matches for next 24 hours`);
    
    const matchIds = upcomingMatches.map(match => match._id);
    
    const results = await generatePredictionsForMatches(matchIds);
    
    console.log(`✅ Successfully generated ${results.length} match predictions for next 24 hours`);
    
    return results;
    
  } catch (error) {
    console.error('💥 Error in 24-hour match prediction generation:', error.message);
  }
};

export const generateMatchPredictionsForAllUpcoming = async () => {
  try {
    console.log('🔮 Starting comprehensive match prediction generation for all upcoming matches...');
    
    const now = new Date();
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const upcomingMatches = await Match.find({
      date: { $gte: now, $lte: sevenDaysLater },
      'status.short': { $in: ['NS', 'TBD', 'PST'] }
    }).select('_id');
    
    if (upcomingMatches.length === 0) {
      console.log('ℹ️ No upcoming matches found in the next 7 days');
      return;
    }
    
    console.log(`📅 Found ${upcomingMatches.length} upcoming matches for next 7 days`);
    
    const matchIds = upcomingMatches.map(match => match._id);
    
    const results = await generatePredictionsForMatches(matchIds);
    
    console.log(`✅ Successfully generated ${results.length} match predictions for all upcoming matches`);
    
    return results;
    
  } catch (error) {
    console.error('💥 Error in comprehensive match prediction generation:', error.message);
  }
};

export const startMatchPredictionGenerationJobs = () => {
  const wrappedPredictionJob = createCronJob(
    'Match Prediction Generation (All Matches)',
    withTimeout(withRetry(generateMatchPredictionsForUpcomingMatches, 2, 10000), 7200000), // 120 minutes (2 hours) timeout
    {
      sendSuccessNotification: false,
      context: { jobType: 'prediction_generation', window: 'all_matches' }
    }
  );

  cron.schedule('30 3 * * *', wrappedPredictionJob, {
    timezone: 'UTC'
  });

  console.log('⏰ Match prediction generation job scheduled: ALL matches (past/present/future) without predictions daily at 00:40 UTC (2 hour timeout, 2 retries)');
};

export const generatePredictionsForSpecificMatches = async (matchIds) => {
  try {
    console.log(`🔮 Manually generating predictions for ${matchIds.length} specific matches...`);
    
    const results = await generatePredictionsForMatches(matchIds);
    
    console.log(`✅ Successfully generated ${results.length} match predictions`);
    
    return results;
  } catch (error) {
    console.error('💥 Error in manual match prediction generation:', error.message);
    throw error;
  }
};
