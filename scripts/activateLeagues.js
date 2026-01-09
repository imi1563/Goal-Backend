import mongoose from 'mongoose';
import League from '../src/models/leaugeModel.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/football-backend';
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

// Leagues to activate based on the matches shown
const leaguesToActivate = [
  // International Friendlies
  { name: 'International Friendlies', country: 'International' },
  
  // FIFA World Cup Qualifying - UEFA
  { name: 'FIFA World Cup Qualifying - UEFA', country: 'Europe' },
  
  // FIFA World Cup Qualifying - Concacaf
  { name: 'FIFA World Cup Qualifying - Concacaf', country: 'North America' },
  
  // FIFA World Cup Qualifying - CAF
  { name: 'FIFA World Cup Qualifying - CAF', country: 'Africa' },
  
  // NWSL
  { name: 'NWSL', country: 'United States' },
  
  // English Women's Super League
  { name: 'FA WSL', country: 'England' },
  
  // Spanish Liga F
  { name: 'Liga F', country: 'Spain' },
  
  // USL Championship
  { name: 'USL Championship', country: 'United States' },
  
  // Mexican Liga de Expansión MX
  { name: 'Liga de Expansión MX', country: 'Mexico' },
  
  // Spanish LALIGA 2
  { name: 'LALIGA 2', country: 'Spain' },
  
  // UEFA European Under-21 Championship Qualifying
  { name: 'UEFA European Under-21 Championship Qualifying', country: 'Europe' },
  
  // Under-21 International Friendly
  { name: 'Under-21 International Friendly', country: 'International' },
  
  // Scottish League Challenge Cup
  { name: 'Scottish League Challenge Cup', country: 'Scotland' },
  
  // Dutch Keuken Kampioen Divisie
  { name: 'Keuken Kampioen Divisie', country: 'Netherlands' },
  
  // Copa Argentina
  { name: 'Copa Argentina', country: 'Argentina' },
  
  // Argentine Nacional B
  { name: 'Nacional B', country: 'Argentina' },
  
  // Argentine Primera B
  { name: 'Primera B', country: 'Argentina' },
  
  // Argentine Primera C
  { name: 'Primera C', country: 'Argentina' },
  
  // Brazilian Serie B
  { name: 'Serie B', country: 'Brazil' },
  
  // Major European Leagues
  { name: 'Premier League', country: 'England' },
  { name: 'La Liga', country: 'Spain' },
  { name: 'Bundesliga', country: 'Germany' },
  { name: 'Serie A', country: 'Italy' },
  { name: 'Ligue 1', country: 'France' },
  { name: 'Championship', country: 'England' },
  { name: 'Champions League', country: 'Europe' },
  { name: 'Europa League', country: 'Europe' },
  { name: 'Conference League', country: 'Europe' }
];

// Activate leagues
const activateLeagues = async () => {
  try {
    console.log('🚀 Starting league activation...');
    
    let activatedCount = 0;
    let notFoundCount = 0;
    
    for (const leagueInfo of leaguesToActivate) {
      try {
        // Try to find league by name (case insensitive)
        const league = await League.findOne({
          name: { $regex: new RegExp(leagueInfo.name, 'i') }
        });
        
        if (league) {
          if (!league.isActive) {
            await League.findByIdAndUpdate(league._id, { isActive: true });
            console.log(`✅ Activated: ${league.name} (${league.country})`);
            activatedCount++;
          } else {
            console.log(`ℹ️ Already active: ${league.name} (${league.country})`);
          }
        } else {
          console.log(`❌ Not found: ${leagueInfo.name} (${leagueInfo.country})`);
          notFoundCount++;
        }
      } catch (error) {
        console.error(`❌ Error processing ${leagueInfo.name}:`, error.message);
      }
    }
    
    // Get final counts
    const totalActive = await League.countDocuments({ isActive: true });
    const totalInactive = await League.countDocuments({ isActive: false });
    
    console.log('\n🎉 League activation completed!');
    console.log(`✅ Activated: ${activatedCount} leagues`);
    console.log(`❌ Not found: ${notFoundCount} leagues`);
    console.log(`📊 Total active leagues: ${totalActive}`);
    console.log(`📊 Total inactive leagues: ${totalInactive}`);
    
  } catch (error) {
    console.error('💥 League activation failed:', error.message);
  }
};

// Main function
const main = async () => {
  try {
    await connectDB();
    await activateLeagues();
  } catch (error) {
    console.error('💥 Script failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected');
    process.exit(0);
  }
};

main();
