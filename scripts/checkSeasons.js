import 'dotenv/config';
import connectDB from '../src/config/database.js';
import Match from '../src/models/matchModel.js';

const run = async () => {
  await connectDB();
  
  const results = await Match.aggregate([
    { $group: { _id: { leagueId: '$leagueId', season: '$season' }, count: { $sum: 1 }, name: { $first: '$leagueName' } } },
    { $sort: { count: -1 } }
  ]);
  
  console.log('Leagues and seasons in database:');
  results.forEach(r => console.log(`League ${r._id.leagueId} Season ${r._id.season} (${r.name}): ${r.count} matches`));
  
  process.exit(0);
};

run().catch(e => {
  console.error(e);
  process.exit(1);
});















