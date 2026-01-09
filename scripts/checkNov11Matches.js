import dotenv from 'dotenv';
import connectDB from '../src/config/database.js';
import Match from '../src/models/matchModel.js';
import League from '../src/models/leaugeModel.js';

dotenv.config();

const checkNov11Matches = async () => {
  try {
    console.log('📡 Connecting to database...');
    await connectDB();
    console.log('✅ Database connected\n');

    // Check what getNextTwoDaysFixtures calculates
    const today = new Date();
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(today.getDate() + 2);
    
    const fromDate = today.toISOString().split('T')[0];
    const toDate = dayAfterTomorrow.toISOString().split('T')[0];
    
    console.log('🔍 DATE CALCULATION IN getNextTwoDaysFixtures():');
    console.log(`   Today: ${today.toISOString()}`);
    console.log(`   Day after tomorrow: ${dayAfterTomorrow.toISOString()}`);
    console.log(`   fromDate: ${fromDate}`);
    console.log(`   toDate: ${toDate}\n`);

    // Check matches for Nov 11 specifically
    const nov11Start = new Date('2025-11-11T00:00:00.000Z');
    const nov11End = new Date('2025-11-11T23:59:59.999Z');
    
    const nov11Matches = await Match.find({
      date: { $gte: nov11Start, $lte: nov11End }
    }).sort({ date: 1 }).lean();
    
    console.log(`📅 MATCHES FOR NOVEMBER 11, 2025:`);
    console.log(`   Found: ${nov11Matches.length} matches\n`);
    
    if (nov11Matches.length === 0) {
      console.log('❌ NO MATCHES FOUND for November 11!\n');
      
      // Check when the cron last ran
      console.log('🔍 POSSIBLE REASONS:');
      console.log('   1. The fixture update cron (00:20 UTC) may not have run yet today');
      console.log('   2. The API may not have returned matches for Nov 11');
      console.log('   3. There may genuinely be no matches scheduled for Nov 11\n');
      
      // Check matches around Nov 11
      const nov10Matches = await Match.find({
        date: { 
          $gte: new Date('2025-11-10T00:00:00.000Z'), 
          $lte: new Date('2025-11-10T23:59:59.999Z') 
        }
      }).countDocuments();
      
      const nov12Matches = await Match.find({
        date: { 
          $gte: new Date('2025-11-12T00:00:00.000Z'), 
          $lte: new Date('2025-11-12T23:59:59.999Z') 
        }
      }).countDocuments();
      
      console.log('📊 MATCHES AROUND NOV 11:');
      console.log(`   Nov 10: ${nov10Matches} matches`);
      console.log(`   Nov 11: ${nov11Matches.length} matches`);
      console.log(`   Nov 12: ${nov12Matches} matches\n`);
      
      // Check what the cron would fetch if it ran now
      console.log('📅 IF CRON RAN NOW (current time):');
      console.log(`   Would fetch: ${fromDate} to ${toDate}`);
      console.log(`   This includes Nov 11: ${toDate >= '2025-11-11' ? 'YES ✅' : 'NO ❌'}\n`);
      
      // Check if cron ran today
      const todayStart = new Date(today);
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setUTCHours(23, 59, 59, 999);
      
      const todayMatches = await Match.find({
        date: { $gte: todayStart, $lte: todayEnd }
      }).countDocuments();
      
      console.log('📊 TODAY\'S MATCHES (to verify cron ran):');
      console.log(`   Nov 9 matches: ${todayMatches}`);
      console.log(`   This suggests cron ${todayMatches > 0 ? 'DID run' : 'DID NOT run'} today\n`);
      
    } else {
      console.log('✅ Found matches for November 11:');
      const leagueIds = [...new Set(nov11Matches.map(m => m.leagueId))];
      const leagues = await League.find({ leagueId: { $in: leagueIds } }).lean();
      const leagueMap = new Map(leagues.map(l => [l.leagueId, l]));
      
      nov11Matches.slice(0, 10).forEach((match, idx) => {
        const league = leagueMap.get(match.leagueId);
        const leagueName = league ? league.name : `League ${match.leagueId}`;
        console.log(`   ${idx + 1}. ${new Date(match.date).toISOString()} | ${leagueName} | Status: ${match.status?.short || 'N/A'}`);
      });
      if (nov11Matches.length > 10) {
        console.log(`   ... and ${nov11Matches.length - 10} more`);
      }
    }
    
    // Check the actual date range calculation issue
    console.log('\n🔍 ANALYZING DATE RANGE CALCULATION:');
    console.log('   The function name is "getNextTwoDaysFixtures"');
    console.log('   But it calculates: today to (today + 2 days)');
    console.log('   This means: TODAY, TOMORROW, DAY AFTER TOMORROW (3 days total)');
    console.log('   So on Nov 9 at 00:20 UTC, it should fetch: Nov 9, 10, 11\n');
    
    // Verify: if today is Nov 9, day after tomorrow should be Nov 11
    const testDate = new Date('2025-11-09T00:20:00.000Z');
    const testDayAfterTomorrow = new Date(testDate);
    testDayAfterTomorrow.setDate(testDate.getDate() + 2);
    const testToDate = testDayAfterTomorrow.toISOString().split('T')[0];
    
    console.log('🧪 TEST: If cron ran on Nov 9 at 00:20 UTC:');
    console.log(`   fromDate would be: 2025-11-09`);
    console.log(`   toDate would be: ${testToDate}`);
    console.log(`   This ${testToDate === '2025-11-11' ? 'CORRECTLY' : 'INCORRECTLY'} includes Nov 11\n`);
    
    console.log('✅ Check completed!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking Nov 11 matches:', error);
    process.exit(1);
  }
};

checkNov11Matches();

