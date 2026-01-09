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

const checkRecentPredictions = async () => {
  await connectDB();
  
  const MatchPrediction = (await import('../src/models/matchPredictionModel.js')).default;
  
  console.log('\n📊 CHECKING RECENT PREDICTIONS IN DATABASE:\n');
  
  // Get recent predictions (last 10)
  const recentPredictions = await MatchPrediction.find({})
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  
  console.log('Recent Predictions:');
  console.log('ID | Created At | Is Placeholder | Reason | Home xG | Away xG');
  console.log('---|------------|----------------|--------|---------|--------');
  
  for (const pred of recentPredictions) {
    const createdAt = pred.createdAt ? pred.createdAt.toISOString().substring(0, 19) : 'N/A';
    const isPlaceholder = pred.isPlaceholder ? 'Yes' : 'No';
    const reason = pred.placeholderReason || 'N/A';
    const homeXG = pred.dixonColesParams?.lambda1?.toFixed(2) || 'N/A';
    const awayXG = pred.dixonColesParams?.lambda2?.toFixed(2) || 'N/A';
    
    console.log(`${pred._id.toString().substring(0, 8)}... | ${createdAt} | ${isPlaceholder} | ${reason} | ${homeXG} | ${awayXG}`);
  }
  
  // Count total predictions
  const totalPredictions = await MatchPrediction.countDocuments({});
  const placeholderPredictions = await MatchPrediction.countDocuments({ isPlaceholder: true });
  const realPredictions = totalPredictions - placeholderPredictions;
  
  console.log('\n📈 SUMMARY:');
  console.log(`Total predictions in database: ${totalPredictions}`);
  console.log(`Real predictions: ${realPredictions}`);
  console.log(`Placeholder predictions: ${placeholderPredictions}`);
  
  process.exit(0);
};

checkRecentPredictions().catch(console.error);
