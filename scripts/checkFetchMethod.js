/**
 * Check which matches will be fetched by normal method vs fallback (fixture ID)
 * Usage: node scripts/checkFetchMethod.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Match from '../src/models/matchModel.js';
import League from '../src/models/leaugeModel.js';
import { getLiveMatches } from '../src/services/footballApiService.js';
import connectDB from '../src/config/database.js';

dotenv.config();

const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'PST', 'CANC', 'SUSP', 'ABD', 'AWD', 'WO'];
const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT'];

const checkFetchMethod = async () => {
  try {
    console.log('📡 Connecting to database...');
    await connectDB();
    console.log('✅ Database connected\n');

    // Get active matches from DB (same logic as liveMatchUpdater)
    const matches = await Match.find({
      $and: [
        { 'status.short': { $nin: FINISHED_STATUSES } },
        {
          $or: [
            { 'status.short': { $in: LIVE_STATUSES } },
            { 
              date: { 
                $gte: new Date(),
                $lte: new Date(Date.now() + 2 * 60 * 60 * 1000)
              }
            }
          ]
        }
      ]
    }).lean();

    console.log(`📊 Found ${matches.length} active/upcoming matches in DB\n`);

    if (matches.length === 0) {
      console.log('❌ No matches to check');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Get league IDs
    const leagueIds = [...new Set(matches.map(m => m.leagueId).filter(Boolean))];
    console.log(`🏆 Leagues involved: ${leagueIds.join(', ')}\n`);

    // Get leagues to check seasons
    const leagues = await League.find({ leagueId: { $in: leagueIds } }).lean();
    const leagueSeasons = {};
    leagues.forEach(l => {
      leagueSeasons[l.leagueId] = l.season;
    });

    console.log('📅 League Seasons:');
    Object.entries(leagueSeasons).forEach(([id, season]) => {
      console.log(`   League ${id}: Season ${season}`);
    });
    console.log('');

    // Fetch matches via normal method (league + season)
    console.log('🔄 Fetching matches via NORMAL method (league + season)...');
    const liveMatchesData = await getLiveMatches(leagueIds);
    
    console.log(`✅ Normal fetch returned: ${liveMatchesData?.length || 0} matches\n`);

    // Identify which matches are in normal fetch vs fallback
    const normalFetchMatches = new Set();
    liveMatchesData?.forEach(apiMatch => {
      normalFetchMatches.add(apiMatch.fixture.id);
    });

    const matchesByMethod = {
      normal: [],
      fallback: []
    };

    matches.forEach(match => {
      const matchInfo = {
        fixtureId: match.fixtureId,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        leagueId: match.leagueId,
        date: match.date, // Keep as Date object for time calculations
        dateString: new Date(match.date).toLocaleString(),
        status: match.status?.short || 'NS'
      };

      if (normalFetchMatches.has(match.fixtureId)) {
        matchesByMethod.normal.push(matchInfo);
      } else if (!FINISHED_STATUSES.includes(match.status?.short || '')) {
        matchesByMethod.fallback.push(matchInfo);
      }
    });

    // Display results
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 FETCH METHOD ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`🟢 NORMAL METHOD (League + Season) - ${matchesByMethod.normal.length} matches:`);
    console.log('   Fetched via: getLiveMatches(leagueIds)');
    console.log('   Method: Bulk fetch by leagueId + season');
    console.log('   Speed: Fast (multiple matches per API call)\n');
    
    if (matchesByMethod.normal.length > 0) {
      matchesByMethod.normal.forEach((m, i) => {
        const matchDate = new Date(m.date);
        const timeUntil = matchDate - new Date();
        const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
        const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
        
        let timeStatus = '';
        if (timeUntil < 0) {
          timeStatus = ` (STARTED ${Math.abs(hoursUntil)}h ${Math.abs(minutesUntil)}m ago)`;
        } else if (timeUntil < 60 * 60 * 1000) {
          timeStatus = ` (Starting in ${minutesUntil} minutes!)`;
        } else if (timeUntil < 24 * 60 * 60 * 1000) {
          timeStatus = ` (Starting in ${hoursUntil}h ${minutesUntil}m)`;
        } else {
          const daysUntil = Math.floor(timeUntil / (24 * 60 * 60 * 1000));
          timeStatus = ` (${daysUntil} days away)`;
        }
        
        console.log(`   ${i + 1}. ${m.homeTeam} vs ${m.awayTeam}`);
        console.log(`      ⏰ Time: ${new Date(m.date).toLocaleString()}${timeStatus}`);
        console.log(`      🆔 Fixture ID: ${m.fixtureId} | League: ${m.leagueId}`);
      });
    } else {
      console.log('   (None)');
    }

    console.log(`\n🟡 FALLBACK METHOD (Fixture ID) - ${matchesByMethod.fallback.length} matches:`);
    console.log('   Fetched via: getFixturesByIds(fixtureIds)');
    console.log('   Method: Individual fetch by fixtureId (one by one)');
    console.log('   Speed: Slower (one match per API call)');
    console.log('   Reason: Not found in normal fetch (season mismatch, API filters, etc.)\n');
    
    if (matchesByMethod.fallback.length > 0) {
      matchesByMethod.fallback.forEach((m, i) => {
        const matchDate = new Date(m.date);
        const timeUntil = matchDate - new Date();
        const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
        const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
        
        let timeStatus = '';
        if (timeUntil < 0) {
          timeStatus = ` (STARTED ${Math.abs(hoursUntil)}h ${Math.abs(minutesUntil)}m ago)`;
        } else if (timeUntil < 60 * 60 * 1000) {
          timeStatus = ` (Starting in ${minutesUntil} minutes!)`;
        } else if (timeUntil < 24 * 60 * 60 * 1000) {
          timeStatus = ` (Starting in ${hoursUntil}h ${minutesUntil}m)`;
        } else {
          const daysUntil = Math.floor(timeUntil / (24 * 60 * 60 * 1000));
          timeStatus = ` (${daysUntil} days away)`;
        }
        
        console.log(`   ${i + 1}. ${m.homeTeam} vs ${m.awayTeam}`);
        console.log(`      ⏰ Time: ${new Date(m.date).toLocaleString()}${timeStatus}`);
        console.log(`      🆔 Fixture ID: ${m.fixtureId} | League: ${m.leagueId}`);
        console.log(`      ⚠️  Why fallback? May have season mismatch or API filter issue`);
      });
    } else {
      console.log('   ✅ All matches found via normal method!');
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Normal method: ${matchesByMethod.normal.length} matches`);
    console.log(`Fallback method: ${matchesByMethod.fallback.length} matches`);
    console.log(`Total: ${matches.length} matches\n`);

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

checkFetchMethod();

