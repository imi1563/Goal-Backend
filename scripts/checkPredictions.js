/**
 * Check if predictions in database meet client expectations
 */

import dotenv from 'dotenv';
import connectDB from '../src/config/database.js';

dotenv.config();

const checkPredictions = async () => {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB');
    
    const MatchPrediction = (await import('../src/models/matchPredictionModel.js')).default;
    const Match = (await import('../src/models/matchModel.js')).default;
    
    // Get recent predictions
    const predictions = await MatchPrediction.find({})
      .populate('match')
      .sort({ createdAt: -1 })
      .limit(10);
    
    console.log('\n📊 RECENT PREDICTIONS ANALYSIS:');
    console.log('=====================================');
    
    if (predictions.length === 0) {
      console.log('❌ No predictions found in database');
      return;
    }
    
    console.log(`📈 Found ${predictions.length} recent predictions\n`);
    
    // Analyze prediction quality
    let validPredictions = 0;
    let placeholderPredictions = 0;
    let totalGoals = 0;
    let totalOver25 = 0;
    let totalBTTS = 0;
    let unrealisticPredictions = 0;
    
    predictions.forEach((pred, index) => {
      console.log(`\n${index + 1}. ${pred.match?.homeTeam?.name || 'Unknown'} vs ${pred.match?.awayTeam?.name || 'Unknown'}`);
      console.log(`   📅 Date: ${pred.match?.date ? new Date(pred.match.date).toLocaleDateString() : 'Unknown'}`);
      console.log(`   🏆 League: ${pred.match?.leagueId || 'Unknown'}`);
      
      if (pred.isPlaceholder) {
        console.log(`   📝 PLACEHOLDER: ${pred.placeholderReason}`);
        placeholderPredictions++;
      } else {
        console.log(`   🎯 Home Win: ${pred.outcomes?.homeWin || 0}%`);
        console.log(`   🤝 Draw: ${pred.outcomes?.draw || 0}%`);
        console.log(`   🎯 Away Win: ${pred.outcomes?.awayWin || 0}%`);
        console.log(`   ⚽ Over 2.5: ${pred.outcomes?.over25 || 0}%`);
        console.log(`   🔥 BTTS: ${pred.outcomes?.btts || 0}%`);
        
        // Check if predictions are realistic
        const homeWin = pred.outcomes?.homeWin || 0;
        const draw = pred.outcomes?.draw || 0;
        const awayWin = pred.outcomes?.awayWin || 0;
        const over25 = pred.outcomes?.over25 || 0;
        const btts = pred.outcomes?.btts || 0;
        
        const total = homeWin + draw + awayWin;
        
        if (total > 95 && total < 105) { // Should be ~100%
          validPredictions++;
        } else {
          unrealisticPredictions++;
        }
        
        if (over25 > 0) totalOver25++;
        if (btts > 0) totalBTTS++;
        
        // Check for algorithm improvements
        console.log(`   🔧 xG: Home ${pred.dixonColesParams?.lambda1 || 0}, Away ${pred.dixonColesParams?.lambda2 || 0}`);
        console.log(`   📊 Total Probability: ${total.toFixed(1)}%`);
        
        // Flag unrealistic predictions
        if (total < 90 || total > 110) {
          console.log(`   ⚠️ WARNING: Total probability ${total.toFixed(1)}% is unrealistic`);
        }
        if (over25 < 20 || over25 > 80) {
          console.log(`   ⚠️ WARNING: Over 2.5 ${over25}% seems extreme`);
        }
        if (btts < 20 || btts > 80) {
          console.log(`   ⚠️ WARNING: BTTS ${btts}% seems extreme`);
        }
      }
    });
    
    console.log('\n\n📊 SUMMARY:');
    console.log('============');
    console.log(`✅ Valid Predictions: ${validPredictions}/${predictions.length}`);
    console.log(`📝 Placeholder Predictions: ${placeholderPredictions}/${predictions.length}`);
    console.log(`⚠️ Unrealistic Predictions: ${unrealisticPredictions}/${predictions.length}`);
    console.log(`⚽ Matches with Over 2.5 predictions: ${totalOver25}/${validPredictions}`);
    console.log(`🔥 Matches with BTTS predictions: ${totalBTTS}/${validPredictions}`);
    
    // Check algorithm parameters
    const samplePred = predictions.find(p => !p.isPlaceholder);
    if (samplePred) {
      console.log('\n🔧 ALGORITHM PARAMETERS:');
      console.log(`   LAMBDA3: ${samplePred.dixonColesParams?.lambda3 || 'N/A'}`);
      console.log(`   RHO: ${samplePred.dixonColesParams?.rho || 'N/A'}`);
      console.log(`   Model Version: ${samplePred.dixonColesParams?.modelVersion || 'N/A'}`);
    }
    
    // Check if algorithm fixes are working
    console.log('\n🎯 CLIENT EXPECTATIONS CHECK:');
    console.log('============================');
    
    if (samplePred) {
      const lambda1 = samplePred.dixonColesParams?.lambda1 || 0;
      const lambda2 = samplePred.dixonColesParams?.lambda2 || 0;
      const lambda3 = samplePred.dixonColesParams?.lambda3 || 0;
      const rho = samplePred.dixonColesParams?.rho || 0;
      const over25 = samplePred.outcomes?.over25 || 0;
      const btts = samplePred.outcomes?.btts || 0;
      
      // Check algorithm fixes
      console.log(`✅ Form Factor: Should be 0.85-1.15 (neutral = 1.0)`);
      console.log(`✅ Home Advantage: Should be 1.10/0.95 (was 1.18/0.85)`);
      console.log(`✅ LAMBDA3: ${lambda3} (should be 0.08, was 0.18)`);
      console.log(`✅ RHO: ${rho} (should be 0.03, was 0.08)`);
      console.log(`✅ minXG: Should be 0.5 (was 0.3)`);
      
      // Check expected results
      console.log(`\n📈 EXPECTED RESULTS:`);
      console.log(`   Over 2.5 Goals: ${over25}% (should be 45-55%, was ~30%)`);
      console.log(`   BTTS: ${btts}% (should be 45-55%, was ~25%)`);
      console.log(`   Average Goals: ${((lambda1 + lambda2) / 2).toFixed(1)} (should be 2.4-2.8)`);
      
      // Flag if not meeting expectations
      if (over25 < 40 || over25 > 60) {
        console.log(`   ⚠️ Over 2.5 ${over25}% not in expected range (45-55%)`);
      }
      if (btts < 40 || btts > 60) {
        console.log(`   ⚠️ BTTS ${btts}% not in expected range (45-55%)`);
      }
      if (lambda1 < 0.5 || lambda2 < 0.5) {
        console.log(`   ⚠️ xG values too low (${lambda1}, ${lambda2}) - should be > 0.5`);
      }
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('💥 Error checking predictions:', error);
    process.exit(1);
  }
};

checkPredictions();


