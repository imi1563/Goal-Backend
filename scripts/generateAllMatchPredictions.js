import 'dotenv/config';
import connectDB from '../src/config/database.js';
import { generateMatchPredictionsForUpcomingMatches } from '../src/cron/matchPredictionGenerator.js';
import Match from '../src/models/matchModel.js';
import MatchPrediction from '../src/models/matchPredictionModel.js';

// This script generates predictions for ALL matches in the database that do not
// already have a prediction, regardless of date or status. It respects the
// current logic: predictions are only created when real third-party team stats
// exist; no fallbacks are used.

try {
  await connectDB();

  const totalMatches = await Match.countDocuments();
  const before = await MatchPrediction.countDocuments();

  const results = await generateMatchPredictionsForUpcomingMatches();

  const after = await MatchPrediction.countDocuments();
  const created = after - before;

  console.log(JSON.stringify({
    scope: 'all_matches_in_db_without_predictions',
    totalMatches,
    createdPredictions: created,
    totalPredictions: after,
    createdThisRun: results?.length || 0
  }, null, 2));

  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}










