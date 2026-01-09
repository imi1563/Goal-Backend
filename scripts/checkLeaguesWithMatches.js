import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const checkLeaguesWithMatches = async () => {
  await connectDB();
  
  const Match = (await import('../src/models/matchModel.js')).default;
  const League = (await import('../src/models/leaugeModel.js')).default;
  
  console.log('\n📊 LEAGUES WITH MATCHES IN DATABASE:\n');
  
  // Get match counts by league
  const matchCounts = await Match.aggregate([
    {
      $group: {
        _id: '$leagueId',
        matchCount: { $sum: 1 },
        seasons: { $addToSet: '$season' }
      }
    },
    { $sort: { matchCount: -1 } }
  ]);
  
  // Get league details
  const leagueIds = matchCounts.map(item => item._id);
  const leagues = await League.find({ leagueId: { $in: leagueIds } }).select('leagueId name country type season isActive');
  
  // Create lookup map
  const leagueMap = {};
  leagues.forEach(league => {
    leagueMap[league.leagueId] = league;
  });
  
  console.log('League ID | Object ID | Name | Country | Type | Season | Active | Matches | Seasons');
  console.log('----------|-----------|------|---------|------|--------|--------|---------|--------');
  
  let totalMatches = 0;
  for (const item of matchCounts) {
    const league = leagueMap[item._id];
    const objectId = league ? league._id.toString() : 'N/A';
    const name = league ? league.name.substring(0, 20) : 'Unknown';
    const country = league ? league.country : 'N/A';
    const type = league ? league.type : 'N/A';
    const season = league ? league.season : 'N/A';
    const active = league ? (league.isActive ? 'Yes' : 'No') : 'N/A';
    const seasons = item.seasons.join(', ');
    
    console.log(`${item._id.toString().padEnd(9)} | ${objectId.padEnd(24)} | ${name.padEnd(20)} | ${country.padEnd(7)} | ${type.padEnd(4)} | ${season.toString().padEnd(6)} | ${active.padEnd(6)} | ${item.matchCount.toString().padEnd(7)} | ${seasons}`);
    
    totalMatches += item.matchCount;
  }
  
  console.log('\n📈 SUMMARY:');
  console.log(`Total Leagues with Matches: ${matchCounts.length}`);
  console.log(`Total Matches: ${totalMatches}`);
  console.log(`Active Leagues: ${leagues.filter(l => l.isActive).length}`);
  console.log(`Inactive Leagues: ${leagues.filter(l => !l.isActive).length}`);
  
  process.exit(0);
};

checkLeaguesWithMatches().catch(console.error);
