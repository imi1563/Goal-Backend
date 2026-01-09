import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { 
  cleanupFinishedMatches, 
  previewFinishedMatchesCleanup 
} from '../src/cron/finishedMatchCleanup.js';

dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/goal-backend');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    
    const command = process.argv[2];
    
    if (command === 'preview') {
      console.log('👀 Running preview mode...');
      await previewFinishedMatchesCleanup();
    } else if (command === 'cleanup') {
      console.log('🧹 Running cleanup mode...');
      await cleanupFinishedMatches();
    } else {
      console.log('Usage:');
      console.log('  node scripts/cleanupFinishedMatches.js preview  - Preview matches that would be deleted');
      console.log('  node scripts/cleanupFinishedMatches.js cleanup  - Actually delete old matches');
      console.log('');
      console.log('⚠️  WARNING: The cleanup command will permanently delete old matches older than 1 day!');
      process.exit(1);
    }
    
    console.log('\n🎉 Script completed successfully!');
  } catch (error) {
    console.error('💥 Script failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
};

// Run the script
main();
