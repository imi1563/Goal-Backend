import { 
  getMatchPredictionsWithDetails, 
  getOrGenerateMatchPrediction, 
  generatePredictionsForMatches,
  processMatchPredictions 
} from '../services/matchPredictionService.js';
import catchAsyncError from '../utils/catchAsync.js';
import { sendSuccess, sendError } from '../utils/response.js';

export const getPredictionSummary = catchAsyncError(async (req, res) => {
  const PredictionStats = (await import('../models/predictionStatsModel.js')).default;
  const Match = (await import('../models/matchModel.js')).default;
  const MatchPrediction = (await import('../models/matchPredictionModel.js')).default;
  
  const stats = await PredictionStats.findById('global');
  
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
    now.getUTCDate() + 2,
    23, 59, 59, 999
  ));

  const upcomingQuery = {
    date: { $gte: tomorrowStartUtc, $lte: endUtc },
    'status.short': { $in: ['NS', 'TBD', 'PST'] }
  };

  const upcomingMatchIds = await Match.find(upcomingQuery).distinct('_id');
  
  const upcomingMatchesWithPredictions = upcomingMatchIds.length > 0 
    ? await MatchPrediction.countDocuments({ match: { $in: upcomingMatchIds } })
    : 0;

  const homepageMatchesCount = await Match.countDocuments({ showOnHomepage: true });

  const upcomingMatchesCount = await Match.countDocuments(upcomingQuery);

  const FIELDS_CONSIDERED = ['doubleChance1X','doubleChanceX2','btts','over25','under25','corners'];
  const upcomingPerFieldCount = {};
  FIELDS_CONSIDERED.forEach(field => {
    upcomingPerFieldCount[field] = upcomingMatchesWithPredictions;
  });

  const baseStats = stats || {
    _id: 'global',
    simulatedTotal: 0,
    wonTotal: 0,
    perFieldSimulated: {},
    perFieldWon: {},
    fieldsConsidered: []
  };

  const finalWonTotal = baseStats.wonTotal || 0;

  return sendSuccess(res, {
    data: {
      homepageMatchesCount,
      upcomingMatchesCount,
      wonTotal: finalWonTotal
    },
    message: 'Prediction summary retrieved successfully'
  });
});

export const migratePredictionStats = catchAsyncError(async (_req, res) => {
  const PredictionStats = (await import('../models/predictionStatsModel.js')).default;
  
  const FIELDS_CONSIDERED = ['doubleChance1X','doubleChanceX2','btts','over25','under25','corners'];
  
  await PredictionStats.updateOne(
    { _id: 'global' },
    { 
      $set: { 
        simulatedTotal: 0, 
        wonTotal: 0, 
        perFieldSimulated: Object.fromEntries(FIELDS_CONSIDERED.map(f => [f, 0])),
        perFieldWon: Object.fromEntries(FIELDS_CONSIDERED.map(f => [f, 0])),
        fieldsConsidered: FIELDS_CONSIDERED 
      } 
    },
    { upsert: true }
  );
  
  return sendSuccess(res, { 
    data: { migrated: true, newFields: FIELDS_CONSIDERED }, 
    message: 'Prediction stats migrated to new field structure' 
  });
});

export const processAllFinishedMatches = catchAsyncError(async (_req, res) => {
  const { processFinishedMatchesOnce } = await import('../cron/matchResultProcessor.js');
  await processFinishedMatchesOnce();
  return sendSuccess(res, { data: { processed: true } , message: 'Triggered processing of all finished matches' });
});

export const backfillPredictionStats = catchAsyncError(async (req, res) => {
  const PredictionStats = (await import('../models/predictionStatsModel.js')).default;
  const MatchPrediction = (await import('../models/matchPredictionModel.js')).default;
  const Match = (await import('../models/matchModel.js')).default;

  const reset = String(req.query.reset ?? 'true') !== 'false';
  const FIELDS_CONSIDERED = ['doubleChance1X','doubleChanceX2','btts','over25','under25','corners'];
  const FINISHED = ['FT','AET','PEN'];

  if (reset) {
    await PredictionStats.updateOne(
      { _id: 'global' },
      { $set: { simulatedTotal: 0, wonTotal: 0, perFieldSimulated: {}, perFieldWon: {}, fieldsConsidered: FIELDS_CONSIDERED } },
      { upsert: true }
    );
  }

  let simulatedTotal = 0;
  const perFieldSimulated = Object.fromEntries(FIELDS_CONSIDERED.map(f => [f, 0]));
  let wonTotal = 0;
  const perFieldWon = Object.fromEntries(FIELDS_CONSIDERED.map(f => [f, 0]));

  const predictions = await MatchPrediction.find({}, { match: 1 });
  const matchIds = predictions.map(p => p.match);

  simulatedTotal = predictions.length * FIELDS_CONSIDERED.length;
  for (const f of FIELDS_CONSIDERED) perFieldSimulated[f] = predictions.length;

  const matches = await Match.find({ _id: { $in: matchIds }, 'status.short': { $in: FINISHED } }, { goals: 1 });
  const finishedMap = new Map(matches.map(m => [String(m._id), m]));

  for (const p of predictions) {
    const m = finishedMap.get(String(p.match));
    if (!m) continue;
    const ah = m?.goals?.home ?? null;
    const aa = m?.goals?.away ?? null;
    const totalCorners = m?.corners?.total ?? null;
    if (ah === null || aa === null) continue;
    
    const actualOutcome = ah > aa ? 'home' : (ah < aa ? 'away' : 'draw');
    const totalGoals = (ah || 0) + (aa || 0);
    const winningFields = [];
    
    if (actualOutcome === 'home' || actualOutcome === 'draw') winningFields.push('doubleChance1X');
    
    if (actualOutcome === 'draw' || actualOutcome === 'away') winningFields.push('doubleChanceX2');
    
    if (ah > 0 && aa > 0) winningFields.push('btts');
    
    if (totalGoals > 2.5) winningFields.push('over25');
    
    if (totalGoals < 2.5) winningFields.push('under25');
    
    if (totalCorners !== null && p.manualCorners?.cornerPrediction) {
      const { cornerPrediction, cornerThreshold } = p.manualCorners;
      if (cornerPrediction === 'over' && totalCorners > cornerThreshold) {
        winningFields.push('corners');
      } else if (cornerPrediction === 'under' && totalCorners < cornerThreshold) {
        winningFields.push('corners');
      }
    }
    
    if (winningFields.length > 0) {
      wonTotal += 1;
      for (const f of winningFields) perFieldWon[f] += 1;
    }
  }

  await PredictionStats.updateOne(
    { _id: 'global' },
    {
      $inc: {
        simulatedTotal,
        wonTotal,
        ...Object.fromEntries(Object.entries(perFieldSimulated).map(([k,v]) => [`perFieldSimulated.${k}`, v])),
        ...Object.fromEntries(Object.entries(perFieldWon).map(([k,v]) => [`perFieldWon.${k}`, v]))
      },
      $setOnInsert: { fieldsConsidered: FIELDS_CONSIDERED }
    },
    { upsert: true }
  );

  const updated = await PredictionStats.findById('global');
  return sendSuccess(res, { data: updated, message: 'Prediction stats backfilled successfully' });
});

export const getMatchPredictions = catchAsyncError(async (req, res) => {
  const filters = {
    status: req.query.status,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    limit: parseInt(req.query.limit) || 50
  };

  const predictions = await getMatchPredictionsWithDetails(filters);
  
  sendSuccess(res, {
    data: {
      predictions,
      count: predictions.length,
      filters
    },
    message: 'Match predictions retrieved successfully'
  });
});

export const getMatchPredictionById = catchAsyncError(async (req, res) => {
  const { matchId } = req.params;
  
  const prediction = await getOrGenerateMatchPrediction(matchId);
  
  if (!prediction) {
    return sendError(res, 'Match prediction not found', 404);
  }
  
  sendSuccess(res, {
    data: prediction,
    message: 'Match prediction retrieved successfully'
  });
});

export const generateMatchPredictions = catchAsyncError(async (req, res) => {
  const { matchIds } = req.body;
  
  if (!matchIds || !Array.isArray(matchIds) || matchIds.length === 0) {
    return sendError(res, 'Please provide an array of match IDs', 400);
  }
  
  const predictions = await generatePredictionsForMatches(matchIds);
  
  sendSuccess(res, {
    data: {
      predictions,
      count: predictions.length,
      requested: matchIds.length
    },
    message: 'Match predictions generated successfully'
  });
});

export const processMatchPrediction = catchAsyncError(async (req, res) => {
  const { matchId } = req.params;
  
  const prediction = await processMatchPredictions(matchId);
  
  if (!prediction) {
    return sendError(res, 'Match prediction not found', 404);
  }
  
  sendSuccess(res, {
    data: prediction,
    message: 'Match prediction processed successfully'
  });
});

export const getMatchPredictionStats = catchAsyncError(async (req, res) => {
  const MatchPrediction = (await import('../models/matchPredictionModel.js')).default;
  
  const stats = await MatchPrediction.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const totalPredictions = await MatchPrediction.countDocuments();
  const processedPredictions = await MatchPrediction.countDocuments({ isProcessed: true });
  const pendingPredictions = await MatchPrediction.countDocuments({ isProcessed: false });
  
  const statusCounts = stats.reduce((acc, stat) => {
    acc[stat._id] = stat.count;
    return acc;
  }, {});
  
  sendSuccess(res, {
    data: {
      total: totalPredictions,
      processed: processedPredictions,
      pending: pendingPredictions,
      statusBreakdown: statusCounts,
      accuracy: processedPredictions > 0 ? {
        correct: statusCounts.correct || 0,
        partial: statusCounts.partial || 0,
        correctPercentage: ((statusCounts.correct || 0) / processedPredictions * 100).toFixed(2),
        partialPercentage: ((statusCounts.partial || 0) / processedPredictions * 100).toFixed(2)
      } : null
    },
    message: 'Prediction statistics retrieved successfully'
  });
});

export const getExistingPredictionsOnly = catchAsyncError(async (req, res) => {
  const MatchPrediction = (await import('../models/matchPredictionModel.js')).default;
  
  const filters = {
    status: req.query.status,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    limit: parseInt(req.query.limit) || 50
  };
  
  const query = {};
  
  if (filters.status) {
    query.status = filters.status;
  }
  
  if (filters.dateFrom || filters.dateTo) {
    query.predictedAt = {};
    if (filters.dateFrom) query.predictedAt.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) query.predictedAt.$lte = new Date(filters.dateTo);
  }
  
  const predictions = await MatchPrediction.find(query)
    .populate('match')
    .sort({ predictedAt: -1 })
    .limit(filters.limit || 50);
  
  const Team = (await import('../models/teamModel.js')).default;
  for (const prediction of predictions) {
    if (prediction.match) {
      const homeTeam = await Team.findOne({ teamId: prediction.match.homeTeam });
      const awayTeam = await Team.findOne({ teamId: prediction.match.awayTeam });
      prediction.match.homeTeam = homeTeam;
      prediction.match.awayTeam = awayTeam;
    }
  }
  
  sendSuccess(res, {
    data: {
      predictions,
      count: predictions.length,
      filters,
      message: 'Only existing predictions returned (no new generation)'
    }
  }, 'Existing predictions retrieved successfully (no generation)');
});

export const updateMatchPrediction = catchAsyncError(async (req, res) => {
  const { matchId } = req.params;
  const MatchPrediction = (await import('../models/matchPredictionModel.js')).default;
  const Match = (await import('../models/matchModel.js')).default;
  
  const match = await Match.findById(matchId);
  if (!match) {
    return sendError(res, 'Match not found', 404);
  }
  
  const {
    manualCorners,
    
    modelPrediction,
    
    outcomes,
    
    booleanOutcomes,
    
    bttsShow,
    
    overCornersShow,
    overCorners,
    
    homeWinShow,
    over25Show,
    
    confidenceThreshold,
    
    status,
    
    doubleOrNothing,
    
    showOnHomepage,
    
    showFlags
  } = req.body;
  
  const updateData = {
    lastUpdated: new Date()
  };
  
  if (manualCorners) {
    updateData.manualCorners = {
      overCorners: manualCorners.overCorners || '',
      underCorners: manualCorners.underCorners || '',
      cornerThreshold: manualCorners.cornerThreshold || 0,
      cornerPrediction: manualCorners.cornerPrediction || ''
    };
  }
  
  if (overCorners !== undefined) {
    if (!updateData.$set) {
      updateData.$set = {};
    }
    updateData.$set['manualCorners.overCorners'] = overCorners;
  }
  
  if (modelPrediction) {
    updateData.modelPrediction = {
      homeScore: modelPrediction.homeScore || 0,
      awayScore: modelPrediction.awayScore || 0,
      confidence: modelPrediction.confidence || 0
    };
  }
  
  if (outcomes) {
    updateData.outcomes = {
      homeWin: outcomes.homeWin || 0,
      draw: outcomes.draw || 0,
      awayWin: outcomes.awayWin || 0,
      
      over05: outcomes.over05 || 0,
      over15: outcomes.over15 || 0,
      over25: outcomes.over25 || 0,
      over35: outcomes.over35 || 0,
      over45: outcomes.over45 || 0,
      over55: outcomes.over55 || 0,
      over65: outcomes.over65 || 0,
      over75: outcomes.over75 || 0,
      over85: outcomes.over85 || 0,
      over95: outcomes.over95 || 0,
      
      under05: outcomes.under05 || 0,
      under15: outcomes.under15 || 0,
      under25: outcomes.under25 || 0,
      under35: outcomes.under35 || 0,
      under45: outcomes.under45 || 0,
      under55: outcomes.under55 || 0,
      under65: outcomes.under65 || 0,
      under75: outcomes.under75 || 0,
      under85: outcomes.under85 || 0,
      under95: outcomes.under95 || 0,
      
      btts: outcomes.btts || 0,
      bttsYes: outcomes.bttsYes || 0,
      bttsNo: outcomes.bttsNo || 0,
      
      doubleChance1X: outcomes.doubleChance1X || 0,
      doubleChance12: outcomes.doubleChance12 || 0,
      doubleChanceX2: outcomes.doubleChanceX2 || 0,
      
      cleanSheetHome: outcomes.cleanSheetHome || 0,
      cleanSheetAway: outcomes.cleanSheetAway || 0,
      cleanSheetHomeYes: outcomes.cleanSheetHomeYes || 0,
      cleanSheetHomeNo: outcomes.cleanSheetHomeNo || 0,
      cleanSheetAwayYes: outcomes.cleanSheetAwayYes || 0,
      cleanSheetAwayNo: outcomes.cleanSheetAwayNo || 0,
      
      mostLikelyScore: outcomes.mostLikelyScore || {
        home: 0,
        away: 0,
        probability: 0
      },
      exactScore: outcomes.exactScore || '',
      
      bothTeamsToScore: outcomes.bothTeamsToScore || 0,
      totalGoals: outcomes.totalGoals || 0,
      homeTeamToScore: outcomes.homeTeamToScore || 0,
      awayTeamToScore: outcomes.awayTeamToScore || 0,
      
      cornersOver: outcomes.cornersOver || 0,
      cornersUnder: outcomes.cornersUnder || 0,
      cornersOver45: outcomes.cornersOver45 || 0,
      cornersOver55: outcomes.cornersOver55 || 0,
      cornersOver65: outcomes.cornersOver65 || 0,
      cornersOver75: outcomes.cornersOver75 || 0,
      cornersOver85: outcomes.cornersOver85 || 0,
      cornersOver95: outcomes.cornersOver95 || 0
    };
  }
  
  if (booleanOutcomes) {
    if (!updateData.$set) {
      updateData.$set = {};
    }
    
    if (booleanOutcomes.homeWinBoolean !== undefined) {
      updateData.$set['outcomes.homeWinBoolean'] = booleanOutcomes.homeWinBoolean;
      if (booleanOutcomes.homeWinBoolean === true) {
        updateData.$set['outcomes.drawBoolean'] = false;
        updateData.$set['outcomes.awayWinBoolean'] = false;
      }
    }
    if (booleanOutcomes.drawBoolean !== undefined) {
      updateData.$set['outcomes.drawBoolean'] = booleanOutcomes.drawBoolean;
      if (booleanOutcomes.drawBoolean === true) {
        updateData.$set['outcomes.homeWinBoolean'] = false;
        updateData.$set['outcomes.awayWinBoolean'] = false;
      }
    }
    if (booleanOutcomes.awayWinBoolean !== undefined) {
      updateData.$set['outcomes.awayWinBoolean'] = booleanOutcomes.awayWinBoolean;
      if (booleanOutcomes.awayWinBoolean === true) {
        updateData.$set['outcomes.homeWinBoolean'] = false;
        updateData.$set['outcomes.drawBoolean'] = false;
      }
    }
    if (booleanOutcomes.over25Boolean !== undefined) {
      updateData.$set['outcomes.over25Boolean'] = booleanOutcomes.over25Boolean;
    }
    if (booleanOutcomes.under25Boolean !== undefined) {
      updateData.$set['outcomes.under25Boolean'] = booleanOutcomes.under25Boolean;
    }
  }
  
  if (confidenceThreshold !== undefined) {
    updateData.confidenceThreshold = Math.max(0, Math.min(100, confidenceThreshold));
  }
  
  if (status) {
    updateData.status = status;
  }
  
  if (showFlags) {
    updateData.showFlags = showFlags;
  }
  
  if (bttsShow !== undefined || overCornersShow !== undefined || homeWinShow !== undefined || over25Show !== undefined) {
    if (!updateData.$set) {
      updateData.$set = {};
    }
    
    if (bttsShow !== undefined) {
      updateData.$set['showFlags.bttsShow'] = bttsShow;
    }
    if (overCornersShow !== undefined) {
      updateData.$set['showFlags.overCornersShow'] = overCornersShow;
    }
    if (homeWinShow !== undefined) {
      updateData.$set['showFlags.homeWinShow'] = homeWinShow;
    }
    if (over25Show !== undefined) {
      updateData.$set['showFlags.over25Show'] = over25Show;
    }
  }
  
  if (doubleOrNothing !== undefined) {
    await Match.findByIdAndUpdate(matchId, { doubleOrNothing });
  }
  
  if (showOnHomepage !== undefined) {
    await Match.findByIdAndUpdate(matchId, { showOnHomepage });
  }
  
  const updatedMatch = await Match.findById(matchId);
  
  let prediction = await MatchPrediction.findOne({ match: matchId });
  
  if (!prediction) {
    prediction = new MatchPrediction({
      match: matchId,
      modelPrediction: {
        homeScore: 0,
        awayScore: 0,
        confidence: 0
      },
      outcomes: {
        homeWin: 0,
        draw: 0,
        awayWin: 0,
        
        over05: 0,
        over15: 0,
        over25: 0,
        over35: 0,
        over45: 0,
        over55: 0,
        over65: 0,
        over75: 0,
        over85: 0,
        over95: 0,
        
        under05: 0,
        under15: 0,
        under25: 0,
        under35: 0,
        under45: 0,
        under55: 0,
        under65: 0,
        under75: 0,
        under85: 0,
        under95: 0,
        
        btts: 0,
        bttsYes: 0,
        bttsNo: 0,
        
        doubleChance1X: 0,
        doubleChance12: 0,
        doubleChanceX2: 0,
        
        cleanSheetHome: 0,
        cleanSheetAway: 0,
        cleanSheetHomeYes: 0,
        cleanSheetHomeNo: 0,
        cleanSheetAwayYes: 0,
        cleanSheetAwayNo: 0,
        
        mostLikelyScore: {
          home: 0,
          away: 0,
          probability: 0
        },
        exactScore: '',
        
        bothTeamsToScore: 0,
        totalGoals: 0,
        homeTeamToScore: 0,
        awayTeamToScore: 0,
        
        cornersOver: 0,
        cornersUnder: 0,
        cornersOver45: 0,
        cornersOver55: 0,
        cornersOver65: 0,
        cornersOver75: 0,
        cornersOver85: 0,
        cornersOver95: 0
      },
      manualCorners: {
        overCorners: '',
        underCorners: '',
        cornerThreshold: 0,
        cornerPrediction: ''
      },
      status: 'pending',
      isProcessed: false
    });
  }
  
  if (updateData.$set) {
    await MatchPrediction.findByIdAndUpdate(prediction._id, updateData.$set);
    prediction = await MatchPrediction.findById(prediction._id);
  } else {
    Object.assign(prediction, updateData);
    await prediction.save();
  }
  
  const Team = (await import('../models/teamModel.js')).default;
  const homeTeam = await Team.findOne({ teamId: updatedMatch.homeTeam });
  const awayTeam = await Team.findOne({ teamId: updatedMatch.awayTeam });
  
  const responseData = {
    _id: prediction._id,
    match: {
      _id: updatedMatch._id,
      homeTeam: {
        id: homeTeam?.teamId,
        name: homeTeam?.name,
        logo: homeTeam?.logo
      },
      awayTeam: {
        id: awayTeam?.teamId,
        name: awayTeam?.name,
        logo: awayTeam?.logo
      },
      date: updatedMatch.date,
      status: updatedMatch.status,
      doubleOrNothing: updatedMatch.doubleOrNothing,
      showOnHomepage: updatedMatch.showOnHomepage
    },
    modelPrediction: prediction.modelPrediction,
    outcomes: prediction.outcomes,
    manualCorners: prediction.manualCorners,
    showFlags: prediction.showFlags,
    status: prediction.status,
    confidenceThreshold: prediction.confidenceThreshold,
    lastUpdated: prediction.lastUpdated,
    predictedAt: prediction.predictedAt
  };
  
  sendSuccess(res, {
    data: responseData,
    message: 'Match prediction updated successfully'
  });
});

export const getPredictionFields = catchAsyncError(async (req, res) => {
  const { matchId } = req.params;
  const MatchPrediction = (await import('../models/matchPredictionModel.js')).default;
  const Match = (await import('../models/matchModel.js')).default;
  
  const match = await Match.findById(matchId);
  if (!match) {
    return sendError(res, 'Match not found', 404);
  }
  
  const prediction = await MatchPrediction.findOne({ match: matchId });
  
  const Team = (await import('../models/teamModel.js')).default;
  const homeTeam = await Team.findOne({ teamId: match.homeTeam });
  const awayTeam = await Team.findOne({ teamId: match.awayTeam });
  
  const responseData = {
    match: {
      _id: match._id,
      homeTeam: {
        id: homeTeam?.teamId,
        name: homeTeam?.name,
        logo: homeTeam?.logo
      },
      awayTeam: {
        id: awayTeam?.teamId,
        name: awayTeam?.name,
        logo: awayTeam?.logo
      },
      date: match.date,
      status: match.status,
      doubleOrNothing: match.doubleOrNothing || false,
      showOnHomepage: match.showOnHomepage || false
    },
    prediction: prediction ? {
      modelPrediction: prediction.modelPrediction,
      outcomes: prediction.outcomes,
      manualCorners: prediction.manualCorners,
      status: prediction.status,
      confidenceThreshold: prediction.confidenceThreshold,
      lastUpdated: prediction.lastUpdated,
      predictedAt: prediction.predictedAt
    } : null,
    availableFields: {
      manualCorners: {
        overCorners: 'string',
        underCorners: 'string',
        cornerThreshold: 'number',
        cornerPrediction: 'enum: over, under, empty'
      },
      modelPrediction: {
        homeScore: 'number',
        awayScore: 'number',
        confidence: 'number (0-100)'
      },
      outcomes: {
        homeWin: 'number (0-100)',
        draw: 'number (0-100)',
        awayWin: 'number (0-100)',
        
        homeWinBoolean: 'boolean (auto-calculated)',
        drawBoolean: 'boolean (auto-calculated)',
        awayWinBoolean: 'boolean (auto-calculated)',
        over25Boolean: 'boolean (auto-calculated)',
        under25Boolean: 'boolean (auto-calculated)',
        
        over05: 'number (0-100)',
        over15: 'number (0-100)',
        over25: 'number (0-100)',
        over35: 'number (0-100)',
        over45: 'number (0-100)',
        over55: 'number (0-100)',
        over65: 'number (0-100)',
        over75: 'number (0-100)',
        over85: 'number (0-100)',
        over95: 'number (0-100)',
        
        under05: 'number (0-100)',
        under15: 'number (0-100)',
        under25: 'number (0-100)',
        under35: 'number (0-100)',
        under45: 'number (0-100)',
        under55: 'number (0-100)',
        under65: 'number (0-100)',
        under75: 'number (0-100)',
        under85: 'number (0-100)',
        under95: 'number (0-100)',
        
        btts: 'number (0-100)',
        bttsYes: 'number (0-100)',
        bttsNo: 'number (0-100)',
        
        doubleChance1X: 'number (0-100)',
        doubleChance12: 'number (0-100)',
        doubleChanceX2: 'number (0-100)',
        
        cleanSheetHome: 'number (0-100)',
        cleanSheetAway: 'number (0-100)',
        cleanSheetHomeYes: 'number (0-100)',
        cleanSheetHomeNo: 'number (0-100)',
        cleanSheetAwayYes: 'number (0-100)',
        cleanSheetAwayNo: 'number (0-100)',
        
        bothTeamsToScore: 'number (0-100)',
        totalGoals: 'number (0-100)',
        homeTeamToScore: 'number (0-100)',
        awayTeamToScore: 'number (0-100)',
        
        cornersOver: 'number (0-100)',
        cornersUnder: 'number (0-100)',
        cornersOver45: 'number (0-100)',
        cornersOver55: 'number (0-100)',
        cornersOver65: 'number (0-100)',
        cornersOver75: 'number (0-100)',
        cornersOver85: 'number (0-100)',
        cornersOver95: 'number (0-100)'
       },
       booleanOutcomes: {
         homeWinBoolean: 'boolean (manual override)',
         drawBoolean: 'boolean (manual override)',
         awayWinBoolean: 'boolean (manual override)',
         over25Boolean: 'boolean (manual override)',
         under25Boolean: 'boolean (manual override)'
       },
       bttsShow: 'boolean (BTTS show flag)',
       overCornersShow: 'boolean (Over corners show flag)',
       overCorners: 'string (Over corners value)',
       homeWinShow: 'boolean (Home win show flag)',
       over25Show: 'boolean (Over 2.5 goals show flag)',
       status: 'enum: pending, correct, partial',
       confidenceThreshold: 'number (0-100)',
       doubleOrNothing: 'boolean',
       showOnHomepage: 'boolean',
      showFlags: {
        homeWinShow: 'boolean',
        drawShow: 'boolean',
        awayWinShow: 'boolean',
        
        over05Show: 'boolean',
        over15Show: 'boolean',
        over25Show: 'boolean',
        over35Show: 'boolean',
        over45Show: 'boolean',
        over55Show: 'boolean',
        over65Show: 'boolean',
        over75Show: 'boolean',
        over85Show: 'boolean',
        over95Show: 'boolean',
        
        bttsShow: 'boolean',
        bttsYesShow: 'boolean',
        bttsNoShow: 'boolean',
        
        doubleChance1XShow: 'boolean',
        doubleChance12Show: 'boolean',
        doubleChanceX2Show: 'boolean',
        
        overCornersShow: 'boolean',
        underCornersShow: 'boolean',
        cornerThresholdShow: 'boolean',
        cornerPredictionShow: 'boolean'
      }
    }
  };
  
  sendSuccess(res, {
    data: responseData,
    message: 'Prediction fields retrieved successfully'
  });
});
