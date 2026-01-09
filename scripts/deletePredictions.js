/**
 * Delete all predictions to test new placeholder logic
 */

import dotenv from 'dotenv';
import connectDB from '../src/config/database.js';

dotenv.config();

const deletePredictions = async () => {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB');
    
    const MatchPrediction = (await import('../src/models/matchPredictionModel.js')).default;
    
    const result = await MatchPrediction.deleteMany({});
    console.log(`🗑️ Deleted ${result.deletedCount} predictions`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('💥 Error deleting predictions:', error);
    process.exit(1);
  }
};

deletePredictions();


