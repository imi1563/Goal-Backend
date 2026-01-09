import 'dotenv/config';
import connectDB from '../src/config/database.js';
import { generateMatchPredictionsForNext24Hours, generateMatchPredictionsForUpcomingMatches, generateMatchPredictionsForAllUpcoming } from '../src/cron/matchPredictionGenerator.js';
import Match from '../src/models/matchModel.js';
import MatchPrediction from '../src/models/matchPredictionModel.js';

// Usage:
//   node scripts/runPredictions.js 24h
//   node scripts/runPredictions.js 48h
//   node scripts/runPredictions.js all

try {
  await connectDB();
  const mode = (process.argv[2] || '24h').toLowerCase();
  let run;
  if (mode === '24h') run = generateMatchPredictionsForNext24Hours;
  else if (mode === '48h') run = generateMatchPredictionsForUpcomingMatches;
  else if (mode === 'all') run = generateMatchPredictionsForAllUpcoming;
  else throw new Error('Invalid mode. Use 24h | 48h | all');

  const before = await MatchPrediction.countDocuments();
  const upcoming = await Match.countDocuments({ 'status.short': { $in: ['NS', 'TBD', 'PST'] } });
  await run();
  const after = await MatchPrediction.countDocuments();
  console.log(JSON.stringify({ mode, upcomingMatches: upcoming, newPredictions: after - before, totalPredictions: after }, null, 2));
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}


