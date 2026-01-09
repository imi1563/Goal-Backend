import mongoose from 'mongoose';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

// Import all cron job functions
import { runLeagueSync } from '../src/cron/leagueSync.js';
import { runFixtureUpdate } from '../src/cron/fixtureUpdate.js';
import { updateLiveMatches } from '../src/cron/liveMatchUpdater.js';
import { generateMatchPredictionsForUpcomingMatches } from '../src/cron/matchPredictionGenerator.js';
import { processFinishedMatchesOnce } from '../src/cron/matchResultProcessor.js';
import { initializePredictionStatsIfMissing } from '../src/cron/predictionStatsGuard.js';
import { triggerTeamStatisticsUpdate } from '../src/cron/teamStatsUpdater.js';
import { triggerFinishedMatchCleanup } from '../src/cron/finishedMatchCleanup.js';

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/football-backend';
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB Connected\n');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

// Cron jobs configuration
const cronJobs = [
  {
    id: 1,
    name: 'League Sync',
    description: 'Syncs league data from API (runs daily at 00:10 UTC)',
    function: runLeagueSync,
    estimatedTime: '~30-60s'
  },
  {
    id: 2,
    name: 'Fixture Update',
    description: 'Updates fixtures for next 2 days (runs daily at 00:20 UTC)',
    function: runFixtureUpdate,
    estimatedTime: '~1-3 min'
  },
  {
    id: 3,
    name: 'Live Match Updater',
    description: 'Updates live and upcoming matches (runs every 2 minutes)',
    function: updateLiveMatches,
    estimatedTime: '~10-30s'
  },
  {
    id: 4,
    name: 'Team Statistics Update',
    description: 'Updates team statistics (runs daily at 00:30 UTC)',
    function: () => triggerTeamStatisticsUpdate(),
    estimatedTime: '~2-5 min'
  },
  {
    id: 5,
    name: 'Match Prediction Generation',
    description: 'Generates predictions for matches without predictions (runs daily at 00:40 UTC)',
    function: generateMatchPredictionsForUpcomingMatches,
    estimatedTime: '~3-10 min'
  },
  {
    id: 6,
    name: 'Match Result Processor',
    description: 'Processes finished matches and updates predictions (runs daily at 03:30 UTC)',
    function: processFinishedMatchesOnce,
    estimatedTime: '~30s-2 min'
  },
  {
    id: 7,
    name: 'Prediction Stats Guard',
    description: 'Initializes prediction stats if missing (runs daily at 00:50 UTC)',
    function: initializePredictionStatsIfMissing,
    estimatedTime: '~10-30s'
  },
  {
    id: 8,
    name: 'Finished Match Cleanup',
    description: 'Cleans up old finished matches (runs daily at 00:10 UTC)',
    function: triggerFinishedMatchCleanup,
    estimatedTime: '~30s-2 min'
  },
  {
    id: 9,
    name: 'Run All Cron Jobs',
    description: 'Runs all cron jobs sequentially',
    function: null, // Special case
    estimatedTime: '~10-20 min'
  }
];

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to ask questions
const askQuestion = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};

// Display menu
const displayMenu = () => {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 CRON JOBS INTERACTIVE RUNNER');
  console.log('='.repeat(70));
  console.log('\nAvailable Cron Jobs:\n');
  
  cronJobs.forEach(job => {
    console.log(`  ${job.id}. ${job.name}`);
    console.log(`     📝 ${job.description}`);
    console.log(`     ⏱️  Estimated time: ${job.estimatedTime}`);
    console.log('');
  });
  
  console.log('  0. Exit');
  console.log('\n' + '='.repeat(70) + '\n');
};

// Run a single cron job
const runSingleJob = async (job) => {
  console.log(`\n${'━'.repeat(70)}`);
  console.log(`▶️  Running: ${job.name}`);
  console.log(`📝 ${job.description}`);
  console.log(`⏱️  Estimated time: ${job.estimatedTime}`);
  console.log(`🕐 Started at: ${new Date().toLocaleString()}`);
  console.log('━'.repeat(70) + '\n');
  
  const startTime = Date.now();
  
  try {
    await job.function();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ ${job.name} completed successfully in ${duration}s`);
    return { success: true, duration, job: job.name };
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`\n❌ ${job.name} failed after ${duration}s`);
    console.error(`   Error: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
    return { success: false, duration, job: job.name, error: error.message };
  }
};

// Run all cron jobs sequentially
const runAllJobs = async () => {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 RUNNING ALL CRON JOBS SEQUENTIALLY');
  console.log('='.repeat(70));
  console.log(`🕐 Started at: ${new Date().toLocaleString()}\n`);
  
  const results = {
    success: [],
    failed: [],
    totalTime: 0
  };
  
  const overallStartTime = Date.now();
  
  // Run each job (except "Run All" option)
  for (const job of cronJobs.slice(0, -1)) {
    const result = await runSingleJob(job);
    results.totalTime += parseFloat(result.duration);
    
    if (result.success) {
      results.success.push(result);
    } else {
      results.failed.push(result);
    }
    
    // Wait 2 seconds between jobs
    if (job.id < 8) {
      console.log('\n⏳ Waiting 2 seconds before next job...\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  const overallDuration = ((Date.now() - overallStartTime) / 1000).toFixed(2);
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 SUMMARY');
  console.log('='.repeat(70));
  console.log(`✅ Successful: ${results.success.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⏱️  Total time: ${overallDuration}s`);
  
  if (results.success.length > 0) {
    console.log('\n✅ Successful jobs:');
    results.success.forEach(r => {
      console.log(`   • ${r.job} (${r.duration}s)`);
    });
  }
  
  if (results.failed.length > 0) {
    console.log('\n❌ Failed jobs:');
    results.failed.forEach(r => {
      console.log(`   • ${r.job} (${r.duration}s) - ${r.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(70) + '\n');
};

// Main interactive loop
const main = async () => {
  try {
    await connectDB();
    
    while (true) {
      displayMenu();
      
      const answer = await askQuestion('👉 Select a cron job to run (or 0 to exit): ');
      const choice = parseInt(answer.trim());
      
      if (isNaN(choice) || choice < 0 || choice > 9) {
        console.log('\n⚠️  Invalid choice. Please enter a number between 0-9.\n');
        continue;
      }
      
      if (choice === 0) {
        console.log('\n👋 Goodbye!\n');
        break;
      }
      
      if (choice === 9) {
        const confirm = await askQuestion('\n⚠️  This will run ALL cron jobs sequentially. Continue? (y/n): ');
        if (confirm.toLowerCase() !== 'y') {
          console.log('\n⏭️  Skipped.\n');
          continue;
        }
        await runAllJobs();
      } else {
        const job = cronJobs.find(j => j.id === choice);
        if (job && job.function) {
          await runSingleJob(job);
        }
      }
      
      // Ask if user wants to continue
      const continueAnswer = await askQuestion('\n🔄 Run another job? (y/n): ');
      if (continueAnswer.toLowerCase() !== 'y') {
        console.log('\n👋 Goodbye!\n');
        break;
      }
    }
    
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    console.error(error.stack);
  } finally {
    rl.close();
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected');
    process.exit(0);
  }
};

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n\n👋 Interrupted by user. Goodbye!\n');
  rl.close();
  await mongoose.disconnect();
  process.exit(0);
});

// Start the interactive runner
main();

