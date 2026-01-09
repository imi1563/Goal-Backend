/**
 * Check match times and update methods for active matches
 * Shows when matches start and which method (normal vs fixture ID) will be used
 * Usage: node scripts/checkMatchUpdateSchedule.js
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

const checkMatchUpdateSchedule = async () => {
  try {
    console.log('📡 Connecting to database...');
    await connectDB();
    console.log('✅ Database connected\n');

    // Get active matches from DB (same logic as liveMatchUpdater)
    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    
    const matches = await Match.find({
      $and: [
        { 'status.short': { $nin: FINISHED_STATUSES } },
        {
          $or: [
            { 'status.short': { $in: LIVE_STATUSES } },
            { 
              date: { 
                $gte: now,
                $lte: twoHoursLater
              }
            }
          ]
        }
      ]
    }).select('_id leagueId fixtureId status date homeTeam awayTeam season').lean();

    console.log(`📊 Found ${matches.length} active/upcoming matches in DB\n`);

    if (matches.length === 0) {
      console.log('❌ No matches to check');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Get league IDs
    const leagueIds = [...new Set(matches.map(m => m.leagueId).filter(Boolean))];
    console.log(`🏆 Leagues involved: ${leagueIds.join(', ')}\n`);

    // Fetch matches via normal method (league + season)
    console.log('🔄 Fetching matches via NORMAL method (league + season)...');
    const liveMatchesData = await getLiveMatches(leagueIds);
    
    console.log(`✅ Normal fetch returned: ${liveMatchesData?.length || 0} matches\n`);

    // Identify which matches are in normal fetch vs fallback
    const normalFetchMatches = new Set();
    liveMatchesData?.forEach(apiMatch => {
      normalFetchMatches.add(apiMatch.fixture.id);
    });

    // Categorize matches
    const matchesWithInfo = matches.map(match => {
      const matchDate = new Date(match.date);
      const timeUntil = matchDate.getTime() - now.getTime();
      const isFoundInNormal = normalFetchMatches.has(match.fixtureId);
      
      // Determine update method
      let updateMethod = 'Normal Tracking';
      let updateFrequency = 'Every 2 minutes';
      let updateReason = 'Tracked via bulk league/season fetch';
      
      if (!isFoundInNormal && !FINISHED_STATUSES.includes(match.status?.short || '')) {
        updateMethod = 'Fixture ID (Fallback)';
        updateFrequency = 'Every 2 minutes (slower - one-by-one)';
        updateReason = 'Not found in normal fetch - fetched individually by fixture ID';
      }
      
      // Check if intensive tracking applies (within 30 minutes)
      const thirtyMins = 30 * 60 * 1000;
      if (timeUntil > 0 && timeUntil <= thirtyMins && !FINISHED_STATUSES.includes(match.status?.short || '')) {
        updateFrequency = 'Every 1 minute (Intensive)';
        updateReason += ' | Within 30 mins - intensive tracking activated';
      }
      
      // Format time info
      const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
      const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
      
      let timeStatus = '';
      if (timeUntil < 0) {
        timeStatus = `STARTED ${Math.abs(hoursUntil)}h ${Math.abs(minutesUntil)}m ago`;
      } else if (timeUntil < 60 * 60 * 1000) {
        timeStatus = `Starting in ${minutesUntil} minutes`;
      } else if (timeUntil < 24 * 60 * 60 * 1000) {
        timeStatus = `Starting in ${hoursUntil}h ${minutesUntil}m`;
      } else {
        const daysUntil = Math.floor(timeUntil / (24 * 60 * 60 * 1000));
        timeStatus = `${daysUntil} days away`;
      }

      return {
        fixtureId: match.fixtureId,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        leagueId: match.leagueId,
        date: matchDate,
        dateString: matchDate.toLocaleString(),
        utcString: matchDate.toISOString(),
        timeUntil,
        timeStatus,
        status: match.status?.short || 'NS',
        updateMethod,
        updateFrequency,
        updateReason,
        isNormalMethod: isFoundInNormal
      };
    });

    // Sort by date (soonest first)
    matchesWithInfo.sort((a, b) => a.timeUntil - b.timeUntil);

    // Display results
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('📊 MATCH UPDATE SCHEDULE');
    console.log('═══════════════════════════════════════════════════════════════════════════════\n');

    matchesWithInfo.forEach((m, i) => {
      const methodIcon = m.isNormalMethod ? '🟢' : '🟡';
      
      console.log(`${i + 1}. ${methodIcon} Match: ${m.homeTeam} vs ${m.awayTeam}`);
      console.log(`   ⏰ Scheduled Time: ${m.dateString}`);
      console.log(`   🌐 UTC Time: ${m.utcString}`);
      console.log(`   📍 ${m.timeStatus}`);
      console.log(`   📊 Status: ${m.status}`);
      console.log(`   🆔 Fixture ID: ${m.fixtureId} | League ID: ${m.leagueId}`);
      console.log(`   🔄 Update Method: ${m.updateMethod}`);
      console.log(`   ⚡ Update Frequency: ${m.updateFrequency}`);
      console.log(`   📝 Reason: ${m.updateReason}`);
      console.log('');
    });

    // Summary
    const normalCount = matchesWithInfo.filter(m => m.isNormalMethod).length;
    const fallbackCount = matchesWithInfo.filter(m => !m.isNormalMethod).length;
    const intensiveCount = matchesWithInfo.filter(m => m.updateFrequency.includes('1 minute')).length;
    
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log(`Total matches: ${matchesWithInfo.length}`);
    console.log(`🟢 Normal method (bulk fetch): ${normalCount}`);
    console.log(`🟡 Fallback method (fixture ID): ${fallbackCount}`);
    console.log(`⚡ Intensive tracking (within 30 mins): ${intensiveCount}`);
    console.log(`⏱️  Regular tracking (every 2 mins): ${matchesWithInfo.length - intensiveCount}\n`);

    // Show update schedules
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('⏱️  UPDATE SCHEDULE INFO');
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('• Regular Updates: Every 2 minutes for live matches + matches within 2 hours');
    console.log('• Intensive Updates: Every 1 minute for matches starting within 30 minutes');
    console.log('• Normal Method: Fast bulk fetch by league + season (multiple matches per API call)');
    console.log('• Fallback Method: Slower individual fetch by fixture ID (one match per API call)');
    console.log('• Matches not found in normal fetch will use fallback method automatically\n');

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

checkMatchUpdateSchedule();
