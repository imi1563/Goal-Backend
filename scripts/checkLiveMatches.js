import mongoose from 'mongoose';
import Match from '../src/models/matchModel.js';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/football-backend';
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

const checkLiveMatches = async () => {
  try {
    console.log('🔍 Checking for live matches...\n');
    
    // Check live matches (same logic as dashboard)
    const liveMatches = await Match.find({
      $or: [
        { 'status.short': { $in: ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'] } },
        {
          'status.short': { $nin: ['FT', 'AET', 'PEN'] },
          date: {
            $gte: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
            $lte: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours later
          }
        }
      ]
    }).select('homeTeam awayTeam date status.short goals');
    
    console.log(`⚽ Live matches found: ${liveMatches.length}`);
    
    if (liveMatches.length > 0) {
      console.log('\n📊 Live Matches:');
      liveMatches.forEach((match, index) => {
        const time = match.date ? match.date.toLocaleString() : 'Unknown time';
        console.log(`${index + 1}. ${match.homeTeam} vs ${match.awayTeam}`);
        console.log(`   Status: ${match.status.short}`);
        console.log(`   Score: ${match.goals.home}:${match.goals.away}`);
        console.log(`   Time: ${time}`);
        console.log('');
      });
    } else {
      console.log('😴 No live matches at the moment');
    }
    
    // Check today's matches
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayMatches = await Match.find({
      date: { $gte: today, $lt: tomorrow }
    }).select('homeTeam awayTeam date status.short goals');
    
    console.log(`\n📅 Total matches today: ${todayMatches.length}`);
    
    if (todayMatches.length > 0) {
      console.log('\n📊 Today\'s Matches:');
      todayMatches.forEach((match, index) => {
        const time = match.date ? match.date.toLocaleString() : 'Unknown time';
        console.log(`${index + 1}. ${match.homeTeam} vs ${match.awayTeam}`);
        console.log(`   Status: ${match.status.short}`);
        console.log(`   Score: ${match.goals.home}:${match.goals.away}`);
        console.log(`   Time: ${time}`);
        console.log('');
      });
    } else {
      console.log('📅 No matches scheduled for today');
    }
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');
    process.exit(0);
  }
};

connectDB().then(checkLiveMatches);
