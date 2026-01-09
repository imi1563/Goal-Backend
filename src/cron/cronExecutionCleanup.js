import cron from 'node-cron';
import { createCronJob, withRetry, withTimeout } from '../utils/cronWrapper.js';
import { startCronTracking } from '../utils/cronTracker.js';

const RETENTION_DAYS = 30; // Keep records for 30 days
const BATCH_SIZE = 1000; // Process in batches if needed
const DAY_OF_WEEK = 1; // 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
const HOUR = 6; // Hour in UTC (06:00 UTC = 11:00 AM PKT)

const cleanupCronExecutions = async () => {
  const tracker = await startCronTracking('Cron Execution Cleanup');
  
  try {
    console.log(`🧹 Starting cron execution records cleanup (older than ${RETENTION_DAYS} days)... [Tracked: ${tracker.executionId}]`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    
    console.log(`📅 Deleting cron execution records older than ${cutoffDate.toISOString()} (${RETENTION_DAYS} days retention)`);
    
    const CronExecution = (await import('../models/cronExecutionModel.js')).default;
    
    // Count records to delete
    const recordsToDelete = await CronExecution.countDocuments({
      executionTime: { $lt: cutoffDate }
    });
    
    if (recordsToDelete === 0) {
      console.log('✅ No old cron execution records to delete. Database is clean!');
      await tracker.success({ message: 'No old records to delete', deleted: 0 });
      return { deleted: 0 };
    }
    
    console.log(`📊 Found ${recordsToDelete} old cron execution records to delete`);
    
    // Delete in batches if there are many records
    let totalDeleted = 0;
    let hasMore = true;
    let skip = 0;
    
    while (hasMore) {
      const records = await CronExecution.find({
        executionTime: { $lt: cutoffDate }
      })
      .select('_id cronName executionTime status')
      .sort({ executionTime: 1 })
      .skip(skip)
      .limit(BATCH_SIZE);
      
      if (records.length === 0) {
        hasMore = false;
        break;
      }
      
      const recordIds = records.map(r => r._id);
      
      try {
        const deleteResult = await CronExecution.deleteMany({
          _id: { $in: recordIds }
        });
        
        totalDeleted += deleteResult.deletedCount;
        console.log(`🗑️ Deleted batch: ${deleteResult.deletedCount} records (Total: ${totalDeleted})`);
        
        skip += BATCH_SIZE;
        
        if (records.length === BATCH_SIZE) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (batchError) {
        console.error(`❌ Error deleting batch starting at ${skip}:`, batchError.message);
        skip += BATCH_SIZE;
      }
    }
    
    const remainingOldRecords = await CronExecution.countDocuments({
      executionTime: { $lt: cutoffDate }
    });
    
    console.log('🎉 Cron execution records cleanup completed!');
    console.log(`📊 Summary:`);
    console.log(`  - Records deleted: ${totalDeleted}`);
    console.log(`  - Remaining old records: ${remainingOldRecords}`);
    console.log(`  - Retention period: ${RETENTION_DAYS} days`);
    
    await tracker.success({ 
      deleted: totalDeleted, 
      remaining: remainingOldRecords,
      retentionDays: RETENTION_DAYS
    });
    
    return {
      deleted: totalDeleted,
      remaining: remainingOldRecords
    };
    
  } catch (error) {
    await tracker.fail(error);
    console.error('💥 Error in cron execution records cleanup:', error.message);
    throw error;
  }
};

export const startCronExecutionCleanupJob = () => {
  const wrappedCleanupJob = createCronJob(
    'Cron Execution Cleanup',
    withTimeout(withRetry(cleanupCronExecutions, 2, 10000), 1800000), // 30 minutes timeout
    {
      sendSuccessNotification: false,
      context: { jobType: 'cleanup', frequency: 'weekly' }
    }
  );

  // Run weekly on specified day at specified hour
  // Day of week: 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[DAY_OF_WEEK];
  const pktHour = HOUR + 5; // UTC + 5 = PKT
  
  cron.schedule(`0 ${HOUR} * * ${DAY_OF_WEEK}`, wrappedCleanupJob, {
    timezone: 'UTC'
  });
  
  console.log(`⏰ Cron execution records cleanup scheduled: weekly on ${dayName} at ${String(HOUR).padStart(2, '0')}:00 UTC (${String(pktHour).padStart(2, '0')}:00 PKT)`);
  console.log(`📅 Retention period: ${RETENTION_DAYS} days`);
  console.log(`🔧 Batch size: ${BATCH_SIZE} records per batch`);
};

export const triggerCronExecutionCleanup = async () => {
  try {
    console.log('🔧 Manual trigger: Starting cron execution records cleanup...');
    return await cleanupCronExecutions();
  } catch (error) {
    console.error('💥 Manual cron execution cleanup failed:', error.message);
    throw error;
  }
};

