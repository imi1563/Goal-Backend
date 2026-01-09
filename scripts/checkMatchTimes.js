/**
 * Check match start times for upcoming matches
 * Usage: node scripts/checkMatchTimes.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Match from '../src/models/matchModel.js';
import connectDB from '../src/config/database.js';

dotenv.config();

const checkMatchTimes = async () => {
  try {
    console.log('📡 Connecting to database...');
    await connectDB();
    console.log('✅ Database connected\n');

    // Find all upcoming matches (not finished)
    const upcomingMatches = await Match.find({
      'status.short': { $nin: ['FT', 'AET', 'PEN', 'PST', 'CANC', 'SUSP', 'ABD', 'AWD', 'WO'] }
    })
    .sort({ date: 1 })
    .limit(20)
    .lean();

    if (!upcomingMatches || upcomingMatches.length === 0) {
      console.log('❌ No upcoming matches found');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📅 UPCOMING MATCHES (${upcomingMatches.length})`);
    console.log('═══════════════════════════════════════════════════════════\n');

    const now = new Date();

    upcomingMatches.forEach((match, index) => {
      const matchDate = new Date(match.date);
      const timeUntil = matchDate - now;
      const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
      const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
      
      const localDate = matchDate.toLocaleString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });

      const utcDate = matchDate.toISOString();

      let statusIcon = '⏳';
      let timeStatus = '';
      
      if (timeUntil < 0) {
        statusIcon = '⏰';
        timeStatus = ` (STARTED ${Math.abs(hoursUntil)}h ${Math.abs(minutesUntil)}m ago)`;
      } else if (timeUntil < 60 * 60 * 1000) {
        statusIcon = '🔴';
        timeStatus = ` (Starting in ${minutesUntil} minutes!)`;
      } else if (timeUntil < 24 * 60 * 60 * 1000) {
        statusIcon = '🟡';
        timeStatus = ` (Starting in ${hoursUntil}h ${minutesUntil}m)`;
      } else {
        const daysUntil = Math.floor(timeUntil / (24 * 60 * 60 * 1000));
        timeStatus = ` (${daysUntil} days away)`;
      }

      console.log(`${index + 1}. ${statusIcon} ${match.homeTeam} vs ${match.awayTeam}`);
      console.log(`   📅 Local Time: ${localDate}`);
      console.log(`   🌐 UTC Time: ${utcDate}`);
      console.log(`   📊 Status: ${match.status?.short || 'NS'} ${timeStatus}`);
      console.log(`   🆔 Fixture ID: ${match.fixtureId}`);
      console.log(`   🏆 League ID: ${match.leagueId}`);
      if (match.season) {
        console.log(`   📈 Season: ${match.season}`);
      }
      console.log('');
    });

    // Summary
    const nextMatch = upcomingMatches[0];
    const nextMatchDate = new Date(nextMatch.date);
    const timeUntilNext = nextMatchDate - now;
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n⏰ Next match: ${nextMatch.homeTeam} vs ${nextMatch.awayTeam}`);
    console.log(`📅 Start time: ${nextMatchDate.toLocaleString()}`);
    
    if (timeUntilNext > 0) {
      const hours = Math.floor(timeUntilNext / (1000 * 60 * 60));
      const minutes = Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60));
      console.log(`⏳ Time until: ${hours} hours ${minutes} minutes`);
    } else {
      console.log(`⚠️ Match should have started (may need status update)`);
    }
    
    console.log('');

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

checkMatchTimes();

