import dotenv from 'dotenv';
import connectDB from '../src/config/database.js';
import Match from '../src/models/matchModel.js';

dotenv.config();

const analyzeDateRangeInDB = async () => {
  try {
    console.log('📡 Connecting to database...');
    await connectDB();
    console.log('✅ Database connected\n');

    const now = new Date();
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    
    // Calculate what getNextTwoDaysFixtures() fetches
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setUTCDate(today.getUTCDate() + 2);
    dayAfterTomorrow.setUTCHours(23, 59, 59, 999);
    
    // Calculate cleanup cutoff (1 day retention)
    const RETENTION_DAYS = 1;
    const cutoffDate = new Date(now);
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - RETENTION_DAYS);
    cutoffDate.setUTCHours(0, 0, 0, 0);

    console.log('📅 DATE RANGE ANALYSIS\n');
    console.log(`🕒 Current UTC time: ${now.toISOString()}`);
    console.log(`📅 Today (UTC): ${today.toISOString().split('T')[0]}`);
    console.log(`📅 Day after tomorrow: ${dayAfterTomorrow.toISOString().split('T')[0]}\n`);

    console.log('🔍 WHAT getNextTwoDaysFixtures() FETCHES:');
    console.log(`   When cron runs at 00:20 UTC, it fetches:`);
    console.log(`   fromDate: ${today.toISOString().split('T')[0]}`);
    console.log(`   toDate: ${dayAfterTomorrow.toISOString().split('T')[0]}`);
    console.log(`   Range: ${today.toISOString().split('T')[0]} to ${dayAfterTomorrow.toISOString().split('T')[0]} (3 days)\n`);

    console.log('🧹 CLEANUP LOGIC:');
    console.log(`   Finished Match Cleanup runs at 01:10 UTC`);
    console.log(`   Retention period: ${RETENTION_DAYS} day(s)`);
    console.log(`   Deletes matches older than: ${cutoffDate.toISOString().split('T')[0]}\n`);

    // Query all matches to see date distribution
    const allMatches = await Match.find({}).select('date status').sort({ date: 1 }).lean();
    
    if (allMatches.length === 0) {
      console.log('❌ No matches found in database');
      return;
    }

    console.log(`📊 TOTAL MATCHES IN DATABASE: ${allMatches.length}\n`);

    // Group by date
    const matchesByDate = {};
    const dateRange = { min: null, max: null };
    
    allMatches.forEach(match => {
      const dateStr = new Date(match.date).toISOString().split('T')[0];
      if (!matchesByDate[dateStr]) {
        matchesByDate[dateStr] = [];
      }
      matchesByDate[dateStr].push(match);
      
      if (!dateRange.min || dateStr < dateRange.min) {
        dateRange.min = dateStr;
      }
      if (!dateRange.max || dateStr > dateRange.max) {
        dateRange.max = dateStr;
      }
    });

    console.log('📅 MATCHES BY DATE IN DATABASE:');
    Object.keys(matchesByDate).sort().forEach(date => {
      const count = matchesByDate[date].length;
      const statusCounts = {};
      matchesByDate[date].forEach(m => {
        const status = m.status?.short || 'UNKNOWN';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      const statusStr = Object.entries(statusCounts).map(([s, c]) => `${s}:${c}`).join(', ');
      console.log(`   ${date}: ${count} matches (${statusStr})`);
    });
    console.log('');

    console.log('📊 DATE RANGE IN DATABASE:');
    console.log(`   Earliest match: ${dateRange.min}`);
    console.log(`   Latest match: ${dateRange.max}`);
    console.log(`   Total days covered: ${Object.keys(matchesByDate).length} days\n`);

    // Check what SHOULD be in DB based on cron logic
    const expectedStartDate = new Date(cutoffDate);
    expectedStartDate.setUTCDate(expectedStartDate.getUTCDate() + 1); // Yesterday
    
    const expectedEndDate = new Date(dayAfterTomorrow);
    
    console.log('✅ EXPECTED DATE RANGE IN DATABASE:');
    console.log(`   Should have matches from: ${expectedStartDate.toISOString().split('T')[0]} (yesterday)`);
    console.log(`   To: ${expectedEndDate.toISOString().split('T')[0]} (day after tomorrow)`);
    console.log(`   Expected range: 3-4 days\n`);

    // Check for matches outside expected range
    const matchesBeforeExpected = allMatches.filter(m => {
      const matchDate = new Date(m.date).toISOString().split('T')[0];
      return matchDate < expectedStartDate.toISOString().split('T')[0];
    });
    
    const matchesAfterExpected = allMatches.filter(m => {
      const matchDate = new Date(m.date).toISOString().split('T')[0];
      return matchDate > expectedEndDate.toISOString().split('T')[0];
    });

    if (matchesBeforeExpected.length > 0) {
      console.log(`⚠️  FOUND ${matchesBeforeExpected.length} MATCHES BEFORE EXPECTED RANGE:`);
      const oldDates = {};
      matchesBeforeExpected.forEach(m => {
        const dateStr = new Date(m.date).toISOString().split('T')[0];
        oldDates[dateStr] = (oldDates[dateStr] || 0) + 1;
      });
      Object.keys(oldDates).sort().forEach(date => {
        console.log(`   ${date}: ${oldDates[date]} matches (should be cleaned up)`);
      });
      console.log('');
    }

    if (matchesAfterExpected.length > 0) {
      console.log(`⚠️  FOUND ${matchesAfterExpected.length} MATCHES AFTER EXPECTED RANGE:`);
      const futureDates = {};
      matchesAfterExpected.forEach(m => {
        const dateStr = new Date(m.date).toISOString().split('T')[0];
        futureDates[dateStr] = (futureDates[dateStr] || 0) + 1;
      });
      Object.keys(futureDates).sort().forEach(date => {
        console.log(`   ${date}: ${futureDates[date]} matches (beyond day after tomorrow)`);
      });
      console.log('');
    }

    if (matchesBeforeExpected.length === 0 && matchesAfterExpected.length === 0) {
      console.log('✅ All matches are within expected date range!\n');
    }

    // Summary
    console.log('📋 SUMMARY:');
    console.log(`   • Fixture Update cron (00:20 UTC): Fetches matches from TODAY to DAY AFTER TOMORROW`);
    console.log(`   • Cleanup cron (01:10 UTC): Deletes matches older than ${RETENTION_DAYS} day(s)`);
    console.log(`   • Expected in DB: Yesterday to Day After Tomorrow (3-4 days)`);
    console.log(`   • Actual in DB: ${dateRange.min} to ${dateRange.max} (${Object.keys(matchesByDate).length} days)`);
    
    console.log('\n✅ Analysis completed!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error analyzing date range:', error);
    process.exit(1);
  }
};

analyzeDateRangeInDB();

