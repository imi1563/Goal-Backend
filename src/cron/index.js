import mongoose from 'mongoose';
import { startLeagueSyncJob } from './leagueSync.js';
import { startFixtureUpdateJob } from './fixtureUpdate.js';
import { startLiveMatchUpdater } from './liveMatchUpdater.js';
import { startMatchPredictionGenerationJobs } from './matchPredictionGenerator.js';
import { startTeamStatisticsUpdateJobs } from './teamStatsUpdater.js';
import { startMatchResultProcessorJob } from './matchResultProcessor.js';
import { startPredictionStatsGuardJob } from './predictionStatsGuard.js';
import { startFinishedMatchCleanupJob } from './finishedMatchCleanup.js';
import { startFixtureAndPredictionUpdateJob } from './fixtureAndPredictionUpdate.js';
import { startCronExecutionCleanupJob } from './cronExecutionCleanup.js';
import { startUnmarkExpiredMatchesJob } from './unmarkExpiredMatches.js';

export const startAllCronJobs = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.log('⏳ Waiting for MongoDB connection...');
      await new Promise((resolve) => {
        const checkConnection = () => {
          if (mongoose.connection.readyState === 1) {
            resolve();
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    }
    
    console.log('🚀 Starting all cron jobs...');
    
    startLeagueSyncJob();
    
    startFixtureUpdateJob();
    
    startLiveMatchUpdater();
    
    startMatchPredictionGenerationJobs();
    startMatchResultProcessorJob();
    startPredictionStatsGuardJob();
    
    startTeamStatisticsUpdateJobs();
    
    startFinishedMatchCleanupJob();
    
    startFixtureAndPredictionUpdateJob();
    
    startCronExecutionCleanupJob();
    
    startUnmarkExpiredMatchesJob();
    
    console.log('✅ All cron jobs started successfully!');
    console.log('📅 League sync: Daily at 00:10 UTC');
    console.log('📅 Fixture update: Daily at 01:30 UTC');
    console.log('📊 Team statistics: Daily at 02:30 UTC');
    console.log('🔮 Match predictions: Daily at 03:30 UTC');
    console.log('🛡️ Prediction stats guard: Daily at 04:30 UTC');
    console.log('📊 Match result processor: Daily at 05:00 UTC');
    console.log('🧹 Old matches cleanup: Daily at 05:30 UTC');
    console.log('🔄 Fixture & prediction update: Daily at 05:45 UTC');
    console.log('🧹 Cron execution records cleanup: Weekly on Monday at 06:00 UTC');
    console.log('🔄 Unmark expired matches: Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)');
    console.log('⏱️ Live match updates: Every 2 minutes (starts immediately)');
  } catch (error) {
    console.error('💥 Failed to start cron jobs:', error.message);
  }
};
