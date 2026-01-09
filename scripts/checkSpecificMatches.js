/**
 * Check specific matches by team IDs
 * Usage: node scripts/checkSpecificMatches.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Match from '../src/models/matchModel.js';
import connectDB from '../src/config/database.js';

dotenv.config();

const checkSpecificMatches = async () => {
  try {
    console.log('📡 Connecting to database...');
    await connectDB();
    console.log('✅ Database connected\n');

    // Team IDs from your terminal output
    const teamIds = [5200, 5206, 5213, 26200, 3342, 4220, 5511, 3475];
    
    // Find matches where homeTeam or awayTeam is in this list
    const matches = await Match.find({
      $or: [
        { homeTeam: { $in: teamIds } },
        { awayTeam: { $in: teamIds } }
      ]
    })
    .sort({ date: 1 })
    .lean();

    if (!matches || matches.length === 0) {
      console.log('❌ No matches found for those team IDs');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📅 MATCHES FOR SPECIFIED TEAMS (${matches.length})`);
    console.log('═══════════════════════════════════════════════════════════\n');

    const now = new Date();

    matches.forEach((match, index) => {
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

      let statusIcon = '⏳';
      let timeStatus = '';
      
      if (timeUntil < 0) {
        statusIcon = '⏰';
        const absHours = Math.abs(hoursUntil);
        const absMins = Math.abs(minutesUntil);
        timeStatus = ` (STARTED ${absHours}h ${absMins}m ago)`;
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
      console.log(`   📅 Date: ${localDate}`);
      console.log(`   🌐 UTC: ${matchDate.toISOString()}`);
      console.log(`   📊 Status: ${match.status?.short || 'NS'} ${timeStatus}`);
      console.log(`   🆔 Fixture ID: ${match.fixtureId}`);
      console.log(`   🏆 League ID: ${match.leagueId}`);
      if (match.season) {
        console.log(`   📈 Season: ${match.season}`);
      }
      console.log('');
    });

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

checkSpecificMatches();

