import 'dotenv/config';
import connectDB from '../src/config/database.js';
import Match from '../src/models/matchModel.js';

const run = async () => {
  await connectDB();
  
  const leagues = await Match.aggregate([
    { $group: { _id: '$leagueId', count: { $sum: 1 }, name: { $first: '$leagueName' } } },
    { $sort: { count: -1 } }
  ]);
  
  console.log('Leagues in database:');
  leagues.forEach(l => console.log(`League ${l._id} (${l.name}): ${l.count} matches`));
  
  process.exit(0);
};

run().catch(e => {
  console.error(e);
  process.exit(1);
});















