import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getCronSummary, getRecentExecutions, getExecutionHistory } from '../src/utils/cronTracker.js';

dotenv.config();

const checkCronHistory = async () => {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 CRON EXECUTION HISTORY');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // Get summary of all crons
    const summary = await getCronSummary();
    
    console.log('📋 CRON SUMMARY (Last 24 Hours):');
    console.log('─────────────────────────────────────────────────────────\n');
    
    summary.forEach(cron => {
      console.log(`🔧 ${cron.cronName}`);
      
      if (cron.lastExecution) {
        console.log(`   Last Run: ${cron.lastExecution.time}`);
        console.log(`   Status: ${cron.lastExecution.status === 'success' ? '✅ Success' : '❌ Failed'}`);
        if (cron.lastExecution.duration) {
          console.log(`   Duration: ${(cron.lastExecution.duration / 1000).toFixed(2)}s`);
        }
      } else {
        console.log('   ⚠️  Never executed');
      }
      
      if (cron.lastSuccess && cron.lastSuccess !== cron.lastExecution?.time) {
        console.log(`   Last Success: ${cron.lastSuccess}`);
      }
      
      console.log(`   Executions (24h): ${cron.executionsLast24h}`);
      
      if (cron.failuresLast7Days > 0) {
        console.log(`   ⚠️  Failures (7d): ${cron.failuresLast7Days}`);
      }
      
      console.log('');
    });
    
    // Get recent executions across all crons
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📜 RECENT EXECUTIONS (Last 24 Hours):');
    console.log('─────────────────────────────────────────────────────────\n');
    
    const recentExecutions = await getRecentExecutions(24);
    
    if (recentExecutions.length === 0) {
      console.log('⚠️  No cron executions found in last 24 hours');
      console.log('💡 This means either:');
      console.log('   1. Server hasn\'t been running for 24 hours');
      console.log('   2. Crons haven\'t reached their scheduled time yet');
      console.log('   3. This is the first time running with tracking enabled\n');
    } else {
      recentExecutions.forEach(exec => {
        const statusEmoji = exec.status === 'success' ? '✅' : exec.status === 'failed' ? '❌' : '⏳';
        const durationStr = exec.duration ? ` (${(exec.duration / 1000).toFixed(2)}s)` : '';
        
        console.log(`${statusEmoji} ${exec.cronName}`);
        console.log(`   Time: ${exec.executionTimeUTC}`);
        console.log(`   Local: ${exec.executionTimeLocal}`);
        console.log(`   Status: ${exec.status}${durationStr}`);
        
        if (exec.error) {
          console.log(`   Error: ${exec.error}`);
        }
        
        if (exec.details && Object.keys(exec.details).length > 0) {
          console.log(`   Details: ${JSON.stringify(exec.details)}`);
        }
        
        console.log('');
      });
      
      console.log(`📊 Total executions in last 24h: ${recentExecutions.length}`);
    }
    
    // Show detailed history for Fixture Update
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🏟️  FIXTURE UPDATE HISTORY (Last 10):');
    console.log('─────────────────────────────────────────────────────────\n');
    
    const fixtureHistory = await getExecutionHistory('Fixture Update', 10);
    
    if (fixtureHistory.length === 0) {
      console.log('⚠️  No fixture update executions found');
      console.log('💡 This cron runs daily at 00:20 UTC (5:20 AM PKT)\n');
    } else {
      fixtureHistory.forEach((exec, index) => {
        const statusEmoji = exec.status === 'success' ? '✅' : exec.status === 'failed' ? '❌' : '⏳';
        const durationStr = exec.duration ? ` in ${(exec.duration / 1000).toFixed(2)}s` : '';
        
        console.log(`${index + 1}. ${statusEmoji} ${exec.executionTimeUTC}${durationStr}`);
        
        if (exec.error) {
          console.log(`   ❌ Error: ${exec.error}`);
        }
      });
    }
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ History check complete!');
    console.log('═══════════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('❌ Error checking cron history:', error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

checkCronHistory();

