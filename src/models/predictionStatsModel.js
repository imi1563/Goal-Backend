import mongoose from 'mongoose';

const PredictionStatsSchema = new mongoose.Schema({
  _id: { type: String, default: 'global' },
  simulatedTotal: { type: Number, default: 0 },
  wonTotal: { type: Number, default: 0 },
  perFieldSimulated: { type: Map, of: Number, default: {} },
  perFieldWon: { type: Map, of: Number, default: {} },
  fieldsConsidered: { type: [String], default: [] }
}, { timestamps: true });

PredictionStatsSchema.statics.ensure = async function(defaultFields = []) {
  return this.findOneAndUpdate(
    { _id: 'global' },
    { $setOnInsert: { fieldsConsidered: defaultFields } },
    { new: true, upsert: true }
  );
};

PredictionStatsSchema.statics.incrementSimulated = async function(fieldNames) {
  const inc = { simulatedTotal: fieldNames.length };
  for (const f of fieldNames) {
    inc[`perFieldSimulated.${f}`] = 1;
  }
  await this.updateOne(
    { _id: 'global' },
    { $inc: inc, $setOnInsert: { fieldsConsidered: fieldNames } },
    { upsert: true }
  );
};

PredictionStatsSchema.statics.incrementWins = async function(fieldNames) {
  const inc = {};
  if (Array.isArray(fieldNames) && fieldNames.length > 0) {
    inc.wonTotal = 1;
  }
  for (const f of fieldNames || []) {
    inc[`perFieldWon.${f}`] = 1;
  }
  if (Object.keys(inc).length === 0) return; 
  await this.updateOne(
    { _id: 'global' },
    { $inc: inc, $setOnInsert: { fieldsConsidered: fieldNames || [] } },
    { upsert: true }
  );
};

const PredictionStats = mongoose.model('PredictionStats', PredictionStatsSchema);

export default PredictionStats;


