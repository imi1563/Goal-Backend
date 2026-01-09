import mongoose from 'mongoose';
import Match from '../src/models/matchModel.js';
import Team from '../src/models/teamModel.js';
import dotenv from 'dotenv';

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

const findMatch = async () => {
  try {
    // Find teams by name (support command line arguments)
    const args = process.argv.slice(2);
    let team1Name = args[0] || 'Nchanga Rangers';
    let team2Name = args[1] || 'Man Utd Zambia Academy';
    
    // Clean up team names if they were passed incorrectly
    if (args.length === 0) {
      // Use default: Nchanga Rangers vs Man Utd Zambia Academy
      team1Name = 'Nchanga Rangers';
      team2Name = 'Man Utd Zambia Academy';
    }
    
    const team1 = await Team.findOne({ name: new RegExp(team1Name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
    const team2 = await Team.findOne({ name: new RegExp(team2Name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
    
    if (!team1 || !team2) {
      console.log('❌ Teams not found');
      if (!team1) console.log('   Green Buffaloes not found');
      if (!team2) console.log('   ZESCO United not found');
      
      // Try alternative search
      console.log('\n🔍 Searching for similar team names...');
      const allTeams = await Team.find({
        $or: [
          { name: /buffalo/i },
          { name: /zesco/i },
          { name: /united/i }
        ]
      }).select('teamId name');
      
      if (allTeams.length > 0) {
        console.log('Found teams:');
        allTeams.forEach(t => console.log(`   • ${t.name} (ID: ${t.teamId})`));
      }
      
      return;
    }
    
    console.log(`🔍 Found teams:`);
    console.log(`   • ${team1.name} (ID: ${team1.teamId})`);
    console.log(`   • ${team2.name} (ID: ${team2.teamId})`);
    console.log('\n🔍 Searching for matches...\n');
    
    // Find matches between these teams
    const matches = await Match.find({
      $or: [
        { homeTeam: team1.teamId, awayTeam: team2.teamId },
        { homeTeam: team2.teamId, awayTeam: team1.teamId }
      ]
    })
    .select('_id fixtureId leagueId date status homeTeam awayTeam goals score showOnHomepage')
    .sort({ date: -1 }); // Most recent first
    
    if (matches.length === 0) {
      console.log('ℹ️ No matches found between these teams\n');
      return;
    }
    
    console.log(`📊 Found ${matches.length} match(es):\n`);
    
    const now = new Date();
    
    matches.forEach((match, index) => {
      const isHomeTeam1 = match.homeTeam === team1.teamId;
      const homeTeamName = isHomeTeam1 ? team1.name : team2.name;
      const awayTeamName = isHomeTeam1 ? team2.name : team1.name;
      
      const matchDate = new Date(match.date);
      const isPast = matchDate < now;
      const isUpcoming = matchDate > now;
      const timeDiff = Math.abs(matchDate.getTime() - now.getTime());
      const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      const hoursDiff = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      
      console.log(`${index + 1}. ${homeTeamName} vs ${awayTeamName}`);
      console.log(`   📋 Fixture ID: ${match.fixtureId}`);
      console.log(`   📅 Date: ${matchDate.toISOString()}`);
      console.log(`   📅 Local Time: ${matchDate.toLocaleString()}`);
      console.log(`   📅 UTC Time: ${matchDate.toUTCString()}`);
      
      if (isPast) {
        console.log(`   ⏰ Status: PAST (${daysDiff} days ${hoursDiff} hours ago)`);
      } else if (isUpcoming) {
        console.log(`   ⏰ Status: UPCOMING (in ${daysDiff} days ${hoursDiff} hours)`);
      } else {
        console.log(`   ⏰ Status: NOW`);
      }
      
      console.log(`   🏟️ Match Status: ${match.status.short} (${match.status.long || 'Unknown'})`);
      
      if (match.goals) {
        console.log(`   ⚽ Score: ${homeTeamName} ${match.goals.home || 0} - ${match.goals.away || 0} ${awayTeamName}`);
      }
      
      if (match.score?.fulltime) {
        console.log(`   📊 Full Time: ${match.score.fulltime.home || 0}-${match.score.fulltime.away || 0}`);
      }
      
      console.log(`   🏆 League ID: ${match.leagueId}`);
      console.log(`   🏠 Show on Homepage: ${match.showOnHomepage ? '✅ Yes' : '❌ No'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('💥 Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected');
    process.exit(0);
  }
};

connectDB().then(findMatch);

