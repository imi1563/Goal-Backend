import 'dotenv/config';
import connectDB from '../src/config/database.js';
import Match from '../src/models/matchModel.js';
import MatchPrediction from '../src/models/matchPredictionModel.js';
import { getOrGenerateMatchPrediction } from '../src/services/matchPredictionService.js';

try {
  await connectDB();

  const LIVE = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'];
  const now = Date.now();

  const matches = await Match.find({
    $or: [
      { 'status.short': { $in: LIVE } },
      {
        'status.short': { $nin: ['FT', 'AET', 'PEN'] },
        date: { $gte: new Date(now - 60 * 60 * 1000), $lte: new Date(now + 2 * 60 * 60 * 1000) }
      }
    ]
  }).select('_id');

  let created = 0;
  let skipped = 0;

  for (const m of matches) {
    const exists = await MatchPrediction.findOne({ match: m._id });
    if (exists) {
      skipped++;
      continue;
    }
    const pred = await getOrGenerateMatchPrediction(m._id);
    if (pred) created++;
  }

  console.log(JSON.stringify({ processed: matches.length, created, skipped }, null, 2));
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}


