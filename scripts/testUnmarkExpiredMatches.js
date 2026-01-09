import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { triggerUnmarkExpiredMatches } from '../src/cron/unmarkExpiredMatches.js';
import Match from '../src/models/matchModel.js';

dotenv.config();

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/football-backend';
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB Connected\n');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

const checkCurrentMarkedMatches = async () => {
  console.log('📊 Checking current marked matches...\n');
  
  const counts = {
    aiPicked: await Match.countDocuments({ aiPicked: true }),
    playOfDay: await Match.countDocuments({ playOfDay: true }),
    featured: await Match.countDocuments({ featured: true }),
    doubleOrNothing: await Match.countDocuments({ doubleOrNothing: true })
  };
  
  const total = await Match.countDocuments({
    $or: [
      { aiPicked: true },
      { playOfDay: true },
      { featured: true },
      { doubleOrNothing: true }
    ]
  });
  
  console.log('📋 Current counts:');
  console.log(`  - AI Picked: ${counts.aiPicked}`);
  console.log(`  - Play of Day: ${counts.playOfDay}`);
  console.log(`  - Featured: ${counts.featured}`);
  console.log(`  - Double or Nothing: ${counts.doubleOrNothing}`);
  console.log(`  - Total marked: ${total}\n`);
  
  return counts;
};

const main = async () => {
  try {
    console.log('🚀 Starting test script...\n');
    await connectDB();
    
    console.log('🧪 TESTING UNMARK EXPIRED MATCHES CRON\n');
    console.log('='.repeat(60) + '\n');
    
    // Check before
    console.log('📊 BEFORE RUNNING CRON:');
    const beforeCounts = await checkCurrentMarkedMatches();
    
    console.log('='.repeat(60) + '\n');
    console.log('🔄 RUNNING CRON JOB...\n');
    
    // Run the cron
    const result = await triggerUnmarkExpiredMatches();
    
    console.log('\n' + '='.repeat(60) + '\n');
    console.log('📊 AFTER RUNNING CRON:');
    const afterCounts = await checkCurrentMarkedMatches();
    
    console.log('='.repeat(60) + '\n');
    console.log('📈 SUMMARY:');
    console.log(`  - Matches processed: ${result.matchesProcessed || 0}`);
    console.log(`  - Matches unmarked: ${result.unmarked || 0}`);
    console.log(`  - AI Picked: ${beforeCounts.aiPicked} → ${afterCounts.aiPicked} (${beforeCounts.aiPicked - afterCounts.aiPicked} removed)`);
    console.log(`  - Play of Day: ${beforeCounts.playOfDay} → ${afterCounts.playOfDay} (${beforeCounts.playOfDay - afterCounts.playOfDay} removed)`);
    console.log(`  - Featured: ${beforeCounts.featured} → ${afterCounts.featured} (${beforeCounts.featured - afterCounts.featured} removed)`);
    console.log(`  - Double or Nothing: ${beforeCounts.doubleOrNothing} → ${afterCounts.doubleOrNothing} (${beforeCounts.doubleOrNothing - afterCounts.doubleOrNothing} removed)`);
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('\n💥 Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');
    process.exit(0);
  }
};

main();

