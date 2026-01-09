import cron from 'node-cron';
import { updateAllActiveTeamsStatistics } from '../services/teamStatsService.js';
import { getCurrentFootballSeason } from '../utils/seasonUtils.js';
import { startCronTracking } from '../utils/cronTracker.js';
import { createCronJob, withRetry, withTimeout } from '../utils/cronWrapper.js';

export const updateTeamStatisticsJob = async () => {
  try {
    console.log('🔄 Starting scheduled team statistics update...');
    
    const result = await updateAllActiveTeamsStatistics();
    
    console.log('✅ Team statistics update completed successfully!');
    console.log(`📊 Results: ${result.successful} successful, ${result.failed} failed`);
    
    return result;
  } catch (error) {
    console.error('💥 Error in scheduled team statistics update:', error.message);
    throw error;
  }
};

export const updateTeamStatisticsForLeague = async (leagueId, season) => {
  try {
    console.log(`🔄 Starting team statistics update for League ${leagueId}, Season ${season}...`);
    
    const { updateAllTeamsStatisticsInLeague } = await import('../services/teamStatsService.js');
    const result = await updateAllTeamsStatisticsInLeague(leagueId, season);
    
    console.log(`✅ Team statistics update completed for League ${leagueId}, Season ${season}!`);
    console.log(`📊 Results: ${result.successful} successful, ${result.failed} failed`);
    
    return result;
  } catch (error) {
    console.error(`💥 Error updating team statistics for League ${leagueId}, Season ${season}:`, error.message);
    throw error;
  }
};

const updateTeamStatisticsWithTracking = async () => {
  let tracker = null;
  try {
    tracker = await startCronTracking('Team Stats Update');
    console.log(`   [Tracked: ${tracker.executionId}]`);
  } catch (trackError) {
    console.warn('⚠️  Cron tracking failed, continuing without tracking:', trackError.message);
  }
  
  try {
    const result = await updateTeamStatisticsJob();
    
    if (tracker) {
      await tracker.success({ successful: result.successful, failed: result.failed });
    }
    console.log('⏰ Team stats update completed, predictions will run at 00:40 UTC');
    return result;
  } catch (error) {
    if (tracker) {
      try {
        await tracker.fail(error);
      } catch (trackError) {
        console.warn('⚠️  Failed to log error to tracker:', trackError.message);
      }
    }
    console.error('💥 Daily team statistics update failed:', error.message);
    throw error;
  }
};

export const startTeamStatisticsUpdateJobs = () => {
  const wrappedTeamStatsJob = createCronJob(
    'Team Statistics Update',
    withTimeout(withRetry(updateTeamStatisticsWithTracking, 2, 10000), 10800000), // 3 hours timeout (for 10000+ leagues/teams)
    {
      sendSuccessNotification: false,
      context: { jobType: 'team_stats_update' }
    }
  );

  cron.schedule('30 2 * * *', wrappedTeamStatsJob, {
    timezone: 'UTC'
  });

  console.log('⏰ Team statistics update jobs scheduled:');
  console.log('   - Daily update: Every day at 00:30 UTC (3 hour timeout, 2 retries)');
  console.log('⏰ Team statistics update jobs scheduled successfully');
};

export const triggerTeamStatisticsUpdate = async (leagueId = null, season = null) => {
  try {
    if (leagueId && season) {
      console.log(`🔧 Manual trigger: Updating team statistics for League ${leagueId}, Season ${season}`);
      return await updateTeamStatisticsForLeague(leagueId, season);
    } else {
      console.log('🔧 Manual trigger: Updating all team statistics');
      return await updateTeamStatisticsJob();
    }
  } catch (error) {
    console.error('💥 Manual team statistics update failed:', error.message);
    throw error;
  }
};
