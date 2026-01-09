import dotenv from 'dotenv';
import connectDB from '../src/config/database.js';
import Match from '../src/models/matchModel.js';
import League from '../src/models/leaugeModel.js';

dotenv.config();

const checkNextTwoDaysMatches = async () => {
  try {
    console.log('📡 Connecting to database...');
    await connectDB();
    console.log('✅ Database connected\n');

    const now = new Date();
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setUTCDate(today.getUTCDate() + 2);
    dayAfterTomorrow.setUTCHours(23, 59, 59, 999);

    console.log(`🕒 Current UTC time: ${now.toISOString()}`);
    console.log(`📅 Checking matches from: ${today.toISOString()}`);
    console.log(`📅 To: ${dayAfterTomorrow.toISOString()}\n`);

    // Query matches for next 2 days (same logic as getNextTwoDaysFixtures)
    const matches = await Match.find({
      date: { $gte: today, $lte: dayAfterTomorrow }
    }).sort({ date: 1 }).lean();

    console.log(`📊 Total matches found in next 2 days: ${matches.length}\n`);

    if (matches.length === 0) {
      console.log('❌ NO MATCHES FOUND for the next 2 days in database!');
      console.log('💡 This means the fixture update cron job may not be working correctly.');
      console.log('💡 Check if the cron job ran successfully at 00:20 UTC.');
      return;
    }

    // Check if matches are ordered
    let isOrdered = true;
    for (let i = 1; i < matches.length; i++) {
      const prevDate = new Date(matches[i - 1].date);
      const currDate = new Date(matches[i].date);
      if (currDate < prevDate) {
        isOrdered = false;
        console.log(`⚠️ Found unordered match at index ${i}:`);
        console.log(`   Previous: ${prevDate.toISOString()}`);
        console.log(`   Current: ${currDate.toISOString()}`);
        break;
      }
    }

    console.log(`✅ Matches are ${isOrdered ? 'ORDERED' : 'NOT ORDERED'} by date\n`);

    // Group by date
    const matchesByDate = {};
    matches.forEach(match => {
      const dateStr = new Date(match.date).toISOString().split('T')[0];
      if (!matchesByDate[dateStr]) {
        matchesByDate[dateStr] = [];
      }
      matchesByDate[dateStr].push(match);
    });

    console.log('📅 Matches grouped by date:');
    Object.keys(matchesByDate).sort().forEach(date => {
      console.log(`   ${date}: ${matchesByDate[date].length} matches`);
    });
    console.log('');

    // Get league info
    const leagueIds = [...new Set(matches.map(m => m.leagueId))];
    const leagues = await League.find({ leagueId: { $in: leagueIds } }).lean();
    const leagueMap = new Map(leagues.map(l => [l.leagueId, l]));

    // Show sample matches
    console.log('📋 Sample matches (first 10):');
    matches.slice(0, 10).forEach((match, idx) => {
      const league = leagueMap.get(match.leagueId);
      const leagueName = league ? league.name : `League ${match.leagueId}`;
      const date = new Date(match.date).toISOString();
      console.log(`   ${idx + 1}. ${date} | ${leagueName} | Status: ${match.status?.short || 'N/A'}`);
    });

    if (matches.length > 10) {
      console.log(`   ... and ${matches.length - 10} more matches\n`);
    }

    // Check status distribution
    const statusCounts = {};
    matches.forEach(match => {
      const status = match.status?.short || 'UNKNOWN';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    console.log('\n📊 Status distribution:');
    Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });

    // Check if matches have predictions
    const MatchPrediction = (await import('../src/models/matchPredictionModel.js')).default;
    const matchIds = matches.map(m => m._id);
    const predictions = await MatchPrediction.find({ 
      match: { $in: matchIds } 
    }).select('match').lean();
    
    const matchesWithPredictions = new Set(predictions.map(p => p.match.toString()));
    const matchesWithoutPredictions = matches.filter(m => !matchesWithPredictions.has(m._id.toString()));

    console.log(`\n🔮 Prediction status:`);
    console.log(`   Matches with predictions: ${predictions.length}`);
    console.log(`   Matches without predictions: ${matchesWithoutPredictions.length}`);

    if (matchesWithoutPredictions.length > 0) {
      console.log(`\n⚠️ Matches without predictions (first 5):`);
      matchesWithoutPredictions.slice(0, 5).forEach(match => {
        const date = new Date(match.date).toISOString();
        console.log(`   - ${date} | Fixture ID: ${match.fixtureId}`);
      });
    }

    console.log('\n✅ Check completed!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking matches:', error);
    process.exit(1);
  }
};

checkNextTwoDaysMatches();

