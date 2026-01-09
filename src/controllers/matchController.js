import Match from '../models/matchModel.js';
import League from '../models/leaugeModel.js';
import Team from '../models/teamModel.js';
import MatchPrediction from '../models/matchPredictionModel.js';
import { sendSuccess, sendError, sendPaginatedResponse } from '../utils/response.js';
import catchAsyncError from '../utils/catchAsync.js';

const addDoubleChanceToPrediction = (prediction) => {
  try {
    if (!prediction || !prediction.outcomes) return prediction;
    const o = prediction.outcomes;
    const round3 = (x) => Math.round(x * 1000) / 1000;
    o.doubleChance1X = round3((o.homeWin || 0) + (o.draw || 0));
    o.doubleChance12 = round3((o.homeWin || 0) + (o.awayWin || 0));
    o.doubleChanceX2 = round3((o.draw || 0) + (o.awayWin || 0));
    return prediction;
  } catch {
    return prediction;
  }
};

const selectPredictedData = (prediction) => {
  if (!prediction) return null;
  const p = typeof prediction.toObject === 'function' ? prediction.toObject() : prediction;
  return {
    modelPrediction: p.modelPrediction ? {
      homeScore: p.modelPrediction.homeScore,
      awayScore: p.modelPrediction.awayScore,
      confidence: p.modelPrediction.confidence
    } : null,
    outcomes: p.outcomes ? {
      homeWin: p.outcomes.homeWin,
      draw: p.outcomes.draw,
      awayWin: p.outcomes.awayWin,
      over05: p.outcomes.over05,
      over15: p.outcomes.over15,
      over25: p.outcomes.over25,
      over35: p.outcomes.over35,
      over45: p.outcomes.over45,
      over55: p.outcomes.over55,
      over65: p.outcomes.over65,
      over75: p.outcomes.over75,
      over85: p.outcomes.over85,
      over95: p.outcomes.over95,
      under25: p.outcomes.under25,
      btts: p.outcomes.btts,
      bttsYes: p.outcomes.bttsYes,
      bttsNo: p.outcomes.bttsNo,
      doubleChance1X: p.outcomes.doubleChance1X,
      doubleChance12: p.outcomes.doubleChance12,
      doubleChanceX2: p.outcomes.doubleChanceX2,
      homeWinBoolean: p.outcomes.homeWinBoolean,
      drawBoolean: p.outcomes.drawBoolean,
      awayWinBoolean: p.outcomes.awayWinBoolean,
      over25Boolean: p.outcomes.over25Boolean,
      under25Boolean: p.outcomes.under25Boolean,
      mostLikelyScore: p.outcomes.mostLikelyScore,
      cleanSheetHome: p.outcomes.cleanSheetHome,
      cleanSheetAway: p.outcomes.cleanSheetAway,
      exactScore: p.outcomes.exactScore
    } : null,
    manualCorners: p.manualCorners ? {
      overCorners: p.manualCorners.overCorners,
      underCorners: p.manualCorners.underCorners,
      cornerThreshold: p.manualCorners.cornerThreshold,
      cornerPrediction: p.manualCorners.cornerPrediction
    } : null,
    showFlags: p.showFlags ? {
      homeWinShow: p.showFlags.homeWinShow,
      drawShow: p.showFlags.drawShow,
      awayWinShow: p.showFlags.awayWinShow,
      over05Show: p.showFlags.over05Show,
      over15Show: p.showFlags.over15Show,
      over25Show: p.showFlags.over25Show,
      over35Show: p.showFlags.over35Show,
      over45Show: p.showFlags.over45Show,
      over55Show: p.showFlags.over55Show,
      over65Show: p.showFlags.over65Show,
      over75Show: p.showFlags.over75Show,
      over85Show: p.showFlags.over85Show,
      over95Show: p.showFlags.over95Show,
      bttsShow: p.showFlags.bttsShow,
      bttsYesShow: p.showFlags.bttsYesShow,
      bttsNoShow: p.showFlags.bttsNoShow,
      doubleChance1XShow: p.showFlags.doubleChance1XShow,
      doubleChance12Show: p.showFlags.doubleChance12Show,
      doubleChanceX2Show: p.showFlags.doubleChanceX2Show,
      overCornersShow: p.showFlags.overCornersShow,
      underCornersShow: p.showFlags.underCornersShow,
      cornerThresholdShow: p.showFlags.cornerThresholdShow,
      cornerPredictionShow: p.showFlags.cornerPredictionShow
    } : null,
    predictedAt: p.predictedAt
  };
};

export const getAllMatches = catchAsyncError(async (req, res) => {
  const { 
    page = 1, 
    limit = 20, 
    search = '', 
    status = '', 
    league = '',
    country = '',
    dateFrom = '',
    dateTo = '',
    sortBy = 'date',
    sortOrder = 'asc',
    trending = '',
    playOfDay = '',
    aiPicked = '',
    featured = ''
  } = req.query;

  const hasFilters = search || status || league || country || dateFrom || dateTo || 
                    trending || playOfDay || aiPicked || featured;

  if (!hasFilters) {
    return sendSuccess(res, {
      data: {
        currentPage: parseInt(page),
        totalPages: 0,
        totalItems: 0,
        items: {
          matches: [],
          filters: {
            search: search || null,
            status: status || null,
            leagueId: league || null,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
            trending: trending || null,
            playOfDay: playOfDay || null,
            aiPicked: aiPicked || null,
            featured: featured || null,
            sortBy: sortBy,
            sortOrder: sortOrder
          },
          message: "No filters provided - please specify search, status, league, country, dateFrom, dateTo, trending, playOfDay, aiPicked, or featured parameters to see matches"
        }
      },
      message: "No data returned - filters required"
    });
  }
  
  const filter = {};
  
  if (search) {
    const Team = (await import('../models/teamModel.js')).default;
    const League = (await import('../models/leaugeModel.js')).default;
    
    const [matchingTeams, matchingLeagues] = await Promise.all([
      Team.find({ name: { $regex: search, $options: 'i' } }).select('teamId'),
      League.find({ name: { $regex: search, $options: 'i' } }).select('leagueId')
    ]);
    
    const matchingTeamIds = matchingTeams.map(t => t.teamId);
    const matchingLeagueIds = matchingLeagues.map(l => l.leagueId);
    
    filter.$or = [
      { 'status.long': { $regex: search, $options: 'i' } },
      { homeTeam: { $in: matchingTeamIds } },
      { awayTeam: { $in: matchingTeamIds } },
      { leagueId: { $in: matchingLeagueIds } }
    ];
  }
  
  if (status) {
    if (status === 'all') {
    } else if (status === 'live') {
      filter['status.short'] = { $in: ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'] };
    } else if (status === 'finished') {
      filter['status.short'] = { $in: ['FT', 'AET', 'PEN'] };
    } else if (status === 'upcoming') {
      filter['status.short'] = { $in: ['NS', 'TBD', 'PST'] };
    } else {
      filter['status.short'] = status;
    }
  }
  
  if (country && league) {
    filter.leagueId = parseInt(league);
  } else if (country) {
    const League = (await import('../models/leaugeModel.js')).default;
    const countryLeagues = await League.find({ country: country }).select('leagueId');
    const countryLeagueIds = countryLeagues.map(l => l.leagueId);
    filter.leagueId = { $in: countryLeagueIds };
  } else if (league) {
    filter.leagueId = parseInt(league);
  }
  
  if (trending === 'true') filter.featured = true;
  if (trending === 'false') filter.featured = false;
  
  if (playOfDay === 'true') filter.playOfDay = true;
  if (playOfDay === 'false') filter.playOfDay = false;
  
  if (aiPicked === 'true') filter.aiPicked = true;
  if (aiPicked === 'false') filter.aiPicked = false;
  
  if (featured === 'true') filter.featured = true;
  if (featured === 'false') filter.featured = false;
  
  if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) filter.date.$gte = new Date(dateFrom);
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      filter.date.$lte = endOfDay;
    }
  }
  
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [matches, total] = await Promise.all([
    Match.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Match.countDocuments(filter)
  ]);
  
  const teamIds = [...new Set([
    ...matches.map(m => m.homeTeam),
    ...matches.map(m => m.awayTeam)
  ])];
  
  const Team = (await import('../models/teamModel.js')).default;
  const teams = await Team.find({ teamId: { $in: teamIds } }, 'teamId name logo');

  const leagueIds = [...new Set(matches.map(m => m.leagueId))];
  const League = (await import('../models/leaugeModel.js')).default;
  const leagues = await League.find({ leagueId: { $in: leagueIds } }, 'leagueId name country logo');

  const matchIds = matches.map(m => m._id);
  const MatchPrediction = (await import('../models/matchPredictionModel.js')).default;
  const predictions = await MatchPrediction.find({ match: { $in: matchIds } });
  
  const teamMap = {};
  teams.forEach(team => {
    teamMap[team.teamId] = { name: team.name, logo: team.logo };
  });
  const leagueMap = {};
  leagues.forEach(league => {
    leagueMap[league.leagueId] = { name: league.name, country: league.country, logo: league.logo };
  });
  const predictionMap = {};
  predictions.forEach(pred => {
    const obj = typeof pred.toObject === 'function' ? pred.toObject() : pred;
    predictionMap[pred.match.toString()] = addDoubleChanceToPrediction(obj);
  });
  
  const matchesWithTeams = matches.map(match => ({
    ...match,
    aiPicked: match.aiPicked,
    aiPickedAt: !!match.aiPickedAt,
    playOfDay: match.playOfDay,
    playOfDayAt: !!match.playOfDayAt,
    homeTeam: {
      id: match.homeTeam,
      ...teamMap[match.homeTeam] || { name: 'Unknown Team', logo: null }
    },
    awayTeam: {
      id: match.awayTeam,
      ...teamMap[match.awayTeam] || { name: 'Unknown Team', logo: null }
    },
    league: {
      id: match.leagueId,
      ...leagueMap[match.leagueId] || { name: 'Unknown League', country: 'Unknown', logo: null }
    },
    prediction: selectPredictedData(predictionMap[match._id.toString()] || null)
  }));

  const totalPages = Math.ceil(total / parseInt(limit));
  
  return sendPaginatedResponse(
    res,
    parseInt(page),
    totalPages,
    total,
    {
      matches: matchesWithTeams,
      filters: {
        search: search || null,
        status: status || null,
        leagueId: league || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        trending: trending || null,
        playOfDay: playOfDay || null,
        aiPicked: aiPicked || null,
        featured: featured || null,
        sortBy,
        sortOrder
      },
      message: `Found ${total} matches with applied filters`
    }
  );
});


export const getMatchById = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  
  const match = await Match.findById(id).lean();
  if (!match) {
    return sendError(res, { statusCode: 404, message: 'Match not found' });
  }

  const Team = (await import('../models/teamModel.js')).default;
  const [homeTeam, awayTeam] = await Promise.all([
    Team.findOne({ teamId: match.homeTeam }, 'teamId name logo'),
    Team.findOne({ teamId: match.awayTeam }, 'teamId name logo')
  ]);

  const matchWithTeams = {
    ...match,
    homeTeam: {
      id: match.homeTeam,
      name: homeTeam?.name || 'Unknown Team',
      logo: homeTeam?.logo || null
    },
    awayTeam: {
      id: match.awayTeam,
      name: awayTeam?.name || 'Unknown Team',
      logo: awayTeam?.logo || null
    }
  };
  
  return sendSuccess(res, { 
    data: matchWithTeams,
    message: `Match found: ${match.fixtureId}`
  });
});

export const getFeaturedMatches = catchAsyncError(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const [matches, total] = await Promise.all([
    Match.find({ featured: true })
      .sort({ featuredAt: -1, date: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Match.countDocuments({ featured: true })
  ]);

  const teamIds = [...new Set([
    ...matches.map(m => m.homeTeam),
    ...matches.map(m => m.awayTeam)
  ])];

  const matchIds = matches.map(m => m._id);
  
  const [teams, predictions] = await Promise.all([
    Team.find({ teamId: { $in: teamIds } }, 'teamId name logo'),
    MatchPrediction.find({ match: { $in: matchIds } })
      .select('-homeStats -awayStats -leagueAverages -dixonColesParams -simulations -manualCorners -inputHash -computationTime -modelVersion -confidenceThreshold -lastUpdated -predictedAt')
      .lean()
  ]);
  
  const teamMap = {};
  teams.forEach(team => {
    teamMap[team.teamId] = { name: team.name, logo: team.logo };
  });

  const predictionMap = {};
  predictions.forEach(prediction => {
    predictionMap[prediction.match.toString()] = prediction;
  });
  
  const matchesWithTeams = matches.map(match => ({
    ...match,
    homeTeam: {
      id: match.homeTeam,
      ...teamMap[match.homeTeam] || { name: 'Unknown Team', logo: null }
    },
    awayTeam: {
      id: match.awayTeam,
      ...teamMap[match.awayTeam] || { name: 'Unknown Team', logo: null }
    },
    prediction: predictionMap[match._id.toString()] || null
  }));

  const totalPages = Math.ceil(total / parseInt(limit));

  return sendPaginatedResponse(
    res,
    parseInt(page),
    totalPages,
    total,
    {
      matches: matchesWithTeams,
      total,
      message: 'Featured matches retrieved successfully'
    }
  );
});

export const getLiveMatches = catchAsyncError(async (req, res) => {
  const { leagueId, pred = '', predGte = '', pick = '', minConfidence = '', page = 1, limit = 20, nextDay = '' } = req.query;
  
  const now = new Date();
  
  const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'];
  const FINISHED_STATUSES = ['FT', 'AET', 'PEN'];
  
  let query;
  const isNextDay = String(nextDay).trim() === '1' || String(nextDay).toLowerCase() === 'true';
  if (isNextDay) {
    const tomorrowStartUtc = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0
    ));
    const tomorrowEndUtc = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      23, 59, 59, 999
    ));
    query = {
      'status.short': { $in: ['NS', 'TBD', 'PST'] },
      date: { $gte: tomorrowStartUtc, $lte: tomorrowEndUtc }
    };
  } else {
    const todayStartUtc = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0, 0, 0, 0
    ));
    const todayEndUtc = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23, 59, 59, 999
    ));
    
    query = {
      date: { $gte: todayStartUtc, $lte: todayEndUtc },
      'status.short': { $nin: FINISHED_STATUSES }
    };
  }
  
  if (leagueId) {
    query.leagueId = parseInt(leagueId);
  }
  
  const numericPage = parseInt(page);
  const numericLimit = parseInt(limit);
  const skip = (numericPage - 1) * numericLimit;

  const [matches, total] = await Promise.all([
    Match.find(query).sort({ date: 1 }).skip(skip).limit(numericLimit),
    Match.countDocuments(query)
  ]);
  
  const teamIds = [...new Set([
    ...matches.map(m => m.homeTeam),
    ...matches.map(m => m.awayTeam)
  ])];
  
  const leagueIds = [...new Set(matches.map(m => m.leagueId))];
  
  const Team = (await import('../models/teamModel.js')).default;
  const League = (await import('../models/leaugeModel.js')).default;
  const MatchPrediction = (await import('../models/matchPredictionModel.js')).default;
  
  const [teams, leagues, predictions] = await Promise.all([
    Team.find({ teamId: { $in: teamIds } }, 'teamId name logo'),
    League.find({ leagueId: { $in: leagueIds } }, 'leagueId name country logo'),
    MatchPrediction.find({ match: { $in: matches.map(m => m._id) } })
  ]);
  
  const teamMap = {};
  teams.forEach(team => {
    teamMap[team.teamId] = { name: team.name, logo: team.logo };
  });
  
  const leagueMap = {};
  leagues.forEach(league => {
    leagueMap[league.leagueId] = { name: league.name, country: league.country, logo: league.logo };
  });
  
  const predictionMap = {};
  predictions.forEach(prediction => {
    predictionMap[prediction.match.toString()] = prediction;
  });
  
  const matchesWithoutPredictions = matches.filter(match => 
    !predictionMap[match._id.toString()]
  );
  
  if (matchesWithoutPredictions.length > 0) {
    try {
      const matchPredictionService = (await import('../services/matchPredictionService.js')).default;
      
      const upcomingMatches = matchesWithoutPredictions.filter(match => 
        match.status.short === 'NS' || match.status.short === 'TBD'
      );
      
      if (upcomingMatches.length > 0) {
        console.log(`🔄 Auto-generating predictions for ${upcomingMatches.length} upcoming matches...`);
        
        const generationPromises = upcomingMatches.map(async (match) => {
          try {
            const prediction = await matchPredictionService.getOrGenerateMatchPrediction(match._id);
            return { matchId: match._id.toString(), prediction };
          } catch (error) {
            console.log(`⚠️ Failed to generate prediction for match ${match._id}:`, error.message);
            return { matchId: match._id.toString(), prediction: null };
          }
        });
        
        const newlyGeneratedPredictions = await Promise.all(generationPromises);
        
        newlyGeneratedPredictions.forEach(({ matchId, prediction }) => {
          if (prediction) {
            predictionMap[matchId] = prediction;
          }
        });
        
        console.log(`✅ Auto-generated ${newlyGeneratedPredictions.filter(p => p.prediction).length} predictions for upcoming matches`);
      } else {
        console.log(`ℹ️ No upcoming matches found for auto-generation. All ${matchesWithoutPredictions.length} matches are live/in-progress.`);
      }
    } catch (error) {
      console.log('⚠️ Error auto-generating predictions:', error.message);
    }
  }
  
  let matchesWithDetails = matches.map(match => {
    const matchObj = match.toObject();
    const matchPrediction = predictionMap[match._id.toString()];
    const predictionObj = matchPrediction
      ? (typeof matchPrediction.toObject === 'function' ? matchPrediction.toObject() : matchPrediction)
      : null;
    let trimmedPrediction = null;
    let overGoals = [];
    
    const overMap = [
      ['0.5','over05'], ['1.5','over15'], ['2.5','over25'], ['3.5','over35'],
      ['4.5','over45'], ['5.5','over55'], ['6.5','over65'], ['7.5','over75'],
      ['8.5','over85'], ['9.5','over95']
    ];
    
    if (predictionObj) {
      const { modelPrediction = null, outcomes = null, predictedAt = null, createdAt = null } = predictionObj;
      trimmedPrediction = {
        modelPrediction,
        outcomes,
        predictedAt: predictedAt || createdAt || null
      };
      if (outcomes && typeof outcomes === 'object') {
        overGoals = overMap
          .map(([label, key]) => ({ 
            label, 
            value: (outcomes && typeof outcomes[key] === 'number') ? outcomes[key] : 0 
          }));
      } else {
        overGoals = overMap.map(([label]) => ({ label, value: 0 }));
      }
    } else {
      overGoals = overMap.map(([label]) => ({ label, value: 0 }));
    }

    return {
      ...matchObj,
      homeTeam: {
        id: match.homeTeam,
        ...teamMap[match.homeTeam] || { name: 'Unknown Team', logo: null }
      },
      awayTeam: {
        id: match.awayTeam,
        ...teamMap[match.awayTeam] || { name: 'Unknown Team', logo: null }
      },
      league: {
        id: match.leagueId,
        ...leagueMap[match.leagueId] || { name: 'Unknown League', country: 'Unknown', logo: null }
      },
      prediction: trimmedPrediction,
      overGoals
    };
  });

  if (pred || pick || minConfidence) {
    const predKey = String(pred).trim();
    const threshold = predGte !== '' ? Number(predGte) : null;
    const pickKey = String(pick).toLowerCase();
    const minConf = minConfidence !== '' ? Number(minConfidence) : null;

    matchesWithDetails = matchesWithDetails.filter(m => {
      const p = m.prediction;
      if (!p) return false;

      if (minConf !== null && typeof p.modelPrediction?.confidence === 'number') {
        if (p.modelPrediction.confidence < minConf) return false;
      }

      if (predKey) {
        const val = p.outcomes?.[predKey];
        if (typeof val !== 'number') return false;
        if (threshold !== null && val < threshold) return false;
      }

      if (pickKey) {
        const hw = p.outcomes?.homeWin ?? -1;
        const dr = p.outcomes?.draw ?? -1;
        const aw = p.outcomes?.awayWin ?? -1;
        const max = Math.max(hw, dr, aw);
        const maxPick = max === hw ? 'home' : max === dr ? 'draw' : 'away';
        if (maxPick !== pickKey) return false;
      }

      return true;
    });
  }
    
  const grouped = {};
  for (const m of matchesWithDetails) {
    const key = m.league?.id || 'other';
    if (!grouped[key]) {
      grouped[key] = {
        league: m.league || { id: key, name: 'Unknown League', country: 'Unknown', logo: null },
        matches: []
      };
    }
    grouped[key].matches.push(m);
  }

  const TOP_LEAGUES = {
    39: { name: 'Premier League', country: 'England', priority: 1 },
    140: { name: 'La Liga', country: 'Spain', priority: 2 },
    78: { name: 'Bundesliga', country: 'Germany', priority: 3 },
    135: { name: 'Serie A', country: 'Italy', priority: 4 },
    61: { name: 'Ligue 1', country: 'France', priority: 5 }
  };

  const groupedLeagues = Object.values(grouped).sort((a, b) => {
    const aLeague = a.league;
    const bLeague = b.league;
    
    const aTopLeague = TOP_LEAGUES[aLeague?.id];
    const bTopLeague = TOP_LEAGUES[bLeague?.id];
    
    if (aTopLeague && bTopLeague) {
      return aTopLeague.priority - bTopLeague.priority;
    }
    
    if (aTopLeague && !bTopLeague) return -1;
    if (!aTopLeague && bTopLeague) return 1;
    
    const aCountry = aLeague?.country || 'Unknown';
    const bCountry = bLeague?.country || 'Unknown';
    
    if (aCountry !== bCountry) {
      return aCountry.localeCompare(bCountry);
    }
    
    return (aLeague?.name || '').localeCompare(bLeague?.name || '');
  });
  const totals = {
    leagues: groupedLeagues.length,
    matches: matchesWithDetails.length
  };
  const totalPages = Math.ceil(total / numericLimit);

  return sendSuccess(res, {
    data: {
      leagues: groupedLeagues,
      totals,
      pagination: {
        page: numericPage,
        totalPages,
        totalItems: total,
        pageSize: numericLimit
      }
    },
    message: isNextDay ? 'Upcoming matches for next day grouped by league with predictions' : 'Today\'s upcoming matches grouped by league with predictions'
  });
});

export const updateMatchScore = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  const { 
    homeScore, 
    awayScore, 
    status,
    events 
  } = req.body;

  const match = await Match.findById(id);
  if (!match) {
    return sendError(res, { statusCode: 404, message: 'Match not found' });
  }

  const updateData = {};
  
  if (homeScore !== undefined && awayScore !== undefined) {
    updateData['goals.home'] = homeScore;
    updateData['goals.away'] = awayScore;
    
    if (status === 'FT' || status === 'AET' || status === 'PEN') {
      updateData['score.fulltime.home'] = homeScore;
      updateData['score.fulltime.away'] = awayScore;
      
      if (status === 'AET' || status === 'PEN') {
        updateData['score.extratime.home'] = homeScore;
        updateData['score.extratime.away'] = awayScore;
      }
    }
  }

  if (status) {
    updateData['status.short'] = status;
    
    const statusMap = {
      'NS': 'Not Started',
      '1H': 'First Half',
      'HT': 'Halftime',
      '2H': 'Second Half',
      'ET': 'Extra Time',
      'BT': 'Break Time',
      'P': 'Penalty In Progress',
      'FT': 'Match Finished',
      'AET': 'Match Finished After Extra Time',
      'PEN': 'Match Finished After Penalty Shootout',
      'PST': 'Match Postponed',
      'CANC': 'Match Cancelled',
      'SUSP': 'Match Suspended',
      'ABD': 'Match Abandoned',
      'AWD': 'Technical Loss',
      'WO': 'WalkOver'
    };
    
    updateData['status.long'] = statusMap[status] || 'Unknown';
  }

  if (events && Array.isArray(events)) {
    updateData.events = events;
  }

  const updatedMatch = await Match.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true, runValidators: true }
  );

  return sendSuccess(res, {
    data: updatedMatch,
    message: 'Match score and status updated successfully'
  });
});

export const createMatch = catchAsyncError(async (req, res) => {
  const { fixtureId, leagueId, season, date, status, homeTeam, awayTeam, goals, score } = req.body;
  
  const existingMatch = await Match.findOne({ fixtureId });
  if (existingMatch) {
    return sendError(res, { 
      statusCode: 400, 
      message: 'Match with this fixture ID already exists' 
    });
  }
  
  const newMatch = new Match({
    fixtureId,
    leagueId,
    season,
    date,
    status,
    homeTeam,
    awayTeam,
    goals,
    score
  });
  
  await newMatch.save();
  
  return sendSuccess(res, { 
    statusCode: 201, 
    data: newMatch,
    message: 'Match created successfully' 
  });
});

export const updateMatch = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  
  const updatedMatch = await Match.findByIdAndUpdate(id, updateData, { 
    new: true, 
    runValidators: true 
  });
  
  if (!updatedMatch) {
    return sendError(res, { statusCode: 404, message: 'Match not found' });
  }
  
  return sendSuccess(res, { 
    data: updatedMatch,
    message: 'Match updated successfully' 
  });
});

export const deleteMatch = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  
  const match = await Match.findByIdAndDelete(id);
  
  if (!match) {
    return sendError(res, 'Match not found', 404);
  }
  
  try {
    const deletedPredictions = await MatchPrediction.deleteMany({ match: id });
  } catch (error) {
  }
  
  sendSuccess(res, { message: 'Match deleted successfully' });
});

export const toggleFeaturedMatch = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  const { featured } = req.body;

  if (typeof featured !== 'boolean') {
    return sendError(res, 'Featured status must be a boolean', 400);
  }

  const update = { 
    featured,
    updatedAt: Date.now()
  };

  if (featured) {
    update.featuredAt = Date.now();
  } else {
    update.$unset = { featuredAt: 1 };
  }

  const match = await Match.findByIdAndUpdate(
    id,
    update,
    { new: true, runValidators: true }
  );

  if (!match) {
    return sendError(res, 'Match not found', 404);
  }

  sendSuccess(res, { 
    message: `Match ${featured ? 'featured' : 'unfeatured'} successfully`,
    data: match 
  });
});

export const getPublishedMatches = catchAsyncError(async (req, res) => {
  const { 
    leagueId = '', 
    page = 1, 
    limit = 20, 
    status = '',
    dateFrom = '',
    dateTo = '',
    sortBy = 'date',
    sortOrder = 'asc'
  } = req.query;
  
  const League = (await import('../models/leaugeModel.js')).default;
  const activeLeagues = await League.find({ isActive: true }).select('leagueId name country');
  const activeLeagueIds = activeLeagues.map(league => league.leagueId);
  
  const filter = { 
    leagueId: { $in: activeLeagueIds },
    'status.short': { $nin: ['PST', 'CANC', 'ABD', 'AWD', 'WO'] }
  };
  
  if (leagueId) filter.leagueId = parseInt(leagueId);
  if (status) filter['status.short'] = status;
  
  if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) filter.date.$gte = new Date(dateFrom);
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      filter.date.$lte = endOfDay;
    }
  }
  
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [matches, total] = await Promise.all([
    Match.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Match.countDocuments(filter)
  ]);
  
  const totalPages = Math.ceil(total / parseInt(limit));
  
  const leagueBreakdown = await Match.aggregate([
    { $match: filter },
    { $group: { _id: '$leagueId', count: { $sum: 1 } } },
    { $lookup: {
        from: 'leagues',
        localField: '_id',
        foreignField: 'leagueId',
        as: 'league'
      }
    },
    { $unwind: '$league' },
    { $project: {
        _id: 0,
        leagueId: '$_id',
        name: '$league.name',
        country: '$league.country',
        matchCount: '$count'
      }
    },
    { $sort: { matchCount: -1 } }
  ]);
  
  const formattedBreakdown = {};
  leagueBreakdown.forEach(league => {
    formattedBreakdown[league.name] = {
      leagueId: league.leagueId,
      country: league.country,
      matchCount: league.matchCount
    };
  });
  
  const summary = {
    totalMatches: total,
    activeLeagues: activeLeagues.length,
    leagueBreakdown: formattedBreakdown,
    appliedFilters: {
      leagueId: leagueId || null,
      status: status || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      sortBy,
      sortOrder
    }
  };
  
  return sendPaginatedResponse(
    res,
    parseInt(page),
    totalPages,
    total,
    {
      matches,
      summary,
      message: `Found ${total} matches from ${activeLeagues.length} active leagues`
    }
  );
});

export const getMatchesByDate = catchAsyncError(async (req, res) => {
  const { date } = req.params;
  const { 
    page = 1, 
    limit = 20, 
    leagueId = '',
    status = '',
    timezone = 'UTC'
  } = req.query;
  
  const startDate = new Date(date);
  startDate.setUTCHours(0, 0, 0, 0);
  
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  
  const filter = {
    date: { $gte: startDate, $lt: endDate },
    'status.short': { $nin: ['PST', 'CANC', 'ABD', 'AWD', 'WO'] }
  };
  
  if (leagueId) filter.leagueId = parseInt(leagueId);
  if (status) filter['status.short'] = status;
  
  const League = (await import('../models/leaugeModel.js')).default;
  const activeLeagues = await League.find({ isActive: true }).select('leagueId name country');
  
  if (!leagueId) {
    const activeLeagueIds = activeLeagues.map(league => league.leagueId);
    filter.leagueId = { $in: activeLeagueIds };
  }
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [matches, total] = await Promise.all([
    Match.find(filter)
      .sort({ date: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate({
        path: 'leagueId',
        select: 'name country logo',
        match: { isActive: true }
      })
      .lean(),
    Match.countDocuments(filter)
  ]);
  
  const totalPages = Math.ceil(total / parseInt(limit));
  
  const matchesByLeague = {};
  const leagueInfo = {};
  
  matches.forEach(match => {
    const leagueId = match.leagueId?._id || 'other';
    
    if (!matchesByLeague[leagueId]) {
      matchesByLeague[leagueId] = [];
      
      if (match.leagueId) {
        leagueInfo[leagueId] = {
          name: match.leagueId.name,
          country: match.leagueId.country,
          logo: match.leagueId.logo
        };
      }
    }
    
    const { leagueId: _, ...matchWithoutLeague } = match;
    matchesByLeague[leagueId].push({
      ...matchWithoutLeague,
      league: leagueInfo[leagueId] || null
    });
  });
  
  const formattedLeagues = Object.entries(matchesByLeague).map(([leagueId, leagueMatches]) => ({
    leagueId: leagueId === 'other' ? null : leagueId,
    ...(leagueInfo[leagueId] || { name: 'Other Leagues' }),
    matches: leagueMatches,
    matchCount: leagueMatches.length
  }));
  
  return sendPaginatedResponse(
    res,
    parseInt(page),
    totalPages,
    total,
    {
      date,
      timezone,
      leagues: formattedLeagues,
      totalMatches: total,
      appliedFilters: {
        leagueId: leagueId || null,
        status: status || null,
        timezone
      },
      message: `Found ${total} matches on ${date} (${timezone} timezone)`
    }
  );
});

export const getMatchesByLeague = catchAsyncError(async (req, res) => {
  const { leagueId } = req.params;
  const { date = 'today', page = 1, limit = 20 } = req.query;
  
  const League = (await import('../models/leaugeModel.js')).default;
  const league = await League.findOne({ leagueId: parseInt(leagueId) });
  
  if (!league) {
    return sendError(res, { statusCode: 404, message: 'League not found' });
  }
  
  if (!league.isActive) {
    return sendError(res, { statusCode: 403, message: 'League is not active' });
  }
  
  const filter = { leagueId: parseInt(leagueId) };
  
  if (date === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    filter.date = { $gte: today, $lt: tomorrow };
  } else if (date === 'tomorrow') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    filter.date = { $gte: tomorrow, $lt: dayAfter };
  }
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [matches, total] = await Promise.all([
    Match.find(filter).sort({ date: 1 }).skip(skip).limit(parseInt(limit)),
    Match.countDocuments(filter)
  ]);
  
  const totalPages = Math.ceil(total / parseInt(limit));
  
  return sendPaginatedResponse(
    res,
    parseInt(page),
    totalPages,
    total,
    {
      matches,
      league: {
        id: league._id,
        leagueId: league.leagueId,
        name: league.name,
        country: league.country,
        isActive: league.isActive
      },
      message: `Found ${total} matches for ${league.name}`
    }
  );
});


export const markAsPlayOfTheDay = catchAsyncError(async (req, res) => {
  const { id } = req.params;

  const match = await Match.findById(id);
  if (!match) {
    return sendError(res, { statusCode: 404, message: 'Match not found' });
  }

  if (match.playOfDay) {
    return sendError(res, { 
      statusCode: 400, 
      message: 'Match is already marked as Play of the Day' 
    });
  }

  const currentPlayOfDayCount = await Match.countDocuments({ playOfDay: true });
  if (currentPlayOfDayCount >= 2) {
    return sendError(res, { 
      statusCode: 400, 
      message: 'Maximum limit of 2 Play of the Day matches reached. Please remove an existing Play of the Day match first.' 
    });
  }

  const updatedMatch = await Match.findByIdAndUpdate(
    id,
    { 
      playOfDay: true,
      playOfDayAt: new Date(),
      updatedAt: new Date()
    },
    { new: true, runValidators: true }
  );

  return sendSuccess(res, {
    data: updatedMatch,
    message: `Match marked as Play of the Day: ${updatedMatch.fixtureId}`
  });
});

export const removePlayOfTheDay = catchAsyncError(async (req, res) => {
  const { id } = req.params;

  const match = await Match.findById(id);
  if (!match) {
    return sendError(res, { statusCode: 404, message: 'Match not found' });
  }

  if (!match.playOfDay) {
    return sendError(res, { 
      statusCode: 400, 
      message: 'Match is not marked as Play of the Day' 
    });
  }

  const updatedMatch = await Match.findByIdAndUpdate(
    id,
    { 
      playOfDay: false,
      $unset: { 
        playOfDayAt: 1
      },
      updatedAt: new Date()
    },
    { new: true, runValidators: true }
  );

  return sendSuccess(res, {
    data: updatedMatch,
    message: `Play of the Day status removed from match: ${updatedMatch.fixtureId}`
  });
});

export const getPlayOfTheDayMatches = catchAsyncError(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [matches, total] = await Promise.all([
    Match.find({ playOfDay: true })
      .sort({ playOfDayAt: -1, date: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Match.countDocuments({ playOfDay: true })
  ]);

  const teamIds = [...new Set([
    ...matches.map(m => m.homeTeam),
    ...matches.map(m => m.awayTeam)
  ])];
  
  const Team = (await import('../models/teamModel.js')).default;
  const teams = await Team.find({ teamId: { $in: teamIds } }, 'teamId name logo');
  
  const teamMap = {};
  teams.forEach(team => {
    teamMap[team.teamId] = { name: team.name, logo: team.logo };
  });

  const MatchPrediction = (await import('../models/matchPredictionModel.js')).default;
  const matchIds = matches.map(match => match._id);
  const predictions = matchIds.length > 0
    ? await MatchPrediction.find({ match: { $in: matchIds } })
    : [];
  
  const predictionMap = {};
  predictions.forEach(pred => {
    if (pred.match) {
      predictionMap[pred.match.toString()] = pred;
    }
  });

  const buildOverGoals = (prediction) => {
    const overMap = [
      ['0.5','over05'], ['1.5','over15'], ['2.5','over25'], ['3.5','over35'],
      ['4.5','over45'], ['5.5','over55'], ['6.5','over65'], ['7.5','over75'],
      ['8.5','over85'], ['9.5','over95']
    ];
    
    if (prediction && prediction.outcomes) {
      return overMap.map(([label, key]) => ({ 
        label, 
        value: (prediction.outcomes && typeof prediction.outcomes[key] === 'number') ? prediction.outcomes[key] : 0 
      }));
    }
    return overMap.map(([label]) => ({ label, value: 0 }));
  };
  
  const matchesWithTeams = matches.map(match => {
    const prediction = predictionMap[match._id.toString()];
    const predictionObj = prediction
      ? (typeof prediction.toObject === 'function' ? prediction.toObject() : prediction)
      : null;
    
    let trimmedPrediction = null;
    if (predictionObj) {
      const { modelPrediction = null, outcomes = null, predictedAt = null, createdAt = null } = predictionObj;
      trimmedPrediction = {
        modelPrediction,
        outcomes,
        predictedAt: predictedAt || createdAt || null
      };
    }

    return {
      ...match,
      homeTeam: {
        id: match.homeTeam,
        ...teamMap[match.homeTeam] || { name: 'Unknown Team', logo: null }
      },
      awayTeam: {
        id: match.awayTeam,
        ...teamMap[match.awayTeam] || { name: 'Unknown Team', logo: null }
      },
      prediction: trimmedPrediction,
      overGoals: buildOverGoals(predictionObj)
    };
  });

  const totalPages = Math.ceil(total / parseInt(limit));

  return sendPaginatedResponse(
    res,
    parseInt(page),
    totalPages,
    total,
    {
      matches: matchesWithTeams,
      message: `Found ${total} Play of the Day matches`
    }
  );
});


export const markAsAIPick = catchAsyncError(async (req, res) => {
  const { id } = req.params;

  const match = await Match.findById(id);
  if (!match) {
    return sendError(res, { statusCode: 404, message: 'Match not found' });
  }

  if (match.aiPicked) {
    return sendError(res, { 
      statusCode: 400, 
      message: 'Match is already marked as AI Pick' 
    });
  }

  const currentAIPickCount = await Match.countDocuments({ aiPicked: true });
  if (currentAIPickCount >= 2) {
    return sendError(res, { 
      statusCode: 400, 
      message: 'Maximum limit of 2 AI Pick matches reached. Please remove an existing AI Pick match first.' 
    });
  }

  const updatedMatch = await Match.findByIdAndUpdate(
    id,
    { 
      aiPicked: true,
      aiPickedAt: new Date(),
      updatedAt: new Date()
    },
    { new: true, runValidators: true }
  );

  return sendSuccess(res, {
    data: updatedMatch,
    message: `Match marked as AI Pick: ${updatedMatch.fixtureId}`
  });
});

export const removeAIPick = catchAsyncError(async (req, res) => {
  const { id } = req.params;

  const match = await Match.findById(id);
  if (!match) {
    return sendError(res, { statusCode: 404, message: 'Match not found' });
  }

  if (!match.aiPicked) {
    return sendError(res, { 
      statusCode: 400, 
      message: 'Match is not marked as AI Pick' 
    });
  }

  const updatedMatch = await Match.findByIdAndUpdate(
    id,
    { 
      aiPicked: false,
      $unset: { 
        aiPickedAt: 1
      },
      updatedAt: new Date()
    },
    { new: true, runValidators: true }
  );

  return sendSuccess(res, {
    data: updatedMatch,
    message: `AI Pick status removed from match: ${updatedMatch.fixtureId}`
  });
});

export const getAIPickMatches = catchAsyncError(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [matches, total] = await Promise.all([
    Match.find({ aiPicked: true })
      .sort({ aiPickedAt: -1, date: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Match.countDocuments({ aiPicked: true })
  ]);

  const teamIds = [...new Set([
    ...matches.map(m => m.homeTeam),
    ...matches.map(m => m.awayTeam)
  ])];
  
  const Team = (await import('../models/teamModel.js')).default;
  const teams = await Team.find({ teamId: { $in: teamIds } }, 'teamId name logo');
  
  const teamMap = {};
  teams.forEach(team => {
    teamMap[team.teamId] = { name: team.name, logo: team.logo };
  });

  const MatchPrediction = (await import('../models/matchPredictionModel.js')).default;
  const matchIds = matches.map(match => match._id);
  const predictions = matchIds.length > 0
    ? await MatchPrediction.find({ match: { $in: matchIds } })
    : [];
  
  const predictionMap = {};
  predictions.forEach(pred => {
    if (pred.match) {
      predictionMap[pred.match.toString()] = pred;
    }
  });

  const buildOverGoals = (prediction) => {
    const overMap = [
      ['0.5','over05'], ['1.5','over15'], ['2.5','over25'], ['3.5','over35'],
      ['4.5','over45'], ['5.5','over55'], ['6.5','over65'], ['7.5','over75'],
      ['8.5','over85'], ['9.5','over95']
    ];
    
    if (prediction && prediction.outcomes) {
      return overMap.map(([label, key]) => ({ 
        label, 
        value: (prediction.outcomes && typeof prediction.outcomes[key] === 'number') ? prediction.outcomes[key] : 0 
      }));
    }
    return overMap.map(([label]) => ({ label, value: 0 }));
  };
  
  const matchesWithTeams = matches.map(match => {
    const prediction = predictionMap[match._id.toString()];
    const predictionObj = prediction
      ? (typeof prediction.toObject === 'function' ? prediction.toObject() : prediction)
      : null;
    
    let trimmedPrediction = null;
    if (predictionObj) {
      const { modelPrediction = null, outcomes = null, predictedAt = null, createdAt = null } = predictionObj;
      trimmedPrediction = {
        modelPrediction,
        outcomes,
        predictedAt: predictedAt || createdAt || null
      };
    }

    return {
      ...match,
      homeTeam: {
        id: match.homeTeam,
        ...teamMap[match.homeTeam] || { name: 'Unknown Team', logo: null }
      },
      awayTeam: {
        id: match.awayTeam,
        ...teamMap[match.awayTeam] || { name: 'Unknown Team', logo: null }
      },
      prediction: trimmedPrediction,
      overGoals: buildOverGoals(predictionObj)
    };
  });

  const totalPages = Math.ceil(total / parseInt(limit));

  return sendPaginatedResponse(
    res,
    parseInt(page),
    totalPages,
    total,
    {
      matches: matchesWithTeams,
      message: `Found ${total} AI Pick matches`
    }
  );
});

export const getAIPickMatchById = catchAsyncError(async (req, res) => {
  const { id } = req.params;

  const match = await Match.findOne({ 
    _id: id, 
    aiPicked: true 
  }).lean();

  if (!match) {
    return sendError(res, { 
      statusCode: 404, 
      message: 'AI Pick match not found' 
    });
  }

  const Team = (await import('../models/teamModel.js')).default;
  const [homeTeam, awayTeam] = await Promise.all([
    Team.findOne({ teamId: match.homeTeam }, 'teamId name logo'),
    Team.findOne({ teamId: match.awayTeam }, 'teamId name logo')
  ]);

  const matchWithTeams = {
    ...match,
    homeTeam: {
      id: match.homeTeam,
      name: homeTeam?.name || 'Unknown Team',
      logo: homeTeam?.logo || null
    },
    awayTeam: {
      id: match.awayTeam,
      name: awayTeam?.name || 'Unknown Team',
      logo: awayTeam?.logo || null
    }
  };

  return sendSuccess(res, {
    data: matchWithTeams,
    message: 'AI Pick match retrieved successfully'
  });
});


export const getDashboardStats = catchAsyncError(async (req, res) => {
  const now = new Date();
  const nowUtc = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));
  
  const todayEnd = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    23, 59, 59, 999
  ));
  
  const [
    liveMatches,
    activeLeagues,
    trendingMatches,
    showOnHomepageMatches
  ] = await Promise.all([
    Match.countDocuments({
      'status.short': { $in: ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'] },
      date: { $gte: nowUtc, $lte: todayEnd }
    }),
    
    League.countDocuments({ isActive: true }),
    
    Match.countDocuments({ featured: true }),
    
    Match.countDocuments({ 
      showOnHomepage: true
    })
  ]);

  const stats = {
    liveMatches,
    whitelistedLeagues: activeLeagues,
    trendingMatches,
    showOnHomepageMatches
  };

  return sendSuccess(res, {
    data: stats,
    message: 'Dashboard statistics retrieved successfully'
  });
});

export const getUpcomingMatches = catchAsyncError(async (req, res) => {
  const days = Number(req.query.days || 1);
  const NOT_STARTED = ['NS', 'TBD', 'PST'];

  const now = new Date();
  const tomorrowStartUtc = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  const endUtc = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + days,
    23, 59, 59, 999
  ));

  const query = {
    date: { $gte: tomorrowStartUtc, $lte: endUtc },
    'status.short': { $in: NOT_STARTED }
  };

  const matches = await Match.find(query).sort({ date: 1 });
  const total = matches.length;

  const MatchPrediction = (await import('../models/matchPredictionModel.js')).default;
  const League = (await import('../models/leaugeModel.js')).default;
  const matchIds = matches.map(m => m._id);
  const leagueIds = [...new Set(matches.map(m => m.leagueId))];
  const predictions = matchIds.length > 0
    ? await MatchPrediction.find({ match: { $in: matchIds } })
        .select('match modelPrediction outcomes predictedAt')
    : [];
  const predMap = new Map(predictions.map(p => [String(p.match), p]));
  const leagues = leagueIds.length > 0
    ? await League.find({ leagueId: { $in: leagueIds } }, 'leagueId name country logo')
    : [];
  const leagueMap = new Map(leagues.map(l => [l.leagueId, l]));
  const items = matches
    .map(m => ({ match: m, prediction: predMap.get(String(m._id)) || null, league: leagueMap.get(m.leagueId) || null }))
    .filter(item => item.prediction !== null);

  return sendSuccess(res, {
    data: {
      matches: items,
      total: items.length,
      windowDays: days,
      range: { from: tomorrowStartUtc, to: endUtc }
    },
    message: `Found ${items.length} upcoming matches with predictions in next ${days} day(s)`
  });
});

export const getUpcomingMatchesCount = catchAsyncError(async (req, res) => {
  const days = Number(req.query.days || 2);
  const NOT_STARTED = ['NS', 'TBD', 'PST'];

  const now = new Date();
  const tomorrowStartUtc = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  const endUtc = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + days,
    23, 59, 59, 999
  ));

  const query = {
    date: { $gte: tomorrowStartUtc, $lte: endUtc },
    'status.short': { $in: NOT_STARTED }
  };

  const totalMatches = await Match.countDocuments(query);

  const matchIds = await Match.find(query).distinct('_id');
  
  const MatchPrediction = (await import('../models/matchPredictionModel.js')).default;
  const matchesWithPredictions = matchIds.length > 0 
    ? await MatchPrediction.countDocuments({ match: { $in: matchIds } })
    : 0;

  return sendSuccess(res, {
    data: {
      totalMatches,
      matchesWithPredictions,
      matchesWithoutPredictions: totalMatches - matchesWithPredictions,
      windowDays: days,
      range: { from: tomorrowStartUtc, to: endUtc }
    },
    message: `Upcoming matches count for the next ${days} day(s)`
  });
});

export const getLiveMatchesCount = catchAsyncError(async (req, res) => {
  const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'];
  
  const liveMatches = await Match.countDocuments({
    'status.short': { $in: LIVE_STATUSES }
  });
  
  const liveMatchesList = await Match.find({
    'status.short': { $in: LIVE_STATUSES }
  }).select('_id leagueId status date homeTeam awayTeam');
  
  const matchIds = liveMatchesList.map(match => match._id);
  const MatchPrediction = (await import('../models/matchPredictionModel.js')).default;
  const matchesWithPredictions = matchIds.length > 0 
    ? await MatchPrediction.countDocuments({ match: { $in: matchIds } })
    : 0;
  
  const leagueCounts = await Match.aggregate([
    { $match: { 'status.short': { $in: LIVE_STATUSES } } },
    {
      $group: {
        _id: '$leagueId',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);
  
  const League = (await import('../models/leaugeModel.js')).default;
  const leagueIds = leagueCounts.map(l => l._id);
  const leagues = await League.find({ leagueId: { $in: leagueIds } }, 'leagueId name country');
  const leagueMap = {};
  leagues.forEach(league => {
    leagueMap[league.leagueId] = { name: league.name, country: league.country };
  });
  
  const leagueCountsWithDetails = leagueCounts.map(item => ({
    leagueId: item._id,
    count: item.count,
    ...leagueMap[item._id] || { name: 'Unknown League', country: 'Unknown' }
  }));
  
  return sendSuccess(res, {
    data: {
      liveMatches,
      matchesWithPredictions,
      matchesWithoutPredictions: liveMatches - matchesWithPredictions,
      leagueCounts: leagueCountsWithDetails,
      timestamp: new Date().toISOString()
    },
    message: 'Live matches count (currently playing only)'
  });
});

export const getLiveMatchData = catchAsyncError(async (req, res) => {
  const { matchId, fixtureId } = req.query;
  
  let match;
  if (matchId) {
    match = await Match.findById(matchId);
  } else if (fixtureId) {
    match = await Match.findOne({ fixtureId: parseInt(fixtureId) });
  } else {
    return sendError(res, { 
      statusCode: 400, 
      message: 'Either matchId or fixtureId is required' 
    });
  }
  
  if (!match) {
    return sendError(res, { 
      statusCode: 404, 
      message: 'Match not found in database' 
    });
  }
  
  const responseData = {
    match: {
      id: match._id,
      fixtureId: match.fixtureId,
      date: match.date
    },
    liveData: {
      status: {
        short: match.status?.short || 'NS',
        long: match.status?.long || 'Not Started',
        elapsed: match.status?.elapsed || 0
      },
      goals: {
        home: match.goals?.home || 0,
        away: match.goals?.away || 0
      },
      score: {
        halftime: match.score?.halftime || { home: 0, away: 0 },
        fulltime: match.score?.fulltime || { home: 0, away: 0 },
        extratime: match.score?.extratime || { home: 0, away: 0 }
      }
    },
    lastUpdated: match.updatedAt || match.createdAt
  };
  
  return sendSuccess(res, {
    data: responseData,
    message: 'Live match data retrieved successfully from database (third-party data stored by cron jobs)'
  });
});

export const getHomepageMatchesScores = catchAsyncError(async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const numericPage = parseInt(page);
    const numericLimit = parseInt(limit);
    const skip = (numericPage - 1) * numericLimit;

    const total = await Match.countDocuments({ showOnHomepage: true });

    const matches = await Match.find({ showOnHomepage: true })
      .select('_id fixtureId leagueId date status goals score')
      .sort({ date: 1 })
      .skip(skip)
      .limit(numericLimit);

    const leagueIds = [...new Set(matches.map(m => m.leagueId))];
    const League = (await import('../models/leaugeModel.js')).default;
    const leagues = await League.find({ leagueId: { $in: leagueIds } });
    const leagueMap = new Map(leagues.map(l => [l.leagueId, l]));

    const matchesWithScores = matches.map(match => {
      const league = leagueMap.get(match.leagueId);
      
      return {
        matchId: match._id,
        fixtureId: match.fixtureId,
        date: match.date,
        league: league ? {
          id: league.leagueId,
          name: league.name,
          country: league.country,
          logo: league.logo
        } : null,
        status: {
          short: match.status?.short || 'NS',
          long: match.status?.long || 'Not Started',
          elapsed: match.status?.elapsed || 0
        },
        goals: {
          home: match.goals?.home || 0,
          away: match.goals?.away || 0
        },
        score: {
          halftime: match.score?.halftime || { home: 0, away: 0 },
          fulltime: match.score?.fulltime || { home: 0, away: 0 },
          extratime: match.score?.extratime || { home: null, away: null }
        }
      };
    });

    const totalPages = Math.ceil(total / numericLimit);

    return sendPaginatedResponse(
      res,
      numericPage,
      totalPages,
      total,
      {
        matches: matchesWithScores,
        message: 'Homepage matches with score data retrieved successfully'
      }
    );

  } catch (error) {
    console.error('Error fetching homepage matches scores:', error);
    return sendError(res, { 
      statusCode: 500, 
      message: 'Failed to fetch homepage matches scores' 
    });
  }
});

export const getAllCountries = catchAsyncError(async (req, res) => {
  try {
    
    const countries = await League.distinct('country', {});
    
    console.log('All countries from database:', countries);
    
    const cleanCountries = countries
      .filter(country => country && country.trim() !== '')
      .map(country => country.trim())
      .filter((country, index, arr) => arr.indexOf(country) === index);
    
    const sortedCountries = cleanCountries.sort();

    const worldKeywords = ['Champions League', 'Europa League', 'Conference League', 'World Cup', 'Euro', 'Nations League', 'Club World Cup'];
    const hasWorldLeagues = await League.exists({
      $or: worldKeywords.map(keyword => ({
        name: { $regex: keyword, $options: 'i' }
      }))
    });

    let countriesList = sortedCountries;
    if (hasWorldLeagues && !countriesList.includes('World')) {
      countriesList = ['World', ...sortedCountries];
    }

    return sendSuccess(res, {
      data: {
        countries: countriesList,
        totalCountries: countriesList.length
      },
      message: 'All countries retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching countries:', error);
    return sendError(res, { 
      statusCode: 500, 
      message: 'Failed to fetch countries' 
    });
  }
});

export const getLeaguesByCountry = catchAsyncError(async (req, res) => {
  try {
    const { country } = req.query;
    
    if (!country) {
      return sendError(res, { 
        statusCode: 400, 
        message: 'Country parameter is required' 
      });
    }

    let query = { isActive: true };
    
    if (country === 'World') {
      const worldKeywords = ['Champions League', 'Europa League', 'Conference League', 'World Cup', 'Euro', 'Nations League', 'Club World Cup'];
      query.$and = [
        { isActive: true },
        {
          $or: worldKeywords.map(keyword => ({
            name: { $regex: keyword, $options: 'i' }
          }))
        }
      ];
    } else {
      query.country = country;
    }

    const leagues = await League.find(query)
      .select('leagueId name country logo')
      .sort({ name: 1 });

    return sendSuccess(res, {
      data: {
        country: country,
        leagues: leagues,
        totalLeagues: leagues.length
      },
      message: `Leagues for ${country} retrieved successfully`
    });

  } catch (error) {
    console.error('Error fetching leagues by country:', error);
    return sendError(res, { 
      statusCode: 500, 
      message: 'Failed to fetch leagues by country' 
    });
  }
});

export const getMatchesByLeagueForAdmin = catchAsyncError(async (req, res) => {
  try {
    const leagueId = req.params.leagueId || req.query.leagueId;
    const { page = 1, limit = 20 } = req.query;
    
    if (!leagueId) {
      return sendError(res, { 
        statusCode: 400, 
        message: 'leagueId parameter is required' 
      });
    }

    const numericPage = parseInt(page);
    const numericLimit = parseInt(limit);
    const skip = (numericPage - 1) * numericLimit;

    const total = await Match.countDocuments({ leagueId: parseInt(leagueId) });

    const matches = await Match.find({ leagueId: parseInt(leagueId) })
      .select('_id fixtureId date status goals score homeTeam awayTeam leagueId')
      .sort({ date: 1 })
      .skip(skip)
      .limit(numericLimit);

    const teamIds = [...new Set([...matches.map(m => m.homeTeam), ...matches.map(m => m.awayTeam)])];
    
    const [teams, leagues] = await Promise.all([
      Team.find({ teamId: { $in: teamIds } }),
      League.find({ leagueId: parseInt(leagueId) })
    ]);

    const teamMap = new Map(teams.map(t => [t.teamId, t]));
    const leagueMap = new Map(leagues.map(l => [l.leagueId, l]));

    const matchesWithDetails = matches.map(match => {
      const homeTeam = teamMap.get(match.homeTeam);
      const awayTeam = teamMap.get(match.awayTeam);

      return {
        matchId: match._id,
        fixtureId: match.fixtureId,
        date: match.date,
        status: {
          short: match.status?.short || 'NS',
          long: match.status?.long || 'Not Started',
          elapsed: match.status?.elapsed || 0
        },
        goals: {
          home: match.goals?.home || 0,
          away: match.goals?.away || 0
        },
        homeTeam: {
          id: homeTeam?.teamId || match.homeTeam,
          name: homeTeam?.name || 'Unknown Team',
          logo: homeTeam?.logo
        },
        awayTeam: {
          id: awayTeam?.teamId || match.awayTeam,
          name: awayTeam?.name || 'Unknown Team',
          logo: awayTeam?.logo
        }
      };
    });

    const totalPages = Math.ceil(total / numericLimit);

    return sendPaginatedResponse(
      res,
      numericPage,
      totalPages,
      total,
      {
        matches: matchesWithDetails,
        leagueId: parseInt(leagueId),
        message: `Matches for league ${leagueId} retrieved successfully`
      }
    );

  } catch (error) {
    console.error('Error fetching matches by league for admin:', error);
    return sendError(res, { 
      statusCode: 500, 
      message: 'Failed to fetch matches by league for admin' 
    });
  }
});

