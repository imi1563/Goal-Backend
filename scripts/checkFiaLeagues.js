import mongoose from 'mongoose';
import League from './src/models/leaugeModel.js';
import Match from './src/models/matchModel.js';

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

const checkFiaLeagues = async () => {
  try {
    console.log('🔍 Searching for FIA leagues...\n');
    
    // Search for leagues with "FIA" in the name (case insensitive)
    const fiaLeagues = await League.find({
      name: { $regex: /fia/i }
    }).select('leagueId name country type isActive');
    
    console.log(`📊 Found ${fiaLeagues.length} FIA leagues:`);
    fiaLeagues.forEach(league => {
      console.log(`  - ID: ${league.leagueId} | Name: "${league.name}" | Country: ${league.country} | Type: ${league.type} | Active: ${league.isActive}`);
    });
    
    if (fiaLeagues.length > 0) {
      console.log('\n🔍 Checking for matches in FIA leagues...');
      
      const fiaLeagueIds = fiaLeagues.map(league => league.leagueId);
      const fiaMatches = await Match.find({
        leagueId: { $in: fiaLeagueIds }
      }).select('fixtureId leagueId homeTeam awayTeam date status').limit(10);
      
      console.log(`📊 Found ${fiaMatches.length} matches in FIA leagues (showing first 10):`);
      fiaMatches.forEach(match => {
        console.log(`  - Match ID: ${match.fixtureId} | League ID: ${match.leagueId} | ${match.homeTeam} vs ${match.awayTeam} | Date: ${match.date} | Status: ${match.status.short}`);
      });
    }
    
    // Also search for any leagues that might contain "Formula" or "Racing"
    console.log('\n🔍 Searching for Formula/Racing related leagues...');
    const formulaLeagues = await League.find({
      $or: [
        { name: { $regex: /formula/i } },
        { name: { $regex: /racing/i } },
        { name: { $regex: /f1/i } },
        { name: { $regex: /motorsport/i } }
      ]
    }).select('leagueId name country type isActive');
    
    console.log(`📊 Found ${formulaLeagues.length} Formula/Racing leagues:`);
    formulaLeagues.forEach(league => {
      console.log(`  - ID: ${league.leagueId} | Name: "${league.name}" | Country: ${league.country} | Type: ${league.type} | Active: ${league.isActive}`);
    });
    
    // Search for any leagues with "FIA" in any field
    console.log('\n🔍 Searching for any leagues containing "FIA" in any field...');
    const anyFiaLeagues = await League.find({
      $or: [
        { name: { $regex: /fia/i } },
        { country: { $regex: /fia/i } },
        { type: { $regex: /fia/i } }
      ]
    }).select('leagueId name country type isActive');
    
    console.log(`📊 Found ${anyFiaLeagues.length} leagues with "FIA" in any field:`);
    anyFiaLeagues.forEach(league => {
      console.log(`  - ID: ${league.leagueId} | Name: "${league.name}" | Country: ${league.country} | Type: ${league.type} | Active: ${league.isActive}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking FIA leagues:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

// Run the check
connectDB().then(() => {
  checkFiaLeagues();
});




