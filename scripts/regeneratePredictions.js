import 'dotenv/config';
import connectDB from '../src/config/database.js';
import MatchPrediction from '../src/models/matchPredictionModel.js';
import { generateMatchPredictionsForUpcomingMatches } from '../src/cron/matchPredictionGenerator.js';

const regeneratePredictions = async () => {
  try {
    await connectDB();
    console.log('🗑️ Clearing old predictions with modelVersion 1.0.0...');
    
    // Delete all predictions with old model version
    const deleteResult = await MatchPrediction.deleteMany({ 
      modelVersion: { $ne: '2.0.0' } 
    });
    
    console.log(`✅ Deleted ${deleteResult.deletedCount} old predictions`);
    
    console.log('🔄 Regenerating predictions with new algorithm...');
    await generateMatchPredictionsForUpcomingMatches();
    
    console.log('✅ Predictions regenerated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error regenerating predictions:', error);
    process.exit(1);
  }
};

regeneratePredictions();
















