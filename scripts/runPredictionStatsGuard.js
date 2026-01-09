import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { initializePredictionStatsIfMissing } from '../src/cron/predictionStatsGuard.js';

dotenv.config();

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/football-backend';
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB Connected\n');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

const main = async () => {
  try {
    await connectDB();
    console.log('🛡️ Running Prediction Stats Guard...\n');
    await initializePredictionStatsIfMissing();
    console.log('\n✅ Prediction Stats Guard completed!');
  } catch (error) {
    console.error('💥 Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');
    process.exit(0);
  }
};

main();

