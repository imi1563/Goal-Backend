import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Match from '../src/models/matchModel.js';
import League from '../src/models/leaugeModel.js';

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

const main = async () => {
  try {
    await connectDB();
    
    // Get today's date range (start and end of today in UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    
    console.log(`📅 Counting matches for today (${today.toISOString().split('T')[0]})...\n`);
    
    // Count all matches today
    const totalMatches = await Match.countDocuments({
      date: { $gte: today, $lt: tomorrow },
      'status.short': { $nin: ['PST', 'CANC', 'ABD', 'AWD', 'WO'] }
    });
    
    // Get active leagues to filter
    const activeLeagues = await League.find({ isActive: true }).select('leagueId name');
    const activeLeagueIds = activeLeagues.map(league => league.leagueId);
    
    // Count matches from active leagues only
    const activeLeagueMatches = await Match.countDocuments({
      date: { $gte: today, $lt: tomorrow },
      leagueId: { $in: activeLeagueIds },
      'status.short': { $nin: ['PST', 'CANC', 'ABD', 'AWD', 'WO'] }
    });
    
    // Count by status
    const notStarted = await Match.countDocuments({
      date: { $gte: today, $lt: tomorrow },
      leagueId: { $in: activeLeagueIds },
      'status.short': 'NS'
    });
    
    const live = await Match.countDocuments({
      date: { $gte: today, $lt: tomorrow },
      leagueId: { $in: activeLeagueIds },
      'status.short': { $in: ['LIVE', 'HT', '1H', '2H', 'ET', 'P', 'BT'] }
    });
    
    const finished = await Match.countDocuments({
      date: { $gte: today, $lt: tomorrow },
      leagueId: { $in: activeLeagueIds },
      'status.short': 'FT'
    });
    
    console.log('📊 Match Statistics for Today:');
    console.log('─'.repeat(50));
    console.log(`Total matches (all leagues): ${totalMatches}`);
    console.log(`Active league matches: ${activeLeagueMatches}`);
    console.log(`  ├─ Not Started: ${notStarted}`);
    console.log(`  ├─ Live: ${live}`);
    console.log(`  └─ Finished: ${finished}`);
    console.log('─'.repeat(50));
    
    // Show breakdown by league
    const matchesByLeague = await Match.aggregate([
      {
        $match: {
          date: { $gte: today, $lt: tomorrow },
          leagueId: { $in: activeLeagueIds },
          'status.short': { $nin: ['PST', 'CANC', 'ABD', 'AWD', 'WO'] }
        }
      },
      {
        $group: {
          _id: '$leagueId',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    if (matchesByLeague.length > 0) {
      console.log('\n📋 Breakdown by League:');
      for (const item of matchesByLeague) {
        const league = activeLeagues.find(l => l.leagueId === item._id);
        const leagueName = league ? league.name : `League ID: ${item._id}`;
        console.log(`  ${leagueName}: ${item.count} matches`);
      }
    }
    
    console.log('\n✅ Count completed!');
  } catch (error) {
    console.error('💥 Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');
    process.exit(0);
  }
};

main();


