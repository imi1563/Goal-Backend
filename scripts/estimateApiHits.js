import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Match from '../src/models/matchModel.js';
import League from '../src/models/leaugeModel.js';
import Team from '../src/models/teamModel.js';

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
    
    console.log('📊 Calculating Estimated Daily API Hits\n');
    console.log('='.repeat(70));
    
    // Get today's matches
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    
    const activeLeagues = await League.find({ isActive: true }).lean();
    const totalMatches = await Match.countDocuments({
      date: { $gte: today, $lt: tomorrow },
      'status.short': { $nin: ['PST', 'CANC', 'ABD', 'AWD', 'WO'] }
    });
    
    const liveMatches = await Match.countDocuments({
      date: { $gte: today, $lt: tomorrow },
      'status.short': { $in: ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT'] }
    });
    
    const notStartedMatches = await Match.countDocuments({
      date: { $gte: today, $lt: tomorrow },
      'status.short': 'NS'
    });
    
    console.log('📈 Current Database Stats:');
    console.log(`   Active Leagues: ${activeLeagues.length}`);
    console.log(`   Total Matches Today: ${totalMatches}`);
    console.log(`   Live Matches: ${liveMatches}`);
    console.log(`   Not Started Matches: ${notStartedMatches}`);
    console.log('');
    
    // Calculate API hits
    
    // 1. FIXTURE UPDATE (Daily at 00:20 UTC)
    console.log('1️⃣  FIXTURE UPDATE (Daily at 00:20 UTC)');
    console.log('─'.repeat(70));
    
    // Each league makes 1 API call per season (usually 1-2 seasons tried)
    const avgSeasonsPerLeague = 1.5; // Some leagues try current + previous season
    const fixtureUpdateCalls = Math.ceil(activeLeagues.length * avgSeasonsPerLeague);
    
    // Team details calls for new teams (estimate 2-3 new teams per day)
    const newTeamCalls = 3;
    
    const dailyFixtureUpdate = fixtureUpdateCalls + newTeamCalls;
    console.log(`   • League fixtures: ${fixtureUpdateCalls} calls (${activeLeagues.length} leagues × ${avgSeasonsPerLeague} seasons avg)`);
    console.log(`   • New team details: ${newTeamCalls} calls`);
    console.log(`   📊 Total: ${dailyFixtureUpdate} calls/day`);
    console.log('');
    
    // 2. LIVE MATCH UPDATES (Every 2 minutes)
    console.log('2️⃣  LIVE MATCH UPDATES (Every 2 minutes)');
    console.log('─'.repeat(70));
    
    // Each live match requires 1 API call via getFixturesByIds
    // Matches are typically live for ~90-120 minutes
    const avgMatchDurationMinutes = 105; // 90 min match + 15 min halftime
    const updatesPerMatch = Math.ceil(avgMatchDurationMinutes / 2); // Every 2 minutes
    
    // Conservative estimate: average of 20-30 live matches throughout the day
    // (not all 73 at once, but staggered throughout the day)
    const avgConcurrentLiveMatches = Math.min(liveMatches, 30);
    const liveUpdateCallsPerDay = avgConcurrentLiveMatches * updatesPerMatch;
    
    console.log(`   • Average concurrent live matches: ${avgConcurrentLiveMatches}`);
    console.log(`   • Updates per match: ${updatesPerMatch} (every 2 min for ~${avgMatchDurationMinutes} min)`);
    console.log(`   📊 Total: ~${liveUpdateCallsPerDay} calls/day`);
    console.log('');
    
    // 3. UPCOMING MATCHES CHECK (Every 30 minutes, then every 1 minute when close)
    console.log('3️⃣  UPCOMING MATCHES CHECK (Every 30 min, then every 1 min when <30 min)');
    console.log('─'.repeat(70));
    
    // Matches entering 30-min window get checked every minute
    // Estimate: 10-15 matches per day enter this window
    const matchesEnteringWindow = Math.min(notStartedMatches, 15);
    const intensiveTrackingMinutes = 30; // Track for 30 minutes before start
    const intensiveUpdatesPerMatch = intensiveTrackingMinutes; // 1 per minute
    
    const upcomingMatchCalls = matchesEnteringWindow * intensiveUpdatesPerMatch;
    console.log(`   • Matches entering 30-min window: ${matchesEnteringWindow}`);
    console.log(`   • Intensive updates per match: ${intensiveUpdatesPerMatch} (1 per minute for 30 min)`);
    console.log(`   📊 Total: ~${upcomingMatchCalls} calls/day`);
    console.log('');
    
    // 4. TEAM STATISTICS UPDATE (Daily at 00:30 UTC)
    console.log('4️⃣  TEAM STATISTICS UPDATE (Daily at 00:30 UTC)');
    console.log('─'.repeat(70));
    
    // Count unique teams across all active leagues
    const teamIdsSet = new Set();
    for (const league of activeLeagues) {
      const matches = await Match.find({ 
        leagueId: league.leagueId,
        season: league.season || new Date().getFullYear()
      }).select('homeTeam awayTeam').lean();
      
      matches.forEach(m => {
        if (typeof m.homeTeam === 'number') teamIdsSet.add(m.homeTeam);
        if (typeof m.awayTeam === 'number') teamIdsSet.add(m.awayTeam);
      });
    }
    
    const uniqueTeams = teamIdsSet.size;
    const teamStatsCalls = uniqueTeams;
    
    console.log(`   • Unique teams across active leagues: ${uniqueTeams}`);
    console.log(`   • 1 API call per team for statistics`);
    console.log(`   📊 Total: ${teamStatsCalls} calls/day`);
    console.log('');
    
    // 5. LEAGUE SYNC (Daily at 00:10 UTC) - minimal impact
    console.log('5️⃣  LEAGUE SYNC (Daily at 00:10 UTC)');
    console.log('─'.repeat(70));
    const leagueSyncCalls = 2; // Usually 2 calls (current + previous season)
    console.log(`   📊 Total: ~${leagueSyncCalls} calls/day`);
    console.log('');
    
    // TOTAL CALCULATION
    console.log('='.repeat(70));
    console.log('📊 TOTAL ESTIMATED DAILY API HITS:');
    console.log('='.repeat(70));
    
    const totalDailyHits = dailyFixtureUpdate + liveUpdateCallsPerDay + upcomingMatchCalls + teamStatsCalls + leagueSyncCalls;
    
    console.log(`   1. Fixture Update:        ${dailyFixtureUpdate.toLocaleString()}`);
    console.log(`   2. Live Match Updates:    ${liveUpdateCallsPerDay.toLocaleString()}`);
    console.log(`   3. Upcoming Matches:      ${upcomingMatchCalls.toLocaleString()}`);
    console.log(`   4. Team Statistics:       ${teamStatsCalls.toLocaleString()}`);
    console.log(`   5. League Sync:            ${leagueSyncCalls.toLocaleString()}`);
    console.log('   ' + '─'.repeat(66));
    console.log(`   📊 TOTAL:                 ${totalDailyHits.toLocaleString()} API calls/day`);
    console.log('');
    
    // Monthly estimate
    const monthlyHits = totalDailyHits * 30;
    console.log(`   📅 Monthly Estimate:     ${monthlyHits.toLocaleString()} API calls/month`);
    console.log('');
    
    // API Limit Check
    const dailyLimit = parseInt(process.env.API_DAILY_RESERVOIR || '70000', 10);
    const percentageUsed = (totalDailyHits / dailyLimit) * 100;
    
    console.log('='.repeat(70));
    console.log('⚠️  API LIMIT ANALYSIS:');
    console.log('='.repeat(70));
    console.log(`   Daily API Limit:         ${dailyLimit.toLocaleString()}`);
    console.log(`   Estimated Daily Usage:   ${totalDailyHits.toLocaleString()} (${percentageUsed.toFixed(1)}%)`);
    console.log(`   Remaining Buffer:        ${(dailyLimit - totalDailyHits).toLocaleString()}`);
    
    if (percentageUsed > 90) {
      console.log(`   ⚠️  WARNING: Usage exceeds 90% of daily limit!`);
    } else if (percentageUsed > 70) {
      console.log(`   ⚠️  CAUTION: Usage above 70% of daily limit`);
    } else {
      console.log(`   ✅ Status: Within safe limits`);
    }
    console.log('');
    
    // Breakdown by hour (for live updates)
    console.log('='.repeat(70));
    console.log('📈 PEAK HOUR ANALYSIS (Live Match Updates):');
    console.log('='.repeat(70));
    const callsPerHour = Math.ceil((liveUpdateCallsPerDay + upcomingMatchCalls) / 24);
    const callsPerMinute = Math.ceil(callsPerHour / 60);
    console.log(`   Average calls/hour:      ${callsPerHour}`);
    console.log(`   Average calls/minute:    ${callsPerMinute}`);
    console.log(`   Peak (match day):        ~${Math.ceil(callsPerHour * 1.5)} calls/hour`);
    console.log('');
    
    console.log('✅ Calculation completed!');
    
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


