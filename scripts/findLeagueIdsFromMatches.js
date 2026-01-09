/**
 * Find League IDs for matches with specific team IDs
 * 
 * Usage: node scripts/findLeagueIdsFromMatches.js
 *   - Will find league IDs for all recent active matches
 *   Or: node scripts/findLeagueIdsFromMatches.js [teamId1] [teamId2] ...
 *   - Will find league IDs for matches with those team IDs
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Match from '../src/models/matchModel.js';
import League from '../src/models/leaugeModel.js';
import connectDB from '../src/config/database.js';

dotenv.config();

const findLeagueIds = async () => {
  try {
    console.log('📡 Connecting to database...');
    await connectDB();
    console.log('✅ Database connected\n');

    // Get team IDs from command line arguments (if provided)
    const teamIds = process.argv.slice(2).map(id => parseInt(id));

    let matches;
    
    if (teamIds.length > 0) {
      // Find matches with specific team IDs
      console.log(`🔍 Searching for matches with team IDs: ${teamIds.join(', ')}\n`);
      matches = await Match.find({
        $or: [
          { homeTeam: { $in: teamIds } },
          { awayTeam: { $in: teamIds } }
        ],
        'status.short': { $nin: ['FT', 'AET', 'PEN', 'PST', 'CANC', 'SUSP', 'ABD', 'AWD', 'WO'] }
      }).sort({ date: -1 }).limit(20);
    } else {
      // Find all recent active matches
      console.log('🔍 Finding recent active matches...\n');
      matches = await Match.find({
        'status.short': { $nin: ['FT', 'AET', 'PEN', 'PST', 'CANC', 'SUSP', 'ABD', 'AWD', 'WO'] }
      }).sort({ updatedAt: -1 }).limit(20);
    }

    if (!matches || matches.length === 0) {
      console.log('❌ No matches found');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Get unique league IDs
    const leagueIds = [...new Set(matches.map(m => m.leagueId).filter(Boolean))];
    
    // Get league details
    const leagues = await League.find({ leagueId: { $in: leagueIds } });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 MATCHES AND LEAGUE IDs');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Group matches by league
    const matchesByLeague = {};
    for (const match of matches) {
      if (!matchesByLeague[match.leagueId]) {
        matchesByLeague[match.leagueId] = [];
      }
      matchesByLeague[match.leagueId].push(match);
    }

    // Display matches grouped by league
    for (const [leagueId, leagueMatches] of Object.entries(matchesByLeague)) {
      const league = leagues.find(l => l.leagueId === parseInt(leagueId));
      
      console.log(`\n🏆 LEAGUE ID: ${leagueId}`);
      if (league) {
        console.log(`   Name: ${league.name}`);
        console.log(`   Country: ${league.country}`);
        console.log(`   Season: ${league.season}`);
        console.log(`   Active: ${league.isActive ? 'Yes' : 'No'}`);
      } else {
        console.log(`   ⚠️  League not found in database`);
      }
      console.log(`   Matches (${leagueMatches.length}):`);
      
      for (const match of leagueMatches) {
        const matchDate = new Date(match.date).toLocaleString();
        console.log(`      • ${match.homeTeam} vs ${match.awayTeam} (ID: ${match.fixtureId})`);
        console.log(`        Status: ${match.status.short} | Date: ${matchDate}`);
      }
    }

    // Summary
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n📊 Total Matches: ${matches.length}`);
    console.log(`🏆 Unique League IDs: ${leagueIds.length}`);
    console.log(`\n📝 League IDs:\n   ${leagueIds.join(', ')}\n`);

    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    
    try {
      await mongoose.disconnect();
    } catch (e) {
      // Ignore
    }
    
    process.exit(1);
  }
};

// Show usage
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('\n🔍 Find League IDs from Matches\n');
  console.log('Usage:');
  console.log('  node scripts/findLeagueIdsFromMatches.js              # Show recent active matches');
  console.log('  node scripts/findLeagueIdsFromMatches.js [teamId] ...  # Find matches by team IDs');
  console.log('\nExamples:');
  console.log('  node scripts/findLeagueIdsFromMatches.js');
  console.log('  node scripts/findLeagueIdsFromMatches.js 3342 3353');
  console.log('  node scripts/findLeagueIdsFromMatches.js 4220 4211 5511 5211');
  process.exit(0);
}

findLeagueIds();

