import Match from '../models/matchModel.js';
import MatchPrediction from '../models/matchPredictionModel.js';
import PredictionStats from '../models/predictionStatsModel.js';
import Team from '../models/teamModel.js';
import mongoose from 'mongoose';
import { promisify } from 'util';
import { performance } from 'perf_hooks';

import { getTeamStatsForPrediction, getLeagueAverages, getTeamStatsWithFallback } from './teamStatsService.js';
import { getCurrentFootballSeason } from '../utils/seasonUtils.js';

let redis = null;
let redisClient = null;

(async () => {
  try {
    redis = await import('redis');
    
    if (process.env.REDIS_ENABLED !== 'false') {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      redisClient = redis.createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 5) return new Error('Max retries reached');
            return Math.min(retries * 100, 5000);
          }
        }
      });

      redisClient.getAsync = promisify(redisClient.get).bind(redisClient);
      redisClient.setExAsync = promisify(redisClient.setEx).bind(redisClient);
      redisClient.delAsync = promisify(redisClient.del).bind(redisClient);

      await redisClient.connect();
      console.log('Redis connected successfully for match predictions');
    }
  } catch (error) {
    console.warn('Redis not available for match predictions, running without cache');
    redisClient = null;
  }
})();

const CONFIG = {
  SIMULATIONS: parseInt(process.env.MATCH_PREDICTION_SIMULATIONS) || 100000,
  K_FACTOR: parseFloat(process.env.K_FACTOR) || 0.15,
  CACHE_TTL: parseInt(process.env.MATCH_PREDICTION_CACHE_TTL) || 3600,
  MODEL_VERSION: '2.0.0',
  MAX_GOALS: 10,
  USE_REDIS: process.env.REDIS_ENABLED !== 'false' && redisClient !== null,
  LAMBDA3: parseFloat(process.env.LAMBDA3) || 0.08,
  DIXON_COLES_RHO: parseFloat(process.env.DIXON_COLES_RHO) || 0.03,
  DIXON_COLES_TAU: parseFloat(process.env.DIXON_COLES_TAU) || 2.5
};

const FIELDS_CONSIDERED = ['doubleChance1X','doubleChanceX2','btts','over25','under25','corners'];

const calculateDixonColesXG = (teamStats, oppStats, leagueAverages, isHome = true) => {
  const homeAdvantage = isHome ? 1.10 : 0.95;
  
  let teamXGFor = teamStats.xG || teamStats.goalsForAvg || 0;
  let oppXGAgainst = oppStats.xGA || oppStats.goalsAgainstAvg || 0;
  
  const weightedXG = (teamXGFor * 0.7) + (oppXGAgainst * 0.3);
  const adjustedXG = weightedXG * homeAdvantage;
  
  const formFactor = calculateFormFactor(teamStats.form || '');
  const formAdjustedXG = adjustedXG * formFactor;
  
  const minXG = 0.5;
  const finalXG = Math.max(formAdjustedXG, minXG);
  
  return Math.min(finalXG, 4);
};

const createPlaceholderPrediction = async (match, reason) => {
  try {
    console.log(`📝 Creating placeholder prediction for ${match.homeTeam.name} vs ${match.awayTeam.name} (Reason: ${reason})`);
    
    const MatchPrediction = (await import('../models/matchPredictionModel.js')).default;
    
    const placeholderPrediction = new MatchPrediction({
      match: match._id,
      
      outcomes: {
        homeWin: null,
        draw: null,
        awayWin: null,
        doubleChance1X: null,
        doubleChanceX2: null,
        btts: null,
        over25: null,
        under25: null,
        over05: null,
        over15: null,
        over35: null,
        over45: null,
        over55: null,
        over65: null,
        over75: null,
        over85: null,
        over95: null,
        mostLikelyScore: {
          home: null,
          away: null,
          probability: null
        },
        cleanSheetHome: null,
        cleanSheetAway: null,
        exactScore: null
      },
      
      dixonColesParams: {
        lambda1: null,
        lambda2: null,
        lambda3: null,
        rho: null,
        modelVersion: null
      },
      
      modelPrediction: {
        homeScore: null,
        awayScore: null,
        confidence: null
      },
      
      homeStats: null,
      awayStats: null,
      
      leagueAverages: {
        avgGoalsPerMatch: null,
        avgHomeGoals: null,
        avgAwayGoals: null,
        bttsPercentage: null
      },
      
      manualCorners: {
        overCorners: null,
        underCorners: null,
        cornerPrediction: null,
        cornerThreshold: null
      },
      
      showFlags: {
        homeWinShow: false,
        drawShow: false,
        awayWinShow: false,
        over05Show: false,
        over15Show: false,
        over25Show: false,
        over35Show: false,
        over45Show: false,
        over55Show: false,
        over65Show: false,
        over75Show: false,
        over85Show: false,
        over95Show: false,
        bttsShow: false,
        bttsYesShow: false,
        bttsNoShow: false,
        doubleChance1XShow: false,
        doubleChance12Show: false,
        doubleChanceX2Show: false,
        overCornersShow: false,
        underCornersShow: false,
        cornerThresholdShow: false,
        cornerPredictionShow: false
      },
      
      isPlaceholder: true,
      placeholderReason: reason,
      status: 'pending',
      isProcessed: false,
      modelVersion: '2.0.0',
      confidenceThreshold: 70
    });
    
    await placeholderPrediction.save();
    console.log(`✅ Created placeholder prediction for ${match.homeTeam.name} vs ${match.awayTeam.name}`);
    
    return placeholderPrediction;
    
  } catch (error) {
    console.error(`💥 Error creating placeholder prediction:`, error.message);
    return null;
  }
};

const calculateFormFactor = (form) => {
  if (!form || form.length === 0) return 1.0;
  
  let wins = 0, draws = 0, losses = 0;
  for (const r of form) {
    if (r === 'W') wins++;
    else if (r === 'D') draws++;
    else if (r === 'L') losses++;
  }
  
  const total = wins + draws + losses;
  if (total === 0) return 1.0;
  
  const winRate = wins / total;
  const lossRate = losses / total;
  
  const factor = 1 + 0.35 * (winRate - lossRate);
  return Math.max(0.85, Math.min(1.15, factor));
};

const poissonRandom = (lambda) => {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  
  do {
    k++;
    p *= Math.random();
  } while (p > L && k < 10);
  
  return k - 1;
};

const generateBivariatePoisson = (lambda1, lambda2, lambda3 = CONFIG.LAMBDA3) => {
  const adjustedLambda1 = Math.max(lambda1 - lambda3, 0.1);
  const adjustedLambda2 = Math.max(lambda2 - lambda3, 0.1);
  
  const X = poissonRandom(adjustedLambda1);
  const Y = poissonRandom(adjustedLambda2);
  const Z = poissonRandom(lambda3);
  
  return {
    homeGoals: X + Z,
    awayGoals: Y + Z
  };
};

const applyDixonColesCorrection = (homeGoals, awayGoals, lambda1, lambda2, lambda3, rho = CONFIG.DIXON_COLES_RHO) => {
  const totalGoals = homeGoals + awayGoals;
  
  if (totalGoals <= 1) {
    const correctionFactor = Math.exp(-rho * Math.sqrt(lambda1 * lambda2));
    return correctionFactor;
  } else if (totalGoals === 2 && homeGoals === 1 && awayGoals === 1) {
    const correctionFactor = Math.exp(-rho * Math.sqrt(lambda1 * lambda2));
    return correctionFactor;
  }
  
  return 1.0;
};

const runDixonColesSimulation = (homeXG, awayXG, simulations = CONFIG.SIMULATIONS) => {
  let homeWins = 0, draws = 0, awayWins = 0;
  let over05 = 0, over15 = 0, over25 = 0, over35 = 0, over45 = 0, over55 = 0, over65 = 0, over75 = 0, over85 = 0, over95 = 0;
  let under25 = 0, btts = 0;
  const scoreMap = new Map();
  
  const lambda3 = CONFIG.LAMBDA3;
  const rho = CONFIG.DIXON_COLES_RHO;
  
  let totalWeight = 0;
  
  for (let i = 0; i < simulations; i++) {
    const { homeGoals, awayGoals } = generateBivariatePoisson(homeXG, awayXG, lambda3);
    
    const correctionFactor = applyDixonColesCorrection(homeGoals, awayGoals, homeXG, awayXG, lambda3, rho);
    
    const weight = correctionFactor;
    totalWeight += weight;
    
    if (homeGoals > awayGoals) homeWins += weight;
    else if (homeGoals < awayGoals) awayWins += weight;
    else draws += weight;
    
    const totalGoals = homeGoals + awayGoals;
    if (totalGoals > 0.5) over05 += weight;
    if (totalGoals > 1.5) over15 += weight;
    if (totalGoals > 2.5) over25 += weight;
    if (totalGoals > 3.5) over35 += weight;
    if (totalGoals > 4.5) over45 += weight;
    if (totalGoals > 5.5) over55 += weight;
    if (totalGoals > 6.5) over65 += weight;
    if (totalGoals > 7.5) over75 += weight;
    if (totalGoals > 8.5) over85 += weight;
    if (totalGoals > 9.5) over95 += weight;
    if (totalGoals < 2.5) under25 += weight;
    if (homeGoals > 0 && awayGoals > 0) btts += weight;
    
    const scoreKey = `${homeGoals}-${awayGoals}`;
    scoreMap.set(scoreKey, (scoreMap.get(scoreKey) || 0) + weight);
  }
  
  let mostLikelyScore = '0-0';
  let maxCount = 0;
  scoreMap.forEach((count, score) => {
    if (count > maxCount) {
      maxCount = count;
      mostLikelyScore = score;
    }
  });
  
  const [mlHome, mlAway] = mostLikelyScore.split('-').map(Number);
  
  return {
    homeWin: (homeWins / totalWeight) * 100,
    draw: (draws / totalWeight) * 100,
    awayWin: (awayWins / totalWeight) * 100,
    over05: (over05 / totalWeight) * 100,
    over15: (over15 / totalWeight) * 100,
    over25: (over25 / totalWeight) * 100,
    over35: (over35 / totalWeight) * 100,
    over45: (over45 / totalWeight) * 100,
    over55: (over55 / totalWeight) * 100,
    over65: (over65 / totalWeight) * 100,
    over75: (over75 / totalWeight) * 100,
    over85: (over85 / totalWeight) * 100,
    over95: (over95 / totalWeight) * 100,
    under25: (under25 / totalWeight) * 100,
    btts: (btts / totalWeight) * 100,
    mostLikelyScore: {
      home: mlHome,
      away: mlAway,
      probability: (maxCount / totalWeight) * 100
    },
    exactScore: mostLikelyScore,
    cleanSheetHome: ((totalWeight - awayWins - draws) / totalWeight) * 100,
    cleanSheetAway: ((totalWeight - homeWins - draws) / totalWeight) * 100
  };
};

export const getOrGenerateMatchPrediction = async (matchId) => {
  try {
    const startTime = performance.now();
    
    const cacheKey = `match_prediction:${matchId}`;
    if (redisClient) {
      try {
        const cached = await redisClient.getAsync(cacheKey);
        if (cached) {
          console.log(`📊 Retrieved match prediction from cache for match ${matchId}`);
          return JSON.parse(cached);
        }
      } catch (error) {
        console.error('Error reading match prediction from cache:', error);
      }
    }

    const match = await Match.findById(matchId);
    
    if (!match) {
      throw new Error('Match not found');
    }
    
    const Team = mongoose.model('Team');
    const homeTeam = await Team.findOne({ teamId: match.homeTeam });
    const awayTeam = await Team.findOne({ teamId: match.awayTeam });
    
    if (!homeTeam || !awayTeam) {
      console.log(`⚠️ Teams not found for match ${matchId}: homeTeam=${homeTeam ? 'found' : 'null'}, awayTeam=${awayTeam ? 'found' : 'null'}`);
      return null;
    }
    
    match.homeTeam = homeTeam;
    match.awayTeam = awayTeam;
    
    let matchPrediction = await MatchPrediction.findOne({ match: matchId });
    
    if (!matchPrediction) {
      console.log(`🔮 Generating new match prediction for ${match.homeTeam.name} vs ${match.awayTeam.name}`);
      
      const targetSeason = match.season || getCurrentFootballSeason();

      let homeStats = await getTeamStatsWithFallback(match.homeTeam.teamId, match.leagueId, targetSeason);
      let awayStats = await getTeamStatsWithFallback(match.awayTeam.teamId, match.leagueId, targetSeason);

      if (!homeStats || !awayStats) {
        try {
          const { updateTeamStatistics } = await import('./teamStatsService.js');
          if (!homeStats) await updateTeamStatistics(match.homeTeam.teamId, match.leagueId, targetSeason);
          if (!awayStats) await updateTeamStatistics(match.awayTeam.teamId, match.leagueId, targetSeason);
          homeStats = homeStats || await getTeamStatsWithFallback(match.homeTeam.teamId, match.leagueId, targetSeason);
          awayStats = awayStats || await getTeamStatsWithFallback(match.awayTeam.teamId, match.leagueId, targetSeason);
        } catch (e) {
          console.log('⚠️ Attempt to fetch missing team stats failed:', e?.message || e);
        }
      }

      let leagueAverages = await getLeagueAverages(match.leagueId, targetSeason);
      if (!homeStats || !awayStats) {
        console.log(`❌ Cannot generate prediction without third-party team statistics. Home: ${homeStats ? 'OK' : 'MISSING'}, Away: ${awayStats ? 'OK' : 'MISSING'}`);
        console.log(`📝 Creating placeholder prediction with null values due to missing team stats`);
        return await createPlaceholderPrediction(match, 'MISSING_TEAM_STATS');
      }
      
      const homeHasData = homeStats.matchesPlayed > 0 && homeStats.goalsForAvg > 0;
      const awayHasData = awayStats.matchesPlayed > 0 && awayStats.goalsForAvg > 0;
      
      if (!homeHasData || !awayHasData) {
        console.log(`⚠️ Insufficient team data detected. Home: ${homeStats.matchesPlayed} matches, ${homeStats.goalsForAvg} goals/game. Away: ${awayStats.matchesPlayed} matches, ${awayStats.goalsForAvg} goals/game`);
        console.log(`🔄 Attempting to fetch previous season data as fallback...`);
        
        const previousSeason = targetSeason - 1;
        let fallbackHomeStats = null;
        let fallbackAwayStats = null;
        
        if (!homeHasData) {
          console.log(`🔍 Trying previous season ${previousSeason} for home team ${match.homeTeam.name}`);
          
          if (match.homeTeam.teamId) {
            try {
              fallbackHomeStats = await getTeamStatsForPrediction(match.homeTeam.teamId, match.leagueId, previousSeason);
              if (fallbackHomeStats && fallbackHomeStats.matchesPlayed > 0 && fallbackHomeStats.goalsForAvg > 0) {
                console.log(`✅ Found previous season data for home team using teamId: ${fallbackHomeStats.matchesPlayed} matches, ${fallbackHomeStats.goalsForAvg} goals/game`);
              } else {
                fallbackHomeStats = null;
              }
            } catch (e) {
              console.log(`❌ Failed to fetch previous season data for home team using teamId:`, e?.message || e);
              fallbackHomeStats = null;
            }
          }
          
          if (!fallbackHomeStats && match.homeTeam.id) {
            try {
              fallbackHomeStats = await getTeamStatsForPrediction(match.homeTeam.id, match.leagueId, previousSeason);
              if (fallbackHomeStats && fallbackHomeStats.matchesPlayed > 0 && fallbackHomeStats.goalsForAvg > 0) {
                console.log(`✅ Found previous season data for home team using id: ${fallbackHomeStats.matchesPlayed} matches, ${fallbackHomeStats.goalsForAvg} goals/game`);
              } else {
                fallbackHomeStats = null;
              }
            } catch (e) {
              console.log(`❌ Failed to fetch previous season data for home team using id:`, e?.message || e);
              fallbackHomeStats = null;
            }
          }
        }
        
        if (!awayHasData) {
          console.log(`🔍 Trying previous season ${previousSeason} for away team ${match.awayTeam.name}`);
          
          if (match.awayTeam.teamId) {
            try {
              fallbackAwayStats = await getTeamStatsForPrediction(match.awayTeam.teamId, match.leagueId, previousSeason);
              if (fallbackAwayStats && fallbackAwayStats.matchesPlayed > 0 && fallbackAwayStats.goalsForAvg > 0) {
                console.log(`✅ Found previous season data for away team using teamId: ${fallbackAwayStats.matchesPlayed} matches, ${fallbackAwayStats.goalsForAvg} goals/game`);
              } else {
                fallbackAwayStats = null;
              }
            } catch (e) {
              console.log(`❌ Failed to fetch previous season data for away team using teamId:`, e?.message || e);
              fallbackAwayStats = null;
            }
          }
          
          if (!fallbackAwayStats && match.awayTeam.id) {
            try {
              fallbackAwayStats = await getTeamStatsForPrediction(match.awayTeam.id, match.leagueId, previousSeason);
              if (fallbackAwayStats && fallbackAwayStats.matchesPlayed > 0 && fallbackAwayStats.goalsForAvg > 0) {
                console.log(`✅ Found previous season data for away team using id: ${fallbackAwayStats.matchesPlayed} matches, ${fallbackAwayStats.goalsForAvg} goals/game`);   
        } else {
                fallbackAwayStats = null;
              }
            } catch (e) {
              console.log(`❌ Failed to fetch previous season data for away team using id:`, e?.message || e);
              fallbackAwayStats = null;
            }
          }
        }
        
        if (fallbackHomeStats) {
          homeStats = fallbackHomeStats;
          console.log(`📊 Using previous season data for home team ${match.homeTeam.name}`);
        }
        if (fallbackAwayStats) {
          awayStats = fallbackAwayStats;
          console.log(`📊 Using previous season data for away team ${match.awayTeam.name}`);
        }
        
        const finalHomeHasData = homeStats.matchesPlayed > 0 && homeStats.goalsForAvg > 0;
        const finalAwayHasData = awayStats.matchesPlayed > 0 && awayStats.goalsForAvg > 0;
        
        if (!finalHomeHasData || !finalAwayHasData) {
          console.log(`❌ Still insufficient data after previous season fallback. Creating placeholder prediction.`);
          return await createPlaceholderPrediction(match, 'INSUFFICIENT_TEAM_DATA');
        }
        
        console.log(`✅ Using fallback data for prediction generation`);
      }
      
      if (!leagueAverages) {
        console.log(`❌ Cannot generate prediction without league averages from third party for league ${match.leagueId}, season ${targetSeason}`);
        console.log(`📝 Creating placeholder prediction with null values due to missing league averages`);
        return await createPlaceholderPrediction(match, 'MISSING_LEAGUE_AVERAGES');
      }
      
      console.log(`📊 Using REAL team stats for prediction:`);
      console.log(`   Home (${match.homeTeam.name}): ${homeStats.matchesPlayed} matches, ${homeStats.goalsForAvg} goals/game, form: ${homeStats.form}`);
      console.log(`   Away (${match.awayTeam.name}): ${awayStats.matchesPlayed} matches, ${awayStats.goalsForAvg} goals/game, form: ${awayStats.form}`);
      
      const homeXG = calculateDixonColesXG(
        homeStats,
        awayStats,
        leagueAverages,
        true
      );
      
      const awayXG = calculateDixonColesXG(
        awayStats,
        homeStats,
        leagueAverages,
        false
      );
      
      console.log(`🎯 Calculated Dixon-Coles xG: Home ${homeXG.toFixed(2)}, Away ${awayXG.toFixed(2)}`);
      
      const simulationResults = runDixonColesSimulation(homeXG, awayXG);
      const outcomesWithDoubleChance = {
        ...simulationResults,
        doubleChance1X: Math.round((simulationResults.homeWin + simulationResults.draw) * 1000) / 1000,
        doubleChance12: Math.round((simulationResults.homeWin + simulationResults.awayWin) * 1000) / 1000,
        doubleChanceX2: Math.round((simulationResults.draw + simulationResults.awayWin) * 1000) / 1000,
      };
      
      const home = simulationResults.homeWin || 0;
      const draw = simulationResults.draw || 0;
      const away = simulationResults.awayWin || 0;
      
      const p1X = home + draw;
      const p12 = home + away;
      const pX2 = draw + away;
      const best = Math.max(p1X, p12, pX2);
      
      let homeWinBoolean = false;
      let drawBoolean = false;
      let awayWinBoolean = false;
      
      if (p1X === best) {
        homeWinBoolean = true;
      } else if (pX2 === best) {
        drawBoolean = true;
      } else {
        awayWinBoolean = true;
      }
      
      const over25 = simulationResults.over25 || 0;
      const under25 = simulationResults.under25 || 0;
      
      let over25Boolean = false;
      let under25Boolean = false;
      
      if (over25 > 55) {
        over25Boolean = true;
      }
      
      if (under25 > 25) {
        under25Boolean = true;
      }
      
      const dixonColesParams = {
        lambda1: homeXG,
        lambda2: awayXG,
        lambda3: CONFIG.LAMBDA3,
        rho: CONFIG.DIXON_COLES_RHO,
        modelVersion: CONFIG.MODEL_VERSION
      };
      
      console.log('🔧 DEBUG: dixonColesParams being saved:', dixonColesParams);
      
      const insertDoc = {
        match: matchId,
        homeStats: homeStats,
        awayStats: awayStats,
        leagueAverages
      };

      let existingPrediction = await MatchPrediction.findOne({ match: matchId });
      
      if (existingPrediction) {
        matchPrediction = await MatchPrediction.findOneAndUpdate(
          { match: matchId },
          {
            dixonColesParams: dixonColesParams,
            modelPrediction: {
              homeScore: Math.round(homeXG * 10) / 10,
              awayScore: Math.round(awayXG * 10) / 10,
              confidence: Math.max(simulationResults.homeWin, simulationResults.draw, simulationResults.awayWin),
              modelVersion: CONFIG.MODEL_VERSION
            },
            outcomes: {
              ...outcomesWithDoubleChance,
              homeWinBoolean,
              drawBoolean,
              awayWinBoolean,
              over25Boolean,
              under25Boolean
            },
            simulations: Array.from({ length: 10 }, () => {
              const { homeGoals, awayGoals } = generateBivariatePoisson(homeXG, awayXG);
              return {
                homeScore: homeGoals,
                awayScore: awayGoals
              };
            }),
            predictedAt: new Date(),
            lastUpdated: new Date()
          },
          { new: true }
        );
      } else {
        matchPrediction = await MatchPrediction.create({
          ...insertDoc,
          dixonColesParams: dixonColesParams,
          modelPrediction: {
            homeScore: Math.round(homeXG * 10) / 10,
            awayScore: Math.round(awayXG * 10) / 10,
            confidence: Math.max(simulationResults.homeWin, simulationResults.draw, simulationResults.awayWin),
            modelVersion: CONFIG.MODEL_VERSION
          },
          outcomes: {
            ...outcomesWithDoubleChance,
            homeWinBoolean,
            drawBoolean,
            awayWinBoolean,
            over25Boolean,
            under25Boolean
          },
          simulations: Array.from({ length: 10 }, () => {
            const { homeGoals, awayGoals } = generateBivariatePoisson(homeXG, awayXG);
            return {
              homeScore: homeGoals,
              awayScore: awayGoals
            };
          }),
          predictedAt: new Date(),
          lastUpdated: new Date()
        });
      }
      
      console.log('🔧 DEBUG: dixonColesParams after save:', matchPrediction.dixonColesParams);
      
      try {
        await PredictionStats.ensure(FIELDS_CONSIDERED);
        await PredictionStats.incrementSimulated(FIELDS_CONSIDERED);
      } catch (e) {
        console.warn('⚠️ Failed to increment simulated stats:', e?.message || e);
      }
      console.log(`✅ Created match prediction for ${match.homeTeam.name} vs ${match.awayTeam.name}`);
    } else {
      console.log(`📊 Found existing match prediction for ${match.homeTeam.name} vs ${match.awayTeam.name}`);
    }

    if (redisClient) {
      try {
        await redisClient.setExAsync(
          cacheKey,
          CONFIG.CACHE_TTL,
          JSON.stringify(matchPrediction)
        );
      } catch (error) {
        console.error('Error writing match prediction to cache:', error);
      }
    }
    
    const endTime = performance.now();
    matchPrediction.computationTime = endTime - startTime;
    
    return matchPrediction;
  } catch (error) {
    console.error('Error in getOrGenerateMatchPrediction:', error);
    throw error;
  }
};

export const generatePredictionsForMatches = async (matchIds) => {
  try {
    console.log(`🔮 Generating predictions for ${matchIds.length} matches...`);
    
    // Process in batches of 10 matches at a time (parallel within batch)
    const BATCH_SIZE = 10;
    const results = [];
    let processed = 0;
    let failed = 0;
    
    for (let i = 0; i < matchIds.length; i += BATCH_SIZE) {
      const batch = matchIds.slice(i, i + BATCH_SIZE);
      console.log(`📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(matchIds.length / BATCH_SIZE)} (${batch.length} matches)`);
      
      const batchPromises = batch.map(async (matchId) => {
        try {
          const prediction = await getOrGenerateMatchPrediction(matchId);
          if (prediction) {
            processed++;
            return prediction;
          }
          return null;
        } catch (error) {
          failed++;
          console.error(`❌ Error generating prediction for match ${matchId}:`, error.message);
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(Boolean));
      
      console.log(`✅ Batch complete: ${processed} successful, ${failed} failed (${results.length} total predictions)`);
    }
    
    console.log(`✅ Successfully generated ${results.length} match predictions (Processed: ${processed}, Failed: ${failed})`);
    return results;
  } catch (error) {
    console.error('Error in generatePredictionsForMatches:', error);
    throw error;
  }
};

export const processMatchPredictions = async (matchId) => {
  try {
    const match = await Match.findById(matchId);
    if (!match) throw new Error('Match not found');
    
    const matchPrediction = await MatchPrediction.findOne({ match: matchId });
    if (!matchPrediction) {
      console.log(`No match prediction found for match ${matchId}`);
      return null;
    }
    const alreadyProcessed = !!matchPrediction.isProcessed;
    
    const result = matchPrediction.isCorrect(match.goals.home, match.goals.away);
    
    const updateData = { 
      status: result,
      isProcessed: true,
      processedAt: new Date()
    };

    if (redisClient) {
      try {
        await redisClient.delAsync(`match_prediction:${matchId}`);
      } catch (error) {
        console.error('Error clearing match prediction cache:', error);
      }
    }
    
    const updatedPrediction = await MatchPrediction.findByIdAndUpdate(
      matchPrediction._id,
      updateData,
      { new: true }
    );
    
    try {
      if (!alreadyProcessed) {
        const ah = match?.goals?.home ?? null;
        const aa = match?.goals?.away ?? null;
        const totalCorners = match?.corners?.total ?? null;
        
        if (ah !== null && aa !== null) {
          const actualOutcome = ah > aa ? 'home' : (ah < aa ? 'away' : 'draw');
          const totalGoals = (ah || 0) + (aa || 0);
          const winningFields = [];
          
          if (actualOutcome === 'home' || actualOutcome === 'draw') winningFields.push('doubleChance1X');
          
          if (actualOutcome === 'draw' || actualOutcome === 'away') winningFields.push('doubleChanceX2');
          
          if ((ah > 0) && (aa > 0)) winningFields.push('btts');
          
          if (totalGoals > 2.5) winningFields.push('over25');
          
          if (totalGoals < 2.5) winningFields.push('under25');
          
          if (totalCorners !== null && matchPrediction.manualCorners?.cornerPrediction) {
            const { cornerPrediction, cornerThreshold } = matchPrediction.manualCorners;
            if (cornerPrediction === 'over' && totalCorners > cornerThreshold) {
              winningFields.push('corners');
            } else if (cornerPrediction === 'under' && totalCorners < cornerThreshold) {
              winningFields.push('corners');
            }
          }
          
          if (winningFields.length > 0) {
            await PredictionStats.ensure(FIELDS_CONSIDERED);
            await PredictionStats.incrementWins(winningFields);
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Failed to increment win stats:', e?.message || e);
    }

    console.log(`✅ Processed match prediction for match ${matchId}: ${result}`);
    return updatedPrediction;
  } catch (error) {
    console.error('Error processing match prediction:', error);
    throw error;
  }
};

export const getMatchPredictionsWithDetails = async (filters = {}) => {
  try {
    const query = {};
    
    if (filters.status) {
      query.status = filters.status;
    }
    
    if (filters.dateFrom || filters.dateTo) {
      query['matchInfo.date'] = {};
      if (filters.dateFrom) query['matchInfo.date'].$gte = new Date(filters.dateFrom);
      if (filters.dateTo) query['matchInfo.date'].$lte = new Date(filters.dateTo);
    }
    
    const predictions = await MatchPrediction.find(query)
      .populate('match')
      .sort({ predictedAt: -1 })
      .limit(filters.limit || 50);
    
    for (const prediction of predictions) {
      if (prediction.match) {
        const homeTeam = await Team.findOne({ teamId: prediction.match.homeTeam });
        const awayTeam = await Team.findOne({ teamId: prediction.match.awayTeam });
        prediction.match.homeTeam = homeTeam;
        prediction.match.awayTeam = awayTeam;
      }
    }
    
    return predictions;
  } catch (error) {
    console.error('Error getting match predictions with details:', error);
    throw error;
  }
};
