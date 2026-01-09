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

const checkTrendingMatches = async () => {
  try {
    console.log('🔍 Checking trending matches...\n');
    
    // Count individual flags
    const featured = await Match.countDocuments({ featured: true });
    const aiPicked = await Match.countDocuments({ aiPicked: true });
    const playOfDay = await Match.countDocuments({ playOfDay: true });
    
    // Count trending (any flag)
    const trending = await Match.countDocuments({
      $or: [
        { featured: true },
        { aiPicked: true },
        { playOfDay: true }
      ]
    });
    
    console.log('📊 Individual counts:');
    console.log(`  Featured: ${featured}`);
    console.log(`  AI Picked: ${aiPicked}`);
    console.log(`  Play of Day: ${playOfDay}`);
    console.log(`  Total Trending: ${trending}`);
    
    // Find matches with multiple flags
    const multiFlagMatches = await Match.find({
      $or: [
        { featured: true },
        { aiPicked: true },
        { playOfDay: true }
      ]
    }).select('_id featured aiPicked playOfDay homeTeam awayTeam date');
    
    console.log('\n🔍 Matches with trending flags:');
    multiFlagMatches.forEach(match => {
      const flags = [];
      if (match.featured) flags.push('Featured');
      if (match.aiPicked) flags.push('AI Picked');
      if (match.playOfDay) flags.push('Play of Day');
      
      console.log(`  ${match.homeTeam} vs ${match.awayTeam} - ${flags.join(', ')}`);
    });
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');
    process.exit(0);
  }
};

connectDB().then(checkTrendingMatches);
