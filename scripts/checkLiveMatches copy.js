import mongoose from 'mongoose';
import Match from './src/models/matchModel.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

// Known team names mapping
const TEAM_NAMES = {
  // Premier League teams
  40: 'Liverpool',
  42: 'Arsenal',
  33: 'Manchester United',
  34: 'Newcastle',
  35: 'Bournemouth',
  36: 'Brighton',
  37: 'Burnley',
  38: 'Crystal Palace',
  39: 'Everton',
  41: 'Manchester City',
  43: 'Aston Villa',
  44: 'Brentford',
  45: 'Chelsea',
  46: 'Fulham',
  47: 'Leeds',
  48: 'Leicester',
  49: 'Nottingham Forest',
  50: 'Southampton',
  51: 'Tottenham',
  52: 'West Ham',
  53: 'Wolves',
  
  // Other known teams
  165: 'Barcelona',
  182: 'Real Madrid',
  495: 'Inter Milan',
  496: 'AC Milan',
  502: 'Juventus',
  503: 'Napoli',
  520: 'Bayern Munich',
  533: 'Borussia Dortmund',
  538: 'RB Leipzig',
  601: 'PSG',
  618: 'Marseille',
  728: 'Atletico Madrid',
  781: 'Sevilla',
  1025: 'Valencia',
  1072: 'Villarreal',
  1398: 'Athletic Bilbao'
};

// Get team names from team IDs
const getTeamNames = (homeTeamId, awayTeamId) => {
  const homeName = TEAM_NAMES[homeTeamId] || `Team ${homeTeamId}`;
  const awayName = TEAM_NAMES[awayTeamId] || `Team ${awayTeamId}`;
  return { home: homeName, away: awayName };
};

// Search for matches by team names
const searchMatchesByTeamNames = async (team1Name, team2Name) => {
  try {
    console.log(`\n🔍 Searching for matches between ${team1Name} and ${team2Name}...\n`);
    
    // Find team IDs from our mapping
    const team1Id = Object.keys(TEAM_NAMES).find(key => 
      TEAM_NAMES[key].toLowerCase().includes(team1Name.toLowerCase())
    );
    const team2Id = Object.keys(TEAM_NAMES).find(key => 
      TEAM_NAMES[key].toLowerCase().includes(team2Name.toLowerCase())
    );
    
    if (!team1Id || !team2Id) {
      console.log('❌ Could not find team IDs for one or both teams');
      return;
    }
    
    console.log(`🏆 Team IDs found:`);
    console.log(`   ${team1Name}: ID ${team1Id}`);
    console.log(`   ${team2Name}: ID ${team2Id}\n`);
    
    // Search for matches with these teams
    const matches = await Match.find({
      $or: [
        { homeTeam: parseInt(team1Id), awayTeam: parseInt(team2Id) },
        { homeTeam: parseInt(team2Id), awayTeam: parseInt(team1Id) }
      ]
    }).sort({ date: -1 });
    
    if (matches.length === 0) {
      console.log(`❌ No matches found between ${team1Name} and ${team2Name}`);
      return;
    }
    
    console.log(`✅ Found ${matches.length} match(es) between ${team1Name} and ${team2Name}:\n`);
    
    matches.forEach((match, index) => {
      const teamNames = getTeamNames(match.homeTeam, match.awayTeam);
      const matchTime = new Date(match.date).toLocaleString();
      const elapsed = match.status?.elapsed || 0;
      const homeGoals = match.goals?.home || 0;
      const awayGoals = match.goals?.away || 0;
      
      console.log(`${index + 1}. ${teamNames.home} vs ${teamNames.away}`);
      console.log(`   🏟️ Status: ${match.status?.short || 'N/A'} (${match.status?.long || 'N/A'})`);
      if (match.status?.elapsed) {
        console.log(`   ⏱️ Elapsed: ${elapsed} minutes`);
      }
      console.log(`   ⚽ Score: ${homeGoals} - ${awayGoals}`);
      console.log(`   📅 Date: ${matchTime}`);
      console.log(`   🏆 League ID: ${match.leagueId}`);
      console.log(`   🆔 Fixture ID: ${match.fixtureId}`);
      console.log(`   🔄 Last Updated: ${match.updatedAt ? new Date(match.updatedAt).toLocaleString() : 'Never'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error searching matches:', error.message);
  }
};

// Check live and upcoming matches
const checkLiveMatches = async () => {
  try {
    console.log('\n🔍 Checking live and upcoming matches in database...\n');
    
    // Get current time
    const now = new Date();
    const nowUTC = new Date(now.toISOString());
    const twoHoursLater = new Date(nowUTC.getTime() + 2 * 60 * 60 * 1000);
    
    console.log(`🕒 Current UTC time: ${nowUTC.toISOString()}`);
    console.log(`🕒 Local time: ${now.toLocaleString()}\n`);
    
    // Find all matches that are either live or upcoming
    const matches = await Match.find({
      $or: [
        // Live matches (currently playing)
        { 'status.short': { $in: ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT'] } },
        // Upcoming matches (starting within next 2 hours)
        {
          'status.short': { $in: ['NS', 'TBD'] },
          date: { $gte: nowUTC, $lte: twoHoursLater }
        }
      ]
    }).sort({ date: 1 });
    
    if (matches.length === 0) {
      console.log('ℹ️ No live or upcoming matches found in database');
      return;
    }
    
    console.log(`📊 Found ${matches.length} active matches in database:\n`);
    
    // Group matches by status
    const liveMatches = matches.filter(m => ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT'].includes(m.status.short));
    const upcomingMatches = matches.filter(m => ['NS', 'TBD'].includes(m.status.short));
    
    // Display live matches
    if (liveMatches.length > 0) {
      console.log('🔥 LIVE MATCHES (Currently Playing):');
      console.log('=' .repeat(80));
      
      liveMatches.forEach((match, index) => {
        const matchTime = new Date(match.date).toLocaleString();
        const elapsed = match.status.elapsed || 0;
        const homeGoals = match.goals?.home || 0;
        const awayGoals = match.goals?.away || 0;
        
        // Get team names
        const teamNames = getTeamNames(match.homeTeam, match.awayTeam);
        
        console.log(`${index + 1}. ${teamNames.home} vs ${teamNames.away}`);
        console.log(`   🏟️ Status: ${match.status.short} (${match.status.long}) - Elapsed: ${elapsed}min`);
        console.log(`   ⚽ Score: ${homeGoals} - ${awayGoals}`);
        console.log(`   📅 Date: ${matchTime}`);
        console.log(`   🏆 League ID: ${match.leagueId}`);
        console.log(`   🆔 Fixture ID: ${match.fixtureId}`);
        console.log(`   🔄 Last Updated: ${match.updatedAt ? new Date(match.updatedAt).toLocaleString() : 'Never'}`);
        console.log('');
      });
    }
    
    // Display upcoming matches
    if (upcomingMatches.length > 0) {
      console.log('⏳ UPCOMING MATCHES (Starting Soon):');
      console.log('=' .repeat(80));
      
      upcomingMatches.forEach((match, index) => {
        const matchTime = new Date(match.date).toLocaleString();
        const timeUntil = Math.round((new Date(match.date) - now) / (1000 * 60)); // minutes
        
        // Get team names
        const teamNames = getTeamNames(match.homeTeam, match.awayTeam);
        
        console.log(`${index + 1}. ${teamNames.home} vs ${teamNames.away}`);
        console.log(`   🏟️ Status: ${match.status.short} (${match.status.long})`);
        console.log(`   ⏰ Starts in: ${timeUntil} minutes`);
        console.log(`   📅 Date: ${matchTime}`);
        console.log(`   🏆 League ID: ${match.leagueId}`);
        console.log(`   🆔 Fixture ID: ${match.fixtureId}`);
        console.log('');
      });
    }
    
    // Summary
    console.log('📊 SUMMARY:');
    console.log('=' .repeat(80));
    console.log(`🔥 Live matches: ${liveMatches.length}`);
    console.log(`⏳ Upcoming matches: ${upcomingMatches.length}`);
    console.log(`📅 Total active: ${matches.length}`);
    
    // Check for any matches with missing data
    const matchesWithMissingData = matches.filter(m => !m.status || !m.goals || !m.score);
    if (matchesWithMissingData.length > 0) {
      console.log(`⚠️  Matches with missing data: ${matchesWithMissingData.length}`);
      matchesWithMissingData.forEach(match => {
        const teamNames = getTeamNames(match.homeTeam, match.awayTeam);
        console.log(`   - ${teamNames.home} vs ${teamNames.away} (ID: ${match._id})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error checking matches:', error.message);
  }
};

// Check specific match by fixture ID
const checkSpecificMatch = async (fixtureId) => {
  try {
    console.log(`\n🔍 Checking specific match with Fixture ID: ${fixtureId}\n`);
    
    const match = await Match.findOne({ fixtureId: parseInt(fixtureId) });
    
    if (!match) {
      console.log('❌ Match not found in database');
      return;
    }
    
    // Get team names
    const teamNames = getTeamNames(match.homeTeam, match.awayTeam);
    
    console.log('📊 MATCH DETAILS:');
    console.log('=' .repeat(80));
    console.log(`🏟️ ${teamNames.home} vs ${teamNames.away}`);
    console.log(`📅 Date: ${new Date(match.date).toLocaleString()}`);
    console.log(`🏆 League ID: ${match.leagueId}`);
    console.log(`🆔 Fixture ID: ${match.fixtureId}`);
    console.log(`📊 Status: ${match.status?.short || 'N/A'} (${match.status?.long || 'N/A'})`);
    console.log(`⏱️ Elapsed: ${match.status?.elapsed || 0} minutes`);
    console.log(`⚽ Goals: ${match.goals?.home || 0} - ${match.goals?.away || 0}`);
    console.log(`📈 Score:`);
    console.log(`   HT: ${match.score?.halftime?.home || 0} - ${match.score?.halftime?.away || 0}`);
    console.log(`   FT: ${match.score?.fulltime?.home || 0} - ${match.score?.fulltime?.away || 0}`);
    console.log(`   ET: ${match.score?.extratime?.home || 0} - ${match.score?.extratime?.away || 0}`);
    console.log(`   PEN: ${match.score?.penalty?.home || 0} - ${match.score?.penalty?.away || 0}`);
    console.log(`🔄 Last Updated: ${match.updatedAt ? new Date(match.updatedAt).toLocaleString() : 'Never'}`);
    console.log(`📝 Created: ${new Date(match.createdAt).toLocaleString()}`);
    
  } catch (error) {
    console.error('❌ Error checking specific match:', error.message);
  }
};

// Main function
const main = async () => {
  try {
    await connectDB();
    
    // Check if searching for specific teams
    const team1 = process.argv[2];
    const team2 = process.argv[3];
    
    if (team1 && team2) {
      // Search for matches between specific teams
      await searchMatchesByTeamNames(team1, team2);
    } else if (process.argv[2] && !isNaN(process.argv[2])) {
      // Check specific match by fixture ID
      await checkSpecificMatch(process.argv[2]);
    } else {
      // Check all live/upcoming matches
      await checkLiveMatches();
    }
    
  } catch (error) {
    console.error('❌ Main error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

// Run the script
main();
