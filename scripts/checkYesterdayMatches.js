import mongoose from 'mongoose';
import Match from './src/models/matchModel.js';
import League from './src/models/leaugeModel.js';
import Team from './src/models/teamModel.js';
import connectDB from './src/config/database.js';

// Connect to MongoDB using the same method as the server
const connect = async () => {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const checkYesterdayMatches = async () => {
  try {
    console.log('🔍 Checking yesterday\'s matches and their scores...\n');
    
    // Calculate yesterday's date range in UTC
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    
    const yesterdayStart = new Date(Date.UTC(
      yesterday.getUTCFullYear(),
      yesterday.getUTCMonth(),
      yesterday.getUTCDate(),
      0, 0, 0, 0
    ));
    
    const yesterdayEnd = new Date(Date.UTC(
      yesterday.getUTCFullYear(),
      yesterday.getUTCMonth(),
      yesterday.getUTCDate(),
      23, 59, 59, 999
    ));
    
    console.log(`📅 Checking matches from: ${yesterdayStart.toISOString()} to ${yesterdayEnd.toISOString()}`);
    
    // Find all matches from yesterday
    const yesterdayMatches = await Match.find({
      date: { $gte: yesterdayStart, $lte: yesterdayEnd }
    }).sort({ date: 1 });
    
    console.log(`📊 Found ${yesterdayMatches.length} matches from yesterday\n`);
    
    if (yesterdayMatches.length === 0) {
      console.log('❌ No matches found for yesterday');
      return;
    }
    
    // Get unique league IDs and team IDs for lookup
    const leagueIds = [...new Set(yesterdayMatches.map(m => m.leagueId))];
    const teamIds = [...new Set([
      ...yesterdayMatches.map(m => m.homeTeam),
      ...yesterdayMatches.map(m => m.awayTeam)
    ])];
    
    // Fetch league and team details
    const [leagues, teams] = await Promise.all([
      League.find({ leagueId: { $in: leagueIds } }, 'leagueId name country'),
      Team.find({ teamId: { $in: teamIds } }, 'teamId name')
    ]);
    
    // Create lookup maps
    const leagueMap = {};
    leagues.forEach(league => {
      leagueMap[league.leagueId] = league;
    });
    
    const teamMap = {};
    teams.forEach(team => {
      teamMap[team.teamId] = team;
    });
    
    // Group matches by status
    const matchesByStatus = {
      finished: [],
      live: [],
      notStarted: [],
      postponed: []
    };
    
    yesterdayMatches.forEach(match => {
      const status = match.status.short;
      if (['FT', 'AET', 'PEN'].includes(status)) {
        matchesByStatus.finished.push(match);
      } else if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'].includes(status)) {
        matchesByStatus.live.push(match);
      } else if (['NS', 'TBD'].includes(status)) {
        matchesByStatus.notStarted.push(match);
      } else if (['PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(status)) {
        matchesByStatus.postponed.push(match);
      }
    });
    
    // Display results by status
    console.log('🏁 FINISHED MATCHES:');
    if (matchesByStatus.finished.length > 0) {
      matchesByStatus.finished.forEach(match => {
        const league = leagueMap[match.leagueId];
        const homeTeam = teamMap[match.homeTeam];
        const awayTeam = teamMap[match.awayTeam];
        
        console.log(`  ⚽ ${homeTeam?.name || match.homeTeam} ${match.goals.home || 0} - ${match.goals.away || 0} ${awayTeam?.name || match.awayTeam}`);
        console.log(`     🏆 ${league?.name || 'Unknown League'} (${league?.country || 'Unknown'})`);
        console.log(`     📊 Status: ${match.status.short} (${match.status.long})`);
        console.log(`     ⏰ Time: ${new Date(match.date).toLocaleTimeString()}`);
        console.log(`     📈 Score Details: HT ${match.score.halftime?.home || 0}-${match.score.halftime?.away || 0} | FT ${match.score.fulltime?.home || 0}-${match.score.fulltime?.away || 0}`);
        console.log('');
      });
    } else {
      console.log('  ❌ No finished matches found');
    }
    
    console.log('🔴 LIVE MATCHES:');
    if (matchesByStatus.live.length > 0) {
      matchesByStatus.live.forEach(match => {
        const league = leagueMap[match.leagueId];
        const homeTeam = teamMap[match.homeTeam];
        const awayTeam = teamMap[match.awayTeam];
        
        console.log(`  ⚽ ${homeTeam?.name || match.homeTeam} ${match.goals.home || 0} - ${match.goals.away || 0} ${awayTeam?.name || match.awayTeam}`);
        console.log(`     🏆 ${league?.name || 'Unknown League'} (${league?.country || 'Unknown'})`);
        console.log(`     📊 Status: ${match.status.short} (${match.status.long}) - Elapsed: ${match.status.elapsed || 0}min`);
        console.log(`     ⏰ Time: ${new Date(match.date).toLocaleTimeString()}`);
        console.log('');
      });
    } else {
      console.log('  ❌ No live matches found');
    }
    
    console.log('⏳ NOT STARTED MATCHES:');
    if (matchesByStatus.notStarted.length > 0) {
      matchesByStatus.notStarted.forEach(match => {
        const league = leagueMap[match.leagueId];
        const homeTeam = teamMap[match.homeTeam];
        const awayTeam = teamMap[match.awayTeam];
        
        console.log(`  ⚽ ${homeTeam?.name || match.homeTeam} vs ${awayTeam?.name || match.awayTeam}`);
        console.log(`     🏆 ${league?.name || 'Unknown League'} (${league?.country || 'Unknown'})`);
        console.log(`     📊 Status: ${match.status.short} (${match.status.long})`);
        console.log(`     ⏰ Time: ${new Date(match.date).toLocaleTimeString()}`);
        console.log('');
      });
    } else {
      console.log('  ❌ No not started matches found');
    }
    
    console.log('⏸️ POSTPONED/CANCELLED MATCHES:');
    if (matchesByStatus.postponed.length > 0) {
      matchesByStatus.postponed.forEach(match => {
        const league = leagueMap[match.leagueId];
        const homeTeam = teamMap[match.homeTeam];
        const awayTeam = teamMap[match.awayTeam];
        
        console.log(`  ⚽ ${homeTeam?.name || match.homeTeam} vs ${awayTeam?.name || match.awayTeam}`);
        console.log(`     🏆 ${league?.name || 'Unknown League'} (${league?.country || 'Unknown'})`);
        console.log(`     📊 Status: ${match.status.short} (${match.status.long})`);
        console.log(`     ⏰ Time: ${new Date(match.date).toLocaleTimeString()}`);
        console.log('');
      });
    } else {
      console.log('  ❌ No postponed/cancelled matches found');
    }
    
    // Summary
    console.log('📊 SUMMARY:');
    console.log(`  🏁 Finished: ${matchesByStatus.finished.length}`);
    console.log(`  🔴 Live: ${matchesByStatus.live.length}`);
    console.log(`  ⏳ Not Started: ${matchesByStatus.notStarted.length}`);
    console.log(`  ⏸️ Postponed/Cancelled: ${matchesByStatus.postponed.length}`);
    console.log(`  📈 Total: ${yesterdayMatches.length}`);
    
  } catch (error) {
    console.error('❌ Error checking yesterday\'s matches:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

// Run the check
connect().then(() => {
  checkYesterdayMatches();
});
