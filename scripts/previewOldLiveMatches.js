import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Match from '../src/models/matchModel.js';

dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/goal-backend');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Live statuses that should be cleaned up if not from today
const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'];

const previewOldLiveMatches = async () => {
  try {
    console.log('🔍 Searching for old live matches...');
    
    // Get today's date range in UTC
    const now = new Date();
    const todayStart = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0, 0, 0, 0
    ));
    const todayEnd = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23, 59, 59, 999
    ));
    
    console.log(`📅 Today's range: ${todayStart.toISOString()} to ${todayEnd.toISOString()}`);
    
    // Find matches with live statuses that are NOT from today
    const oldLiveMatches = await Match.find({
      'status.short': { $in: LIVE_STATUSES },
      date: { $not: { $gte: todayStart, $lte: todayEnd } }
    }).select('_id fixtureId status date homeTeam awayTeam leagueId').sort({ date: -1 });
    
    console.log(`\n📊 Found ${oldLiveMatches.length} old live matches`);
    
    if (oldLiveMatches.length === 0) {
      console.log('✅ No old live matches found. Database is clean!');
      return;
    }
    
    // Group by date for better overview
    const matchesByDate = {};
    oldLiveMatches.forEach(match => {
      const dateKey = match.date.toISOString().split('T')[0];
      if (!matchesByDate[dateKey]) {
        matchesByDate[dateKey] = [];
      }
      matchesByDate[dateKey].push(match);
    });
    
    // Show details grouped by date
    console.log('\n📋 Matches that would be deleted (grouped by date):');
    Object.keys(matchesByDate).sort().forEach(date => {
      console.log(`\n📅 ${date}:`);
      matchesByDate[date].forEach((match, index) => {
        console.log(`  ${index + 1}. ${match.homeTeam} vs ${match.awayTeam} (${match.status.short}) - ${match.date.toISOString()}`);
      });
    });
    
    // Show summary by status
    const statusCounts = {};
    oldLiveMatches.forEach(match => {
      const status = match.status.short;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    console.log('\n📊 Summary by status:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count} matches`);
    });
    
    console.log(`\n⚠️  Total matches that would be deleted: ${oldLiveMatches.length}`);
    console.log('💡 Run "node scripts/deleteOldLiveMatches.js" to actually delete these matches');
    
  } catch (error) {
    console.error('❌ Error previewing old live matches:', error);
    throw error;
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    await previewOldLiveMatches();
    console.log('\n🎉 Preview completed successfully!');
  } catch (error) {
    console.error('💥 Preview failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
};

// Run the script
main();
