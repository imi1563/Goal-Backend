import CronExecution from '../models/cronExecutionModel.js';

/**
 * Tracks cron job execution start
 * @param {string} cronName - Name of the cron job
 * @returns {Promise<Object>} - Tracker object with methods to update status
 */
export const startCronTracking = async (cronName) => {
  const executionTime = new Date();
  const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  const execution = await CronExecution.create({
    cronName,
    executionTime,
    executionTimeUTC: executionTime.toISOString(),
    executionTimeLocal: executionTime.toLocaleString('en-US', { timeZone: serverTimezone }),
    serverTimezone,
    status: 'started'
  });
  
  const startTime = Date.now();
  
  return {
    executionId: execution._id,
    executionTime,
    
    /**
     * Mark cron as successful
     * @param {Object} details - Optional details about execution
     */
    success: async (details = {}) => {
      const duration = Date.now() - startTime;
      await CronExecution.findByIdAndUpdate(execution._id, {
        status: 'success',
        duration,
        details
      });
      
      console.log(`✅ [${cronName}] Completed successfully in ${(duration / 1000).toFixed(2)}s`);
    },
    
    /**
     * Mark cron as failed
     * @param {Error|string} error - Error object or message
     * @param {Object} details - Optional details about execution
     */
    fail: async (error, details = {}) => {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      await CronExecution.findByIdAndUpdate(execution._id, {
        status: 'failed',
        duration,
        error: errorMessage,
        details
      });
      
      console.error(`❌ [${cronName}] Failed after ${(duration / 1000).toFixed(2)}s: ${errorMessage}`);
    }
  };
};

/**
 * Get last execution time for a cron
 * @param {string} cronName - Name of the cron job
 * @returns {Promise<Object|null>} - Last execution or null
 */
export const getLastExecution = async (cronName) => {
  return await CronExecution.findOne({ cronName, status: 'success' })
    .sort({ executionTime: -1 })
    .lean();
};

/**
 * Get execution history for a cron
 * @param {string} cronName - Name of the cron job
 * @param {number} limit - Number of records to return
 * @returns {Promise<Array>} - Array of executions
 */
export const getExecutionHistory = async (cronName, limit = 10) => {
  return await CronExecution.find({ cronName })
    .sort({ executionTime: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get all cron executions in last N hours
 * @param {number} hours - Number of hours to look back
 * @returns {Promise<Array>} - Array of executions
 */
export const getRecentExecutions = async (hours = 24) => {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  return await CronExecution.find({ executionTime: { $gte: cutoffTime } })
    .sort({ executionTime: -1 })
    .lean();
};

/**
 * Get summary of all cron jobs
 * @returns {Promise<Array>} - Array of cron summaries
 */
export const getCronSummary = async () => {
  const allCrons = [
    'League Sync',
    'Fixture Update',
    'Team Stats Update',
    'Match Predictions',
    'Prediction Stats Guard',
    'Match Result Processor',
    'Finished Match Cleanup',
    'Fixture and Prediction Update'
  ];
  
  const summaries = await Promise.all(
    allCrons.map(async (cronName) => {
      const lastExecution = await CronExecution.findOne({ cronName })
        .sort({ executionTime: -1 })
        .lean();
      
      const lastSuccess = await CronExecution.findOne({ cronName, status: 'success' })
        .sort({ executionTime: -1 })
        .lean();
      
      const last24h = await CronExecution.countDocuments({
        cronName,
        executionTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });
      
      const failures = await CronExecution.countDocuments({
        cronName,
        status: 'failed',
        executionTime: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      });
      
      return {
        cronName,
        lastExecution: lastExecution ? {
          time: lastExecution.executionTimeUTC,
          status: lastExecution.status,
          duration: lastExecution.duration
        } : null,
        lastSuccess: lastSuccess ? lastSuccess.executionTimeUTC : null,
        executionsLast24h: last24h,
        failuresLast7Days: failures
      };
    })
  );
  
  return summaries;
};

/**
 * Clean up old execution records (keep last 30 days)
 */
export const cleanupOldExecutions = async () => {
  const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await CronExecution.deleteMany({ executionTime: { $lt: cutoffDate } });
  console.log(`🧹 Cleaned up ${result.deletedCount} old cron execution records`);
  return result.deletedCount;
};

