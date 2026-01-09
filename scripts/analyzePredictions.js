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

const analyzePredictions = async () => {
  await connectDB();
  
  const MatchPrediction = (await import('../src/models/matchPredictionModel.js')).default;
  const Match = (await import('../src/models/matchModel.js')).default;
  
  console.log('\n📊 PREDICTIONS ANALYSIS (Client Requirements Check):\n');
  
  // Get recent predictions (last 20)
  const recentPredictions = await MatchPrediction.find({})
    .populate('match')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  
  console.log('Match | Home xG | Away xG | Home Win | Draw | Away Win | Over 2.5 | BTTS Yes | Total xG | Status');
  console.log('------|---------|---------|----------|------|----------|----------|----------|----------|--------');
  
  let totalXG = 0;
  let over25Count = 0;
  let bttsCount = 0;
  let predictionCount = 0;
  let placeholderCount = 0;
  
  for (const pred of recentPredictions) {
    if (pred.isPlaceholder) {
      console.log(`${(pred.match?.homeTeam?.name || 'Unknown').substring(0, 15)} vs ${(pred.match?.awayTeam?.name || 'Unknown').substring(0, 15)} | PLACEHOLDER | ${pred.placeholderReason || 'Unknown'}`);
      placeholderCount++;
      continue;
    }
    
    const homeXG = pred.dixonColesParams?.lambda1 || 0;
    const awayXG = pred.dixonColesParams?.lambda2 || 0;
    const lambda3 = pred.dixonColesParams?.lambda3 || 0;
    const totalMatchXG = homeXG + awayXG + (lambda3 * 2);
    
    const homeWin = pred.outcomes?.homeWin || 0;
    const draw = pred.outcomes?.draw || 0;
    const awayWin = pred.outcomes?.awayWin || 0;
    const over25 = pred.outcomes?.over25 || 0;
    const btts = pred.outcomes?.btts || 0;
    
    // Convert percentages to decimal for analysis (database stores 0-100, we need 0-1)
    const over25Decimal = over25 / 100;
    const bttsDecimal = btts / 100;
    
    // Check if meets client requirements (45-55% range)
    const meetsOver25 = over25 >= 45 && over25 <= 55;
    const meetsBTTS = btts >= 45 && btts <= 55;
    const meetsXG = totalMatchXG >= 2.4 && totalMatchXG <= 2.8;
    
    let status = '❌';
    if (meetsOver25 && meetsBTTS && meetsXG) {
      status = '✅';
    } else if (meetsOver25 || meetsBTTS || meetsXG) {
      status = '⚠️';
    }
    
    console.log(`${(pred.match?.homeTeam?.name || 'Unknown').substring(0, 15)} vs ${(pred.match?.awayTeam?.name || 'Unknown').substring(0, 15)} | ${homeXG.toFixed(2)} | ${awayXG.toFixed(2)} | ${homeWin.toFixed(1)}% | ${draw.toFixed(1)}% | ${awayWin.toFixed(1)}% | ${over25.toFixed(1)}% | ${btts.toFixed(1)}% | ${totalMatchXG.toFixed(2)} | ${status}`);
    
    totalXG += totalMatchXG;
    if (over25 > 40) over25Count++; // Check if > 40% (database stores 0-100)
    if (btts > 40) bttsCount++; // Check if > 40% (database stores 0-100)
    predictionCount++;
  }
  
  if (predictionCount > 0) {
    const avgXG = totalXG / predictionCount;
    const over25Rate = (over25Count / predictionCount) * 100;
    const bttsRate = (bttsCount / predictionCount) * 100;
    
    console.log('\n📈 SUMMARY:');
    console.log(`Total predictions analyzed: ${predictionCount}`);
    console.log(`Placeholder predictions: ${placeholderCount}`);
    console.log(`Average Total xG per match: ${avgXG.toFixed(2)}`);
    console.log(`Matches with Over 2.5 > 40%: ${over25Rate.toFixed(1)}%`);
    console.log(`Matches with BTTS > 40%: ${bttsRate.toFixed(1)}%`);
    
    console.log('\n🎯 CLIENT REQUIREMENTS:');
    console.log('✅ Average goals per match: 2.4-2.8 (Current: ' + (avgXG >= 2.4 && avgXG <= 2.8 ? '✅' : '❌') + ` ${avgXG.toFixed(2)})`);
    console.log('✅ Over 2.5 Goals: 45-55% (Current: ' + (over25Rate >= 45 && over25Rate <= 55 ? '✅' : '❌') + ` ${over25Rate.toFixed(1)}%)`);
    console.log('✅ BTTS = Yes: 45-55% (Current: ' + (bttsRate >= 45 && bttsRate <= 55 ? '✅' : '❌') + ` ${bttsRate.toFixed(1)}%)`);
    
    // Check algorithm parameters
    console.log('\n🔧 ALGORITHM PARAMETERS CHECK:');
    const samplePred = recentPredictions.find(p => !p.isPlaceholder);
    if (samplePred && samplePred.dixonColesParams) {
      console.log(`LAMBDA3: ${samplePred.dixonColesParams.lambda3} (Expected: 0.08) ${samplePred.dixonColesParams.lambda3 === 0.08 ? '✅' : '❌'}`);
      console.log(`RHO: ${samplePred.dixonColesParams.rho} (Expected: 0.03) ${samplePred.dixonColesParams.rho === 0.03 ? '✅' : '❌'}`);
      console.log(`Model Version: ${samplePred.dixonColesParams.modelVersion || 'N/A'}`);
    }
  }
  
  process.exit(0);
};

analyzePredictions().catch(console.error);
