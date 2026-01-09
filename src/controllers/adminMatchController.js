import Match from '../models/matchModel.js';
import League from '../models/leaugeModel.js';
import Team from '../models/teamModel.js';
import MatchPrediction from '../models/matchPredictionModel.js';
import catchAsyncError from '../utils/catchAsync.js';
import { sendSuccess, sendError, sendPaginatedResponse } from '../utils/response.js';

const filterPredictionByShowFlags = (prediction) => {
  if (!prediction) return null;
  
  const filteredOutcomes = {};
  if (prediction.outcomes) {
    if (prediction.outcomes.homeWin !== undefined) filteredOutcomes.homeWin = prediction.outcomes.homeWin;
    if (prediction.outcomes.draw !== undefined) filteredOutcomes.draw = prediction.outcomes.draw;
    if (prediction.outcomes.awayWin !== undefined) filteredOutcomes.awayWin = prediction.outcomes.awayWin;
    
    if (prediction.showFlags?.homeWinShow) filteredOutcomes.homeWin = prediction.outcomes.homeWin;
    if (prediction.showFlags?.drawShow) filteredOutcomes.draw = prediction.outcomes.draw;
    if (prediction.showFlags?.awayWinShow) filteredOutcomes.awayWin = prediction.outcomes.awayWin;
    
    if (prediction.showFlags?.over05Show) filteredOutcomes.over05 = prediction.outcomes.over05;
    if (prediction.showFlags?.over15Show) filteredOutcomes.over15 = prediction.outcomes.over15;
    if (prediction.showFlags?.over25Show) filteredOutcomes.over25 = prediction.outcomes.over25;
    if (prediction.showFlags?.over35Show) filteredOutcomes.over35 = prediction.outcomes.over35;
    if (prediction.showFlags?.over45Show) filteredOutcomes.over45 = prediction.outcomes.over45;
    if (prediction.showFlags?.over55Show) filteredOutcomes.over55 = prediction.outcomes.over55;
    if (prediction.showFlags?.over65Show) filteredOutcomes.over65 = prediction.outcomes.over65;
    if (prediction.showFlags?.over75Show) filteredOutcomes.over75 = prediction.outcomes.over75;
    if (prediction.showFlags?.over85Show) filteredOutcomes.over85 = prediction.outcomes.over85;
    if (prediction.showFlags?.over95Show) filteredOutcomes.over95 = prediction.outcomes.over95;
    
    if (prediction.showFlags?.bttsShow) filteredOutcomes.btts = prediction.outcomes.btts;
    if (prediction.showFlags?.bttsYesShow) filteredOutcomes.bttsYes = prediction.outcomes.bttsYes;
    if (prediction.showFlags?.bttsNoShow) filteredOutcomes.bttsNo = prediction.outcomes.bttsNo;
    
    const home = Number(prediction.outcomes.homeWin || 0);
    const draw = Number(prediction.outcomes.draw || 0);
    const away = Number(prediction.outcomes.awayWin || 0);
    const dc1X = prediction.outcomes.doubleChance1X !== undefined ? prediction.outcomes.doubleChance1X : (home + draw);
    const dc12 = prediction.outcomes.doubleChance12 !== undefined ? prediction.outcomes.doubleChance12 : (home + away);
    const dcX2 = prediction.outcomes.doubleChanceX2 !== undefined ? prediction.outcomes.doubleChanceX2 : (draw + away);
    filteredOutcomes.doubleChance1X = dc1X;
    filteredOutcomes.doubleChance12 = dc12;
    filteredOutcomes.doubleChanceX2 = dcX2;
    
    if (prediction.outcomes.homeWinBoolean !== undefined) filteredOutcomes.homeWinBoolean = prediction.outcomes.homeWinBoolean;
    if (prediction.outcomes.drawBoolean !== undefined) filteredOutcomes.drawBoolean = prediction.outcomes.drawBoolean;
    if (prediction.outcomes.awayWinBoolean !== undefined) filteredOutcomes.awayWinBoolean = prediction.outcomes.awayWinBoolean;
    if (prediction.outcomes.over25Boolean !== undefined) filteredOutcomes.over25Boolean = prediction.outcomes.over25Boolean;
    if (prediction.outcomes.under25Boolean !== undefined) filteredOutcomes.under25Boolean = prediction.outcomes.under25Boolean;
  }
  
  if (filteredOutcomes.homeWin === undefined) filteredOutcomes.homeWin = 0;
  if (filteredOutcomes.draw === undefined) filteredOutcomes.draw = 0;
  if (filteredOutcomes.awayWin === undefined) filteredOutcomes.awayWin = 0;
  if (filteredOutcomes.doubleChance1X === undefined) filteredOutcomes.doubleChance1X = filteredOutcomes.homeWin + filteredOutcomes.draw;
  if (filteredOutcomes.doubleChance12 === undefined) filteredOutcomes.doubleChance12 = filteredOutcomes.homeWin + filteredOutcomes.awayWin;
  if (filteredOutcomes.doubleChanceX2 === undefined) filteredOutcomes.doubleChanceX2 = filteredOutcomes.draw + filteredOutcomes.awayWin;
  
  const filteredManualCorners = {};
  if (prediction.manualCorners) {
    if (prediction.showFlags?.overCornersShow) filteredManualCorners.overCorners = prediction.manualCorners.overCorners;
    if (prediction.showFlags?.underCornersShow) filteredManualCorners.underCorners = prediction.manualCorners.underCorners;
    if (prediction.showFlags?.cornerThresholdShow) filteredManualCorners.cornerThreshold = prediction.manualCorners.cornerThreshold;
    if (prediction.showFlags?.cornerPredictionShow) filteredManualCorners.cornerPrediction = prediction.manualCorners.cornerPrediction;
  }
  
  return {
    modelPrediction: prediction.modelPrediction,
    outcomes: filteredOutcomes,
    manualCorners: filteredManualCorners,
    showFlags: prediction.showFlags,
    predictedAt: prediction.predictedAt
  };
};

export const getHomepageMatches = catchAsyncError(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  let matches = await Match.find({ 
    showOnHomepage: true,
    date: { $gte: now, $lte: nextWeek },
    'status.short': { $in: ['NS', 'TBD', 'PST'] }
  })
    .sort({ date: 1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));
  
  if (matches.length === 0) {
    matches = await Match.find({ 
      date: { $gte: now, $lte: nextWeek },
      'status.short': { $in: ['NS', 'TBD', 'PST'] }
    })
      .sort({ date: 1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
  }
  
  const leagueIds = [...new Set(matches.map(match => match.leagueId))];
  
  const [leagues, teams, predictions] = await Promise.all([
    League.find({ leagueId: { $in: leagueIds } }),
    Team.find({ teamId: { $in: [...new Set([...matches.map(m => m.homeTeam), ...matches.map(m => m.awayTeam)])] } }),
    MatchPrediction.find({ match: { $in: matches.map(m => m._id) } })
  ]);
  
  const leagueMap = new Map(leagues.map(league => [league.leagueId, league]));
  const teamMap = new Map(teams.map(team => [team.teamId, team]));
  const predictionMap = new Map(predictions.map(pred => [pred.match.toString(), pred]));
  
  const leagueGroups = new Map();
  
  for (const match of matches) {
    const league = leagueMap.get(match.leagueId);
    if (!league) continue;
    
    const homeTeam = teamMap.get(match.homeTeam);
    const awayTeam = teamMap.get(match.awayTeam);
    const prediction = predictionMap.get(match._id.toString());
    
    const matchObj = match.toObject();
    
    const homeTeamData = homeTeam ? {
      id: homeTeam.teamId,
      name: homeTeam.name,
      logo: homeTeam.logo,
      venue: homeTeam.venue
    } : { id: match.homeTeam, name: 'Unknown Team' };
    
    const awayTeamData = awayTeam ? {
      id: awayTeam.teamId,
      name: awayTeam.name,
      logo: awayTeam.logo,
      venue: awayTeam.venue
    } : { id: match.awayTeam, name: 'Unknown Team' };
    
    matchObj.homeTeam = homeTeamData;
    matchObj.awayTeam = awayTeamData;
    matchObj.league = {
      id: league.leagueId,
      name: league.name,
      country: league.country,
      logo: league.logo
    };
    
    if (prediction) {
      matchObj.prediction = filterPredictionByShowFlags(prediction);
      
      matchObj.overGoals = [];
      if (prediction.showFlags?.over05Show) matchObj.overGoals.push({ label: "0.5", value: prediction.outcomes.over05 });
      if (prediction.showFlags?.over15Show) matchObj.overGoals.push({ label: "1.5", value: prediction.outcomes.over15 });
      if (prediction.showFlags?.over25Show) matchObj.overGoals.push({ label: "2.5", value: prediction.outcomes.over25 });
      if (prediction.showFlags?.over35Show) matchObj.overGoals.push({ label: "3.5", value: prediction.outcomes.over35 });
      if (prediction.showFlags?.over45Show) matchObj.overGoals.push({ label: "4.5", value: prediction.outcomes.over45 });
      if (prediction.showFlags?.over55Show) matchObj.overGoals.push({ label: "5.5", value: prediction.outcomes.over55 });
      if (prediction.showFlags?.over65Show) matchObj.overGoals.push({ label: "6.5", value: prediction.outcomes.over65 });
      if (prediction.showFlags?.over75Show) matchObj.overGoals.push({ label: "7.5", value: prediction.outcomes.over75 });
      if (prediction.showFlags?.over85Show) matchObj.overGoals.push({ label: "8.5", value: prediction.outcomes.over85 });
      if (prediction.showFlags?.over95Show) matchObj.overGoals.push({ label: "9.5", value: prediction.outcomes.over95 });
    }
    
    if (!leagueGroups.has(league.leagueId)) {
      leagueGroups.set(league.leagueId, {
        league: {
          id: league.leagueId,
          name: league.name,
          country: league.country,
          logo: league.logo
        },
        matches: []
      });
    }
    
    leagueGroups.get(league.leagueId).matches.push(matchObj);
  }
  
  const leaguesArray = Array.from(leagueGroups.values());
  
  const totalMatches = matches.length;
  const totalLeagues = leaguesArray.length;
  
  let total = await Match.countDocuments({ 
    showOnHomepage: true,
    date: { $gte: now, $lte: nextWeek },
    'status.short': { $in: ['NS', 'TBD', 'PST'] }
  });
  
  if (total === 0) {
    total = await Match.countDocuments({ 
      date: { $gte: now, $lte: nextWeek },
      'status.short': { $in: ['NS', 'TBD', 'PST'] }
    });
  }
  
  const totalPages = Math.ceil(total / parseInt(limit));
  
  return res.status(200).json({
    success: true,
    message: "Upcoming matches for next day grouped by league with predictions",
    data: {
      leagues: leaguesArray,
      totals: {
        leagues: totalLeagues,
        matches: totalMatches
      },
      pagination: {
        page: parseInt(page),
        totalPages,
        totalItems: total,
        pageSize: parseInt(limit)
      }
    }
  });
});

export const getDoubleOrNothingMatches = catchAsyncError(async (req, res) => {
  const matches = await Match.find({ doubleOrNothing: true })
    .sort({ date: 1 })
    .limit(2);
  
  const leagueIds = [...new Set(matches.map(match => match.leagueId))];
  const teamIds = [...new Set([...matches.map(m => m.homeTeam), ...matches.map(m => m.awayTeam)])];
  
  const [leagues, teams, predictions] = await Promise.all([
    League.find({ leagueId: { $in: leagueIds } }),
    Team.find({ teamId: { $in: teamIds } }),
    MatchPrediction.find({ match: { $in: matches.map(m => m._id) } })
  ]);
  
  const leagueMap = new Map(leagues.map(league => [league.leagueId, league]));
  const teamMap = new Map(teams.map(team => [team.teamId, team]));
  const predictionMap = new Map(predictions.map(pred => [pred.match.toString(), pred]));
  
  const matchesWithDetails = matches.map(match => {
    const matchObj = match.toObject();
    
    const homeTeam = teamMap.get(match.homeTeam);
    const awayTeam = teamMap.get(match.awayTeam);
    const league = leagueMap.get(match.leagueId);
    const prediction = predictionMap.get(match._id.toString());
    
    const homeTeamData = homeTeam ? {
      id: homeTeam.teamId,
      name: homeTeam.name,
      logo: homeTeam.logo,
      venue: homeTeam.venue
    } : { id: match.homeTeam, name: 'Unknown Team' };
    
    const awayTeamData = awayTeam ? {
      id: awayTeam.teamId,
      name: awayTeam.name,
      logo: awayTeam.logo,
      venue: awayTeam.venue
    } : { id: match.awayTeam, name: 'Unknown Team' };
    
    const leagueData = league ? {
      id: league.leagueId,
      name: league.name,
      country: league.country,
      logo: league.logo
    } : { id: match.leagueId, name: 'Unknown League' };
    
    const result = {
      ...matchObj,
      homeTeam: homeTeamData,
      awayTeam: awayTeamData,
      league: leagueData
    };
    
    if (prediction) {
      result.prediction = {
        modelPrediction: prediction.modelPrediction,
        outcomes: prediction.outcomes,
        manualCorners: prediction.manualCorners,
        showFlags: prediction.showFlags,
        predictedAt: prediction.predictedAt
      };
      
      result.overGoals = [];
      if (prediction.outcomes?.over05 !== undefined) result.overGoals.push({ label: "0.5", value: prediction.outcomes.over05 });
      if (prediction.outcomes?.over15 !== undefined) result.overGoals.push({ label: "1.5", value: prediction.outcomes.over15 });
      if (prediction.outcomes?.over25 !== undefined) result.overGoals.push({ label: "2.5", value: prediction.outcomes.over25 });
      if (prediction.outcomes?.over35 !== undefined) result.overGoals.push({ label: "3.5", value: prediction.outcomes.over35 });
      if (prediction.outcomes?.over45 !== undefined) result.overGoals.push({ label: "4.5", value: prediction.outcomes.over45 });
      if (prediction.outcomes?.over55 !== undefined) result.overGoals.push({ label: "5.5", value: prediction.outcomes.over55 });
      if (prediction.outcomes?.over65 !== undefined) result.overGoals.push({ label: "6.5", value: prediction.outcomes.over65 });
      if (prediction.outcomes?.over75 !== undefined) result.overGoals.push({ label: "7.5", value: prediction.outcomes.over75 });
      if (prediction.outcomes?.over85 !== undefined) result.overGoals.push({ label: "8.5", value: prediction.outcomes.over85 });
      if (prediction.outcomes?.over95 !== undefined) result.overGoals.push({ label: "9.5", value: prediction.outcomes.over95 });
      
      if (prediction.manualCorners && prediction.manualCorners.overCorners) {
        result.overCorners = prediction.manualCorners.overCorners;
      }
    }
    
    return result;
  });
  
  return sendSuccess(res, {
    data: {
      matches: matchesWithDetails,
      count: matchesWithDetails.length,
      message: `Found ${matchesWithDetails.length} double or nothing matches`
    }
  });
});

export const toggleDoubleOrNothing = catchAsyncError(async (req, res) => {
  const { matchId } = req.params;
  
  const match = await Match.findById(matchId);
  if (!match) {
    return sendError(res, { message: 'Match not found', statusCode: 404 });
  }
  
  const newStatus = !match.doubleOrNothing;
  
  if (newStatus) {
    const currentCount = await Match.countDocuments({ doubleOrNothing: true });
    if (currentCount >= 2) {
      return sendError(res, { message: 'Maximum 2 matches can be marked for double or nothing', statusCode: 400 });
    }
  }
  
  await Match.findByIdAndUpdate(
    matchId,
    { 
      doubleOrNothing: newStatus,
      updatedAt: new Date()
    }
  );
  
  return sendSuccess(res, {
    data: {
      doubleOrNothing: newStatus
    },
    message: `Match ${newStatus ? 'marked' : 'unmarked'} for double or nothing`
  });
});

export const toggleShowOnHomepage = catchAsyncError(async (req, res) => {
  const { matchId } = req.params;
  
  const match = await Match.findById(matchId);
  if (!match) {
    return sendError(res, { 
      message: `Match with ID '${matchId}' not found. Please check if the match exists or if it was recently deleted by the cleanup system.`, 
      statusCode: 404,
      details: {
        matchId: matchId,
        suggestion: 'Try fetching all matches first to see available match IDs',
        possibleCauses: [
          'Match ID is incorrect',
          'Match was deleted by the cleanup system',
          'Match never existed in the database',
          'Database connection issue'
        ]
      }
    });
  }
  
  const newStatus = !match.showOnHomepage;
  
  if (newStatus) {
    const now = new Date();
    
    const finishedStatuses = ['FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'AWD', 'WO'];
    if (finishedStatuses.includes(match.status.short)) {
      return sendError(res, { 
        message: `Cannot mark finished matches to show on homepage. Match status: '${match.status.short}' (${match.status.long || 'Unknown'})`, 
        statusCode: 400,
        details: {
          matchStatus: match.status.short,
          statusDescription: match.status.long || 'Unknown',
          reason: 'Match is already finished',
          finishedStatuses: finishedStatuses
        }
      });
    }
    
    const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'];
    if (liveStatuses.includes(match.status.short)) {
      console.log(`✅ Allowing live match to be marked for homepage. Status: ${match.status.short}`);
    } else {
      const upcomingStatuses = ['NS', 'TBD'];
      if (!upcomingStatuses.includes(match.status.short)) {
        return sendError(res, { 
          message: 'Can only mark upcoming matches (not started) to show on homepage', 
          statusCode: 400 
        });
      }
      
      const bufferTime = 60 * 60 * 1000;
      const currentTimeWithBuffer = new Date(now.getTime() + bufferTime);
      
      if (match.date < now) {
        return sendError(res, { 
          message: `Cannot mark matches that have already passed to show on homepage. Match date: ${match.date.toISOString()}, Current time: ${now.toISOString()}`, 
          statusCode: 400,
          details: {
            matchDate: match.date.toISOString(),
            currentTime: now.toISOString(),
            reason: 'Match has already passed (with 1-hour timezone buffer)'
          }
        });
      }
    }
  }
  
  await Match.findByIdAndUpdate(
    matchId,
    { 
      showOnHomepage: newStatus,
      updatedAt: new Date()
    }
  );
  
  return sendSuccess(res, {
    data: {
      showOnHomepage: newStatus,
      matchId: matchId,
      matchDate: match.date,
      matchStatus: match.status.short
    },
    message: `Match ${newStatus ? 'marked' : 'unmarked'} to show on homepage`
  });
});

export const getTomorrowMatches = catchAsyncError(async (req, res) => {
  const { page = 1, limit = 20, filter = 'all' } = req.query;
  
  const now = new Date();
  
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(today.getUTCDate() + 1);
  
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  
  const tomorrowStart = tomorrow;
  const tomorrowEnd = dayAfterTomorrow;
  
  console.log(`📅 Today: ${today.toISOString().split('T')[0]}`);
  console.log(`📅 Tomorrow: ${tomorrow.toISOString().split('T')[0]}`);
  console.log(`📅 Day After Tomorrow: ${dayAfterTomorrow.toISOString().split('T')[0]}`);
  console.log(`📅 Searching matches from ${tomorrowStart.toISOString()} to ${tomorrowEnd.toISOString()}`);
  
  let allMatches = await Match.find({ 
    date: { $gte: tomorrowStart, $lte: tomorrowEnd },
    'status.short': { $in: ['NS', 'TBD', 'PST'] }
  }).sort({ date: 1 });
  
  const leagueIds = [...new Set(allMatches.map(match => match.leagueId))];
  
  const [leagues, teams, predictions] = await Promise.all([
    League.find({ leagueId: { $in: leagueIds } }),
    Team.find({ teamId: { $in: [...new Set([...allMatches.map(m => m.homeTeam), ...allMatches.map(m => m.awayTeam)])] } }),
    MatchPrediction.find({ match: { $in: allMatches.map(m => m._id) } })
  ]);
  
  const leagueMap = new Map(leagues.map(league => [league.leagueId, league]));
  const teamMap = new Map(teams.map(team => [team.teamId, team]));
  const predictionMap = new Map(predictions.map(pred => [pred.match.toString(), pred]));
  
  let filteredMatches = allMatches;
  
  if (filter !== 'all') {
    filteredMatches = allMatches.filter(match => {
      const prediction = predictionMap.get(match._id.toString());
      if (!prediction) return false;
      
      switch (filter) {
        case 'win-draw-win':
        case 'match-outcome':
          return prediction.showFlags && (
            prediction.showFlags.homeWinShow === true ||
            prediction.showFlags.drawShow === true ||
            prediction.showFlags.awayWinShow === true
          );
        
        case 'home-win':
          return prediction.showFlags && prediction.showFlags.homeWinShow === true;
        
        case 'draw':
          return prediction.showFlags && prediction.showFlags.drawShow === true;
        
        case 'away-win':
          return prediction.showFlags && prediction.showFlags.awayWinShow === true;
        
        case 'btts':
        case 'both-teams-to-score':
          return prediction.showFlags && prediction.showFlags.bttsShow === true;
        
        case 'btts-yes':
          return prediction.showFlags && prediction.showFlags.bttsYesShow === true;
        
        case 'btts-no':
          return prediction.showFlags && prediction.showFlags.bttsNoShow === true;
        
        case 'over-under-goals':
        case 'goals':
          return prediction.showFlags && (
            prediction.showFlags.over05Show === true ||
            prediction.showFlags.over15Show === true ||
            prediction.showFlags.over25Show === true ||
            prediction.showFlags.over35Show === true ||
            prediction.showFlags.over45Show === true ||
            prediction.showFlags.over55Show === true ||
            prediction.showFlags.over65Show === true ||
            prediction.showFlags.over75Show === true ||
            prediction.showFlags.over85Show === true ||
            prediction.showFlags.over95Show === true
          );
        
        case 'over25':
          return prediction.showFlags && prediction.showFlags.over25Show === true;
        
        case 'under25':
          return prediction.showFlags && prediction.showFlags.under25Show === true;
        
        case 'over15':
          return prediction.showFlags && prediction.showFlags.over15Show === true;
        
        case 'over35':
          return prediction.showFlags && prediction.showFlags.over35Show === true;
        
        case 'over05':
          return prediction.showFlags && prediction.showFlags.over05Show === true;
        
        case 'over45':
          return prediction.showFlags && prediction.showFlags.over45Show === true;
        
        case 'over55':
          return prediction.showFlags && prediction.showFlags.over55Show === true;
        
        case 'over65':
          return prediction.showFlags && prediction.showFlags.over65Show === true;
        
        case 'over75':
          return prediction.showFlags && prediction.showFlags.over75Show === true;
        
        case 'over85':
          return prediction.showFlags && prediction.showFlags.over85Show === true;
        
        case 'over95':
          return prediction.showFlags && prediction.showFlags.over95Show === true;
        
        case 'doubleChance1X':
          return prediction.showFlags && prediction.showFlags.doubleChance1XShow === true;
        
        case 'doubleChanceX2':
          return prediction.showFlags && prediction.showFlags.doubleChanceX2Show === true;
        
        case 'doubleChance12':
          return prediction.showFlags && prediction.showFlags.doubleChance12Show === true;
        
        case 'corners':
        case 'corner-predictions':
          return prediction.showFlags && (
            prediction.showFlags.overCornersShow === true ||
            prediction.showFlags.underCornersShow === true ||
            prediction.showFlags.cornerThresholdShow === true ||
            prediction.showFlags.cornerPredictionShow === true
          );
        
        case 'over-corners':
          return prediction.showFlags && prediction.showFlags.overCornersShow === true;
        
        case 'under-corners':
          return prediction.showFlags && prediction.showFlags.underCornersShow === true;
        
        case 'all':
        default:
          return true;
      }
    });
  }
  
  const leagueGroups = new Map();
  
  for (const match of filteredMatches) {
    const league = leagueMap.get(match.leagueId);
    const homeTeam = teamMap.get(match.homeTeam);
    const awayTeam = teamMap.get(match.awayTeam);
    const prediction = predictionMap.get(match._id.toString());
    
    if (!league || !homeTeam || !awayTeam) continue;
    
    const matchObj = {
      status: match.status,
      goals: match.goals,
      corners: match.corners,
      score: match.score,
      doubleOrNothing: match.doubleOrNothing || false,
      showOnHomepage: match.showOnHomepage,
      _id: match._id,
      fixtureId: match.fixtureId,
      leagueId: match.leagueId,
      season: match.season,
      date: match.date,
      homeTeam: {
        id: homeTeam.teamId,
        name: homeTeam.name,
        logo: homeTeam.logo
      },
      awayTeam: {
        id: awayTeam.teamId,
        name: awayTeam.name,
        logo: awayTeam.logo
      },
      aiPicked: match.aiPicked || false,
      playOfDay: match.playOfDay || false,
      featured: match.featured || false,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
      __v: match.__v,
      league: {
        id: league.leagueId,
        name: league.name,
        country: league.country,
        logo: league.logo
      }
    };
    
    if (prediction) {
      matchObj.prediction = filterPredictionByShowFlags(prediction);
      
      matchObj.overGoals = [];
      if (prediction.showFlags?.over05Show) matchObj.overGoals.push({ label: "0.5", value: prediction.outcomes.over05 });
      if (prediction.showFlags?.over15Show) matchObj.overGoals.push({ label: "1.5", value: prediction.outcomes.over15 });
      if (prediction.showFlags?.over25Show) matchObj.overGoals.push({ label: "2.5", value: prediction.outcomes.over25 });
      if (prediction.showFlags?.over35Show) matchObj.overGoals.push({ label: "3.5", value: prediction.outcomes.over35 });
      if (prediction.showFlags?.over45Show) matchObj.overGoals.push({ label: "4.5", value: prediction.outcomes.over45 });
      if (prediction.showFlags?.over55Show) matchObj.overGoals.push({ label: "5.5", value: prediction.outcomes.over55 });
      if (prediction.showFlags?.over65Show) matchObj.overGoals.push({ label: "6.5", value: prediction.outcomes.over65 });
      if (prediction.showFlags?.over75Show) matchObj.overGoals.push({ label: "7.5", value: prediction.outcomes.over75 });
      if (prediction.showFlags?.over85Show) matchObj.overGoals.push({ label: "8.5", value: prediction.outcomes.over85 });
      if (prediction.showFlags?.over95Show) matchObj.overGoals.push({ label: "9.5", value: prediction.outcomes.over95 });
    }
    
    if (!leagueGroups.has(league.leagueId)) {
      leagueGroups.set(league.leagueId, {
        league: {
          id: league.leagueId,
          name: league.name,
          country: league.country,
          logo: league.logo
        },
        matches: []
      });
    }
    
    leagueGroups.get(league.leagueId).matches.push(matchObj);
  }
  
  const leaguesArray = Array.from(leagueGroups.values()).sort((a, b) => {
    const majorLeagues = [
      'England', 'Spain', 'Germany', 'Italy', 'France'
    ];
    
    const countryA = a.league.country || '';
    const countryB = b.league.country || '';
    
    const isMajorA = majorLeagues.includes(countryA);
    const isMajorB = majorLeagues.includes(countryB);
    
    if (isMajorA && isMajorB) {
      return majorLeagues.indexOf(countryA) - majorLeagues.indexOf(countryB);
    }
    
    if (isMajorA && !isMajorB) {
      return -1;
    }
    
    if (!isMajorA && isMajorB) {
      return 1;
    }
    
    return countryA.localeCompare(countryB);
  });
  
  const startIndex = (parseInt(page) - 1) * parseInt(limit);
  const endIndex = startIndex + parseInt(limit);
  const paginatedLeagues = leaguesArray.slice(startIndex, endIndex);
  
  const totalMatches = filteredMatches.length;
  const totalLeagues = leaguesArray.length;
  
  const totalPages = Math.ceil(totalLeagues / parseInt(limit));
  
  return res.status(200).json({
    success: true,
    message: `Tomorrow's matches grouped by league with predictions${filter !== 'all' ? ` (filtered by ${filter})` : ''}`,
    data: {
      leagues: paginatedLeagues,
      totals: {
        leagues: totalLeagues,
        matches: totalMatches
      },
      pagination: {
        page: parseInt(page),
        totalPages,
        totalItems: totalLeagues,
        pageSize: parseInt(limit)
      }
    }
  });
});

export const getMarkedAsShowOnHomepageMatches = catchAsyncError(async (req, res) => {
  const { page = 1, limit = 20, filter = 'all' } = req.query;
  
  let matchQuery = { showOnHomepage: true };
  
  let allMatches = await Match.find(matchQuery).sort({ date: 1 });
  
  const leagueIds = [...new Set(allMatches.map(match => match.leagueId))];
  
  const [leagues, teams, predictions] = await Promise.all([
    League.find({ leagueId: { $in: leagueIds } }),
    Team.find({ teamId: { $in: [...new Set([...allMatches.map(m => m.homeTeam), ...allMatches.map(m => m.awayTeam)])] } }),
    MatchPrediction.find({ match: { $in: allMatches.map(m => m._id) } })
  ]);
  
  const leagueMap = new Map(leagues.map(league => [league.leagueId, league]));
  const teamMap = new Map(teams.map(team => [team.teamId, team]));
  const predictionMap = new Map(predictions.map(pred => [pred.match.toString(), pred]));
  
  let filteredMatches = allMatches;
  
  if (filter !== 'all') {
    filteredMatches = allMatches.filter(match => {
      const prediction = predictionMap.get(match._id.toString());
      if (!prediction) return false;
      
      switch (filter) {
        case 'win-draw-win':
        case 'match-outcome':
          return prediction.showFlags && (
            prediction.showFlags.homeWinShow === true ||
            prediction.showFlags.drawShow === true ||
            prediction.showFlags.awayWinShow === true
          );
        
        case 'home-win':
          return prediction.showFlags && prediction.showFlags.homeWinShow === true;
        
        case 'draw':
          return prediction.showFlags && prediction.showFlags.drawShow === true;
        
        case 'away-win':
          return prediction.showFlags && prediction.showFlags.awayWinShow === true;
        
        case 'btts':
        case 'both-teams-to-score':
          return prediction.showFlags && prediction.showFlags.bttsShow === true;
        
        case 'btts-yes':
          return prediction.showFlags && prediction.showFlags.bttsYesShow === true;
        
        case 'btts-no':
          return prediction.showFlags && prediction.showFlags.bttsNoShow === true;
        
        case 'over-under-goals':
        case 'goals':
          return prediction.showFlags && (
            prediction.showFlags.over05Show === true ||
            prediction.showFlags.over15Show === true ||
            prediction.showFlags.over25Show === true ||
            prediction.showFlags.over35Show === true ||
            prediction.showFlags.over45Show === true ||
            prediction.showFlags.over55Show === true ||
            prediction.showFlags.over65Show === true ||
            prediction.showFlags.over75Show === true ||
            prediction.showFlags.over85Show === true ||
            prediction.showFlags.over95Show === true
          );
        
        case 'over25':
          return prediction.showFlags && prediction.showFlags.over25Show === true;
        
        case 'under25':
          return prediction.showFlags && prediction.showFlags.under25Show === true;
        
        case 'over15':
          return prediction.showFlags && prediction.showFlags.over15Show === true;
        
        case 'over35':
          return prediction.showFlags && prediction.showFlags.over35Show === true;
        
        case 'over05':
          return prediction.showFlags && prediction.showFlags.over05Show === true;
        
        case 'over45':
          return prediction.showFlags && prediction.showFlags.over45Show === true;
        
        case 'over55':
          return prediction.showFlags && prediction.showFlags.over55Show === true;
        
        case 'over65':
          return prediction.showFlags && prediction.showFlags.over65Show === true;
        
        case 'over75':
          return prediction.showFlags && prediction.showFlags.over75Show === true;
        
        case 'over85':
          return prediction.showFlags && prediction.showFlags.over85Show === true;
        
        case 'over95':
          return prediction.showFlags && prediction.showFlags.over95Show === true;
        
        case 'doubleChance1X':
          return prediction.showFlags && prediction.showFlags.doubleChance1XShow === true;
        
        case 'doubleChanceX2':
          return prediction.showFlags && prediction.showFlags.doubleChanceX2Show === true;
        
        case 'doubleChance12':
          return prediction.showFlags && prediction.showFlags.doubleChance12Show === true;
        
        case 'corners':
        case 'corner-predictions':
          return prediction.showFlags && (
            prediction.showFlags.overCornersShow === true ||
            prediction.showFlags.underCornersShow === true ||
            prediction.showFlags.cornerThresholdShow === true ||
            prediction.showFlags.cornerPredictionShow === true
          );
        
        case 'over-corners':
          return prediction.showFlags && prediction.showFlags.overCornersShow === true;
        
        case 'under-corners':
          return prediction.showFlags && prediction.showFlags.underCornersShow === true;
        
        case 'all':
        default:
          return true;
      }
    });
  }
  
  const leagueGroups = new Map();
  
  for (const match of filteredMatches) {
    const league = leagueMap.get(match.leagueId);
    const homeTeam = teamMap.get(match.homeTeam);
    const awayTeam = teamMap.get(match.awayTeam);
    const prediction = predictionMap.get(match._id.toString());
    
    if (!league || !homeTeam || !awayTeam) continue;
    
    const matchObj = {
      status: match.status,
      goals: match.goals,
      corners: match.corners,
      score: match.score,
      doubleOrNothing: match.doubleOrNothing || false,
      showOnHomepage: match.showOnHomepage,
      _id: match._id,
      fixtureId: match.fixtureId,
      leagueId: match.leagueId,
      season: match.season,
      date: match.date,
      homeTeam: {
        id: homeTeam.teamId,
        name: homeTeam.name,
        logo: homeTeam.logo
      },
      awayTeam: {
        id: awayTeam.teamId,
        name: awayTeam.name,
        logo: awayTeam.logo
      },
      aiPicked: match.aiPicked || false,
      playOfDay: match.playOfDay || false,
      featured: match.featured || false,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
      __v: match.__v,
      league: {
        id: league.leagueId,
        name: league.name,
        country: league.country,
        logo: league.logo
      }
    };
    
    if (prediction) {
      matchObj.prediction = filterPredictionByShowFlags(prediction);
      
      matchObj.overGoals = [];
      if (prediction.showFlags?.over05Show) matchObj.overGoals.push({ label: "0.5", value: prediction.outcomes.over05 });
      if (prediction.showFlags?.over15Show) matchObj.overGoals.push({ label: "1.5", value: prediction.outcomes.over15 });
      if (prediction.showFlags?.over25Show) matchObj.overGoals.push({ label: "2.5", value: prediction.outcomes.over25 });
      if (prediction.showFlags?.over35Show) matchObj.overGoals.push({ label: "3.5", value: prediction.outcomes.over35 });
      if (prediction.showFlags?.over45Show) matchObj.overGoals.push({ label: "4.5", value: prediction.outcomes.over45 });
      if (prediction.showFlags?.over55Show) matchObj.overGoals.push({ label: "5.5", value: prediction.outcomes.over55 });
      if (prediction.showFlags?.over65Show) matchObj.overGoals.push({ label: "6.5", value: prediction.outcomes.over65 });
      if (prediction.showFlags?.over75Show) matchObj.overGoals.push({ label: "7.5", value: prediction.outcomes.over75 });
      if (prediction.showFlags?.over85Show) matchObj.overGoals.push({ label: "8.5", value: prediction.outcomes.over85 });
      if (prediction.showFlags?.over95Show) matchObj.overGoals.push({ label: "9.5", value: prediction.outcomes.over95 });
      
      if (prediction.manualCorners && prediction.manualCorners.overCorners) {
        matchObj.overCorners = prediction.manualCorners.overCorners;
      }
    }
    
    if (!leagueGroups.has(league.leagueId)) {
      leagueGroups.set(league.leagueId, {
        league: {
          id: league.leagueId,
          name: league.name,
          country: league.country,
          logo: league.logo
        },
        matches: []
      });
    }
    
    leagueGroups.get(league.leagueId).matches.push(matchObj);
  }
  
  const leaguesArray = Array.from(leagueGroups.values()).sort((a, b) => {
    const majorLeagues = [
      'England', 'Spain', 'Germany', 'Italy', 'France'
    ];
    
    const countryA = a.league.country || '';
    const countryB = b.league.country || '';
    
    const isMajorA = majorLeagues.includes(countryA);
    const isMajorB = majorLeagues.includes(countryB);
    
    if (isMajorA && isMajorB) {
      return majorLeagues.indexOf(countryA) - majorLeagues.indexOf(countryB);
    }
    
    if (isMajorA && !isMajorB) {
      return -1;
    }
    
    if (!isMajorA && isMajorB) {
      return 1;
    }
    
    return countryA.localeCompare(countryB);
  });
  
  const startIndex = (parseInt(page) - 1) * parseInt(limit);
  const endIndex = startIndex + parseInt(limit);
  const paginatedLeagues = leaguesArray.slice(startIndex, endIndex);
  
  const totalMatches = filteredMatches.length;
  const totalLeagues = leaguesArray.length;
  
  const totalPages = Math.ceil(totalLeagues / parseInt(limit));
  
  return res.status(200).json({
    success: true,
    message: `Homepage matches grouped by league with predictions${filter !== 'all' ? ` (filtered by ${filter})` : ''}`,
    data: {
      leagues: paginatedLeagues,
      totals: {
        leagues: totalLeagues,
        matches: totalMatches
      },
      pagination: {
        page: parseInt(page),
        totalPages,
        totalItems: totalLeagues,
        pageSize: parseInt(limit)
      }
    }
  });
});

export const getDashboardCounts = catchAsyncError(async (req, res) => {
  const now = new Date();
  const tomorrowStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dayAfterTomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  
  const simulated = await Match.countDocuments({ showOnHomepage: true });
  
  const upcoming = await Match.countDocuments({
    showOnHomepage: true,
    date: { $gte: tomorrowStart, $lte: dayAfterTomorrow },
    'status.short': { $in: ['NS', 'TBD', 'PST'] }
  });
  
  const PredictionStats = (await import('../models/predictionStatsModel.js')).default;
  const stats = await PredictionStats.findById('global');
  const won = stats?.wonTotal || 0;
  
  return sendSuccess(res, {
    data: {
      simulated,
      upcoming,
      won,
      message: 'Dashboard counts retrieved successfully'
    }
  });
});
