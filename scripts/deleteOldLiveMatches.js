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

const deleteOldLiveMatches = async () => {
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
    }).select('_id fixtureId status date homeTeam awayTeam leagueId');
    
    console.log(`📊 Found ${oldLiveMatches.length} old live matches`);
    
    if (oldLiveMatches.length === 0) {
      console.log('✅ No old live matches found. Database is clean!');
      return;
    }
    
    // Show details of matches to be deleted
    console.log('\n📋 Matches to be deleted:');
    oldLiveMatches.forEach((match, index) => {
      console.log(`${index + 1}. ${match.homeTeam} vs ${match.awayTeam} (${match.status.short}) - ${match.date.toISOString()}`);
    });
    
    // Ask for confirmation
    console.log('\n⚠️  WARNING: This will permanently delete these matches!');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
    
    // Wait 5 seconds for user to cancel
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Delete the matches
    const result = await Match.deleteMany({
      _id: { $in: oldLiveMatches.map(m => m._id) }
    });
    
    console.log(`\n✅ Successfully deleted ${result.deletedCount} old live matches`);
    
    // Show summary
    console.log('\n📊 Summary:');
    console.log(`- Matches found: ${oldLiveMatches.length}`);
    console.log(`- Matches deleted: ${result.deletedCount}`);
    console.log(`- Status: ${result.deletedCount === oldLiveMatches.length ? 'SUCCESS' : 'PARTIAL'}`);
    
  } catch (error) {
    console.error('❌ Error deleting old live matches:', error);
    throw error;
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    await deleteOldLiveMatches();
    console.log('\n🎉 Script completed successfully!');
  } catch (error) {
    console.error('💥 Script failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
};

// Run the script
main();
