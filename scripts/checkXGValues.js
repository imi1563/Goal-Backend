import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const checkXGValues = async () => {
  await connectDB();
  
  const MatchPrediction = (await import('../src/models/matchPredictionModel.js')).default;
  
  console.log('\n🔍 CHECKING xG VALUES IN PREDICTIONS:\n');
  
  // Get recent predictions
  const recentPredictions = await MatchPrediction.find({ isPlaceholder: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(3)
    .lean();
  
  for (const pred of recentPredictions) {
    console.log('Prediction ID:', pred._id);
    console.log('Lambda1 (Home xG):', pred.dixonColesParams?.lambda1);
    console.log('Lambda2 (Away xG):', pred.dixonColesParams?.lambda2);
    console.log('Lambda3:', pred.dixonColesParams?.lambda3);
    console.log('RHO:', pred.dixonColesParams?.rho);
    console.log('Model Version:', pred.dixonColesParams?.modelVersion);
    console.log('---');
  }
  
  process.exit(0);
};

checkXGValues().catch(console.error);
