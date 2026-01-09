import { sendCronFailureAlert, sendCronSuccessNotification } from '../services/emailService.js';

export const withCronErrorHandling = (jobName, jobFunction, options = {}) => {
  return async (...args) => {
    const startTime = Date.now();
    let stats = {};
    
    try {
      console.log(`🚀 Starting cron job: ${jobName}`);
      
      const result = await jobFunction(...args);
      
      const executionTime = Date.now() - startTime;
      stats = {
        executionTime: `${executionTime}ms`,
        status: 'success',
        result: result,
        ...options.stats
      };
      
      console.log(`✅ Cron job completed: ${jobName} (${executionTime}ms)`);
      
      if (options.sendSuccessNotification) {
        await sendCronSuccessNotification(jobName, stats);
      }
      
      return result;
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      console.error(`❌ Cron job failed: ${jobName}`, error);
      
      const errorContext = {
        executionTime: `${executionTime}ms`,
        args: args.length > 0 ? args : undefined,
        timestamp: new Date().toISOString(),
        ...options.context
      };
      
      await sendCronFailureAlert(
        jobName,
        error.message,
        error.stack,
        errorContext
      );
      
      if (options.rethrow !== false) {
        throw error;
      }
    }
  };
};

export const createCronJob = (jobName, jobFunction, options = {}) => {
  const wrappedFunction = withCronErrorHandling(jobName, jobFunction, {
    sendSuccessNotification: false,
    rethrow: false,
    ...options
  });
  
  return wrappedFunction;
};

export const withRetry = (jobFunction, maxRetries = 3, delay = 5000) => {
  return async (...args) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt}/${maxRetries} for job`);
        return await jobFunction(...args);
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Attempt ${attempt} failed:`, error.message);
        
        if (attempt < maxRetries) {
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  };
};

export const withTimeout = (jobFunction, timeoutMs = 300000) => {
  return async (...args) => {
    return Promise.race([
      jobFunction(...args),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Job timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  };
};
