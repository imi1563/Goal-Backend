import cron from 'node-cron';
import Match from '../models/matchModel.js';
import MatchPrediction from '../models/matchPredictionModel.js';
import { createCronJob, withRetry, withTimeout } from '../utils/cronWrapper.js';
import { startCronTracking } from '../utils/cronTracker.js';

const RETENTION_DAYS = 1;
const BATCH_SIZE = 100;

export const cleanupFinishedMatches = async () => {
  const tracker = await startCronTracking('Finished Match Cleanup');
  
  try {
    console.log(`🧹 Starting old matches cleanup (all matches older than ${RETENTION_DAYS} day, regardless of status)... [Tracked: ${tracker.executionId}]`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    
    console.log(`📅 Deleting all matches older than ${cutoffDate.toISOString()} (${RETENTION_DAYS} days retention, regardless of status)`);
    
    const matchesToDelete = await Match.countDocuments({
      date: { $lt: cutoffDate }
    });
    
    if (matchesToDelete === 0) {
      console.log('✅ No old matches to delete. Database is clean!');
      await tracker.success({ message: 'No old matches to delete' });
      return { deleted: 0, skipped: 0 };
    }
    
    console.log(`📊 Found ${matchesToDelete} old matches to delete`);
    
    const sampleMatches = await Match.find({
      date: { $lt: cutoffDate }
    })
    .select('_id fixtureId status date homeTeam awayTeam leagueId')
    .sort({ date: -1 })
    .limit(5);
    
    console.log('📋 Sample matches to be deleted:');
    sampleMatches.forEach((match, index) => {
      const matchDate = new Date(match.date).toLocaleDateString();
      console.log(`  ${index + 1}. ${match.homeTeam} vs ${match.awayTeam} (${match.status.short}) - ${matchDate}`);
    });
    
    if (matchesToDelete > 5) {
      console.log(`  ... and ${matchesToDelete - 5} more matches`);
    }
    
    let totalDeleted = 0;
    let totalSkipped = 0;
    let totalPredictionsDeleted = 0;
    let hasMore = true;
    let skip = 0;
    
    while (hasMore) {
      const matches = await Match.find({
        date: { $lt: cutoffDate }
      })
      .select('_id fixtureId status date homeTeam awayTeam leagueId')
      .sort({ date: 1 })
      .skip(skip)
      .limit(BATCH_SIZE);
      
      if (matches.length === 0) {
        hasMore = false;
        break;
      }
      
      const matchIds = matches.map(match => match._id);
      
      try {
        const predictionsDeleteResult = await MatchPrediction.deleteMany({
          match: { $in: matchIds }
        });
        
        totalPredictionsDeleted += predictionsDeleteResult.deletedCount;
        console.log(`🗑️ Deleted ${predictionsDeleteResult.deletedCount} predictions for batch`);
        
        const deleteResult = await Match.deleteMany({
          _id: { $in: matchIds }
        });
        
        totalDeleted += deleteResult.deletedCount;
        console.log(`🗑️ Deleted batch: ${deleteResult.deletedCount} matches (Total: ${totalDeleted})`);
        
        skip += BATCH_SIZE;
        
        if (matches.length === BATCH_SIZE) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (batchError) {
        console.error(`❌ Error deleting batch starting at ${skip}:`, batchError.message);
        totalSkipped += matches.length;
        skip += BATCH_SIZE;
      }
    }
    
    const remainingOldMatches = await Match.countDocuments({
      date: { $lt: cutoffDate }
    });
    
    console.log('🎉 Old matches cleanup completed!');
    console.log(`📊 Summary:`);
    console.log(`  - Matches deleted: ${totalDeleted}`);
    console.log(`  - Predictions deleted: ${totalPredictionsDeleted}`);
    console.log(`  - Matches skipped (errors): ${totalSkipped}`);
    console.log(`  - Remaining old matches: ${remainingOldMatches}`);
    console.log(`  - Retention period: ${RETENTION_DAYS} days`);
    
    await tracker.success({ 
      deleted: totalDeleted, 
      predictionsDeleted: totalPredictionsDeleted, 
      skipped: totalSkipped, 
      remaining: remainingOldMatches 
    });
    
    return {
      deleted: totalDeleted,
      predictionsDeleted: totalPredictionsDeleted,
      skipped: totalSkipped,
      remaining: remainingOldMatches
    };
    
  } catch (error) {
    await tracker.fail(error);
    console.error('💥 Error in finished matches cleanup:', error.message);
    throw error;
  }
};

export const previewFinishedMatchesCleanup = async () => {
  try {
    console.log('👀 Previewing old matches cleanup...');
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    
    console.log(`📅 Would delete all matches older than ${cutoffDate.toISOString()} (${RETENTION_DAYS} days retention, regardless of status)`);
    
    const matchesToDelete = await Match.find({
      date: { $lt: cutoffDate }
    })
    .select('_id fixtureId status date homeTeam awayTeam leagueId')
    .sort({ date: -1 });
    
    if (matchesToDelete.length === 0) {
      console.log('✅ No old matches would be deleted. Database is clean!');
      return;
    }
    
    console.log(`📊 Found ${matchesToDelete.length} old matches that would be deleted`);
    
    const matchesByDate = {};
    matchesToDelete.forEach(match => {
      const dateKey = match.date.toISOString().split('T')[0];
      if (!matchesByDate[dateKey]) {
        matchesByDate[dateKey] = [];
      }
      matchesByDate[dateKey].push(match);
    });
    
    console.log('\n📋 Matches that would be deleted (grouped by date):');
    Object.keys(matchesByDate).sort().forEach(date => {
      console.log(`\n📅 ${date}:`);
      matchesByDate[date].forEach((match, index) => {
        console.log(`  ${index + 1}. ${match.homeTeam} vs ${match.awayTeam} (${match.status.short})`);
      });
    });
    
    const statusCounts = {};
    matchesToDelete.forEach(match => {
      const status = match.status.short;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    console.log('\n📊 Summary by status:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count} matches`);
    });
    
    console.log(`\n⚠️ Total matches that would be deleted: ${matchesToDelete.length}`);
    console.log(`💡 Run the cleanup cron job to actually delete these matches`);
    
  } catch (error) {
    console.error('❌ Error previewing finished matches cleanup:', error.message);
    throw error;
  }
};

export const startFinishedMatchCleanupJob = () => {
  const wrappedCleanupJob = createCronJob(
    'Old Matches Cleanup',
    withTimeout(withRetry(cleanupFinishedMatches, 2, 10000), 1800000),
    {
      sendSuccessNotification: false,
      context: { jobType: 'cleanup', frequency: 'daily' }
    }
  );

  cron.schedule('30 5 * * *', wrappedCleanupJob, {
    timezone: 'UTC'
  });
  
  console.log('⏰ Old matches cleanup scheduled: daily at 05:30 UTC');
  console.log(`📅 Retention period: ${RETENTION_DAYS} days`);
  console.log(`🔧 Batch size: ${BATCH_SIZE} matches per batch`);
};

export const triggerFinishedMatchCleanup = async () => {
  try {
    console.log('🔧 Manual trigger: Starting old matches cleanup...');
    return await cleanupFinishedMatches();
  } catch (error) {
    console.error('💥 Manual old matches cleanup failed:', error.message);
    throw error;
  }
};

export const triggerFinishedMatchCleanupPreview = async () => {
  try {
    console.log('🔧 Manual trigger: Previewing old matches cleanup...');
    return await previewFinishedMatchesCleanup();
  } catch (error) {
    console.error('💥 Manual old matches cleanup preview failed:', error.message);
    throw error;
  }
};
