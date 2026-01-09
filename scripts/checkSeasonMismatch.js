/**
 * Check if match.season and league.season have mismatches
 * Usage: node scripts/checkSeasonMismatch.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Match from '../src/models/matchModel.js';
import League from '../src/models/leaugeModel.js';
import connectDB from '../src/config/database.js';

dotenv.config();

const checkSeasonMismatch = async () => {
  try {
    console.log('📡 Connecting to database...');
    await connectDB();
    console.log('✅ Database connected\n');

    // Get all leagues with seasons
    const leagues = await League.find({ season: { $exists: true, $ne: null } }).lean();
    const leagueSeasonMap = {};
    leagues.forEach(l => {
      leagueSeasonMap[l.leagueId] = l.season;
    });

    console.log(`📊 Found ${leagues.length} leagues with seasons\n`);

    // Get all matches with seasons
    const matches = await Match.find({ 
      season: { $exists: true, $ne: null },
      leagueId: { $exists: true, $ne: null }
    }).lean();

    console.log(`📊 Found ${matches.length} matches with seasons\n`);

    // Check for mismatches
    const mismatches = [];
    const matched = [];

    matches.forEach(match => {
      const leagueSeason = leagueSeasonMap[match.leagueId];
      
      if (leagueSeason === undefined) {
        // League not found - skip
        return;
      }

      if (match.season !== leagueSeason) {
        mismatches.push({
          fixtureId: match.fixtureId,
          leagueId: match.leagueId,
          matchSeason: match.season,
          leagueSeason: leagueSeason,
          difference: match.season - leagueSeason,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam
        });
      } else {
        matched.push({
          fixtureId: match.fixtureId,
          leagueId: match.leagueId,
          season: match.season
        });
      }
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 SEASON MISMATCH ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (mismatches.length > 0) {
      console.log(`❌ FOUND ${mismatches.length} MISMATCHES!\n`);
      
      // Group by league
      const byLeague = {};
      mismatches.forEach(m => {
        if (!byLeague[m.leagueId]) {
          byLeague[m.leagueId] = [];
        }
        byLeague[m.leagueId].push(m);
      });

      Object.entries(byLeague).forEach(([leagueId, leagueMismatches]) => {
        console.log(`\n🏆 League ${leagueId}:`);
        console.log(`   League Season: ${leagueMismatches[0].leagueSeason}`);
        console.log(`   Mismatched Matches: ${leagueMismatches.length}`);
        leagueMismatches.slice(0, 5).forEach((m, i) => {
          console.log(`   ${i + 1}. Fixture ${m.fixtureId}: match.season = ${m.matchSeason} (diff: ${m.difference > 0 ? '+' : ''}${m.difference})`);
        });
        if (leagueMismatches.length > 5) {
          console.log(`   ... and ${leagueMismatches.length - 5} more`);
        }
      });

      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('⚠️  MISMATCH DETECTED - THIS CAN CAUSE PREDICTION ISSUES!');
      console.log('═══════════════════════════════════════════════════════════\n');
    } else {
      console.log(`✅ NO MISMATCHES FOUND!\n`);
      console.log(`   All ${matched.length} matches have matching seasons with their leagues`);
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total matches checked: ${matches.length}`);
    console.log(`✅ Matched: ${matched.length}`);
    console.log(`❌ Mismatched: ${mismatches.length}`);
    console.log(`📊 Mismatch percentage: ${((mismatches.length / matches.length) * 100).toFixed(2)}%\n`);

    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected');
    process.exit(mismatches.length > 0 ? 1 : 0);

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

checkSeasonMismatch();

