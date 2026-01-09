import mongoose from 'mongoose';
import Match from '../src/models/matchModel.js';
import Team from '../src/models/teamModel.js';
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

/**
 * Show all live matches with team names and fixture IDs
 */
const showLiveMatches = async () => {
  try {
    console.log('⚽ Fetching live matches...\n');
    
    // Live status codes
    const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'];
    
    // Find all live matches
    const liveMatches = await Match.find({
      'status.short': { $in: LIVE_STATUSES }
    })
    .select('_id fixtureId leagueId date status homeTeam awayTeam goals score showOnHomepage')
    .sort({ date: 1 });
    
    if (liveMatches.length === 0) {
      console.log('ℹ️ No live matches found\n');
      return;
    }
    
    console.log(`📊 Found ${liveMatches.length} live match(es):\n`);
    
    // Get unique team IDs
    const teamIds = new Set();
    liveMatches.forEach(match => {
      if (match.homeTeam) teamIds.add(match.homeTeam);
      if (match.awayTeam) teamIds.add(match.awayTeam);
    });
    
    // Fetch team details
    const teams = await Team.find({ teamId: { $in: Array.from(teamIds) } })
      .select('teamId name');
    
    // Create team map
    const teamMap = new Map();
    teams.forEach(team => {
      teamMap.set(team.teamId, team.name);
    });
    
    // Display live matches
    liveMatches.forEach((match, index) => {
      const homeTeamName = teamMap.get(match.homeTeam) || `Team ${match.homeTeam}`;
      const awayTeamName = teamMap.get(match.awayTeam) || `Team ${match.awayTeam}`;
      
      console.log(`${index + 1}. ${homeTeamName} vs ${awayTeamName}`);
      console.log(`   📋 Fixture ID: ${match.fixtureId}`);
      console.log(`   🆔 Match DB ID: ${match._id}`);
      console.log(`   🏟️ Status: ${match.status.short} (${match.status.long || 'Live'})`);
      
      if (match.status.elapsed) {
        console.log(`   ⏱️ Elapsed: ${match.status.elapsed} minutes`);
      }
      
      if (match.goals) {
        console.log(`   ⚽ Score: ${homeTeamName} ${match.goals.home || 0} - ${match.goals.away || 0} ${awayTeamName}`);
      }
      
      if (match.score?.halftime) {
        console.log(`   📊 HT: ${match.score.halftime.home || 0}-${match.score.halftime.away || 0}`);
      }
      
      console.log(`   📅 Date: ${new Date(match.date).toLocaleString()}`);
      console.log(`   🏆 League ID: ${match.leagueId}`);
      console.log(`   🏠 Show on Homepage: ${match.showOnHomepage ? '✅ Yes' : '❌ No'}`);
      console.log('');
    });
    
    // Summary
    console.log('\n📊 Summary:');
    console.log(`  Total live matches: ${liveMatches.length}`);
    
    const withHomepage = liveMatches.filter(m => m.showOnHomepage).length;
    console.log(`  Marked for homepage: ${withHomepage}`);
    console.log(`  Not marked for homepage: ${liveMatches.length - withHomepage}`);
    
  } catch (error) {
    console.error('💥 Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');
    process.exit(0);
  }
};

connectDB().then(showLiveMatches);

