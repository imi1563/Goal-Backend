import League from '../models/leaugeModel.js';
import { sendSuccess, sendError, sendPaginatedResponse } from '../utils/response.js';
import catchAsyncError from '../utils/catchAsync.js';
import { generatePredictionsForMatches } from '../services/matchPredictionService.js';
import { updateTeamStatistics } from '../services/teamStatsService.js';
import { getCurrentFootballSeason } from '../utils/seasonUtils.js';

export const getActiveLeagues = catchAsyncError(async (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    search = '',
    country = '',
    type = '',
    season = '',
    sortBy = 'name',
    sortOrder = 'asc'
  } = req.query;
  
  const filter = { isActive: true };
  
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { country: { $regex: search, $options: 'i' } },
      { type: { $regex: search, $options: 'i' } }
    ];
  }
  
  if (country) {
    filter.country = { $regex: country, $options: 'i' };
  }
  
  if (type) {
    filter.type = { $regex: type, $options: 'i' };
  }
  
  if (season) {
    filter.season = parseInt(season);
  }
  
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const [leagues, total] = await Promise.all([
    League.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v -createdAt -updatedAt')
      .lean(),
    League.countDocuments(filter)
  ]);
  
  const stats = await League.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalActiveLeagues: { $sum: 1 },
        countries: { $addToSet: '$country' },
        types: { $addToSet: '$type' },
        seasons: { $addToSet: '$season' }
      }
    },
    {
      $project: {
        _id: 0,
        totalActiveLeagues: 1,
        uniqueCountries: { $size: '$countries' },
        uniqueTypes: { $size: '$types' },
        uniqueSeasons: { $size: '$seasons' }
      }
    }
  ]);
  
  const totalPages = Math.ceil(total / parseInt(limit));
  
  return sendPaginatedResponse(
    res,
    parseInt(page),
    totalPages,
    total,
    {
      leagues,
      filters: {
        search: search || null,
        country: country || null,
        type: type || null,
        season: season || null,
        sortBy,
        sortOrder
      },
      message: `Found ${total} active leagues`
    }
  );
});

export const getAllLeagues = catchAsyncError(async (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    search = '', 
    status = '', 
    country = '',
    type = '',
    season = '',
    sortBy = 'createdAt',
    sortOrder = 'desc',
    dateFrom = '',
    dateTo = ''
  } = req.query;

  const hasFilters = search || status || country || type || season || dateFrom || dateTo;

  if (!hasFilters) {
    return sendSuccess(res, {
      data: {
        currentPage: parseInt(page),
        totalPages: 0,
        totalItems: 0,
        items: {
          leagues: [],
          filters: {
            search: search || null,
            status: status || null,
            country: country || null,
            type: type || null,
            season: season || null,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
            sortBy: sortBy,
            sortOrder: sortOrder
          },
          message: "No filters provided - please specify search, status, country, type, season, dateFrom, or dateTo parameters to see leagues"
        }
      },
      message: "No data returned - filters required"
    });
  }
  
  const filter = {};
  
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { country: { $regex: search, $options: 'i' } },
      { type: { $regex: search, $options: 'i' } }
    ];
  }
  
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  
  if (country) {
    filter.country = { $regex: country, $options: 'i' };
  }
  
  if (type) {
    filter.type = { $regex: type, $options: 'i' };
  }
  
  if (season) {
    filter.season = parseInt(season);
  }
  
  if (dateFrom || dateTo) {
    filter.$or = filter.$or || [];
    const dateFilter = {};
    
    if (dateFrom) {
      dateFilter.$gte = new Date(dateFrom);
    }
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      dateFilter.$lte = endOfDay;
    }
    
    filter.$and = [
      {
        $or: [
          { startDate: dateFilter },
          { endDate: dateFilter }
        ]
      }
    ];
  }
  
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const [leagues, total] = await Promise.all([
    League.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v')
      .lean(),
    League.countDocuments(filter)
  ]);
  
  const totalPages = Math.ceil(total / parseInt(limit));
  
  return sendPaginatedResponse(
    res,
    parseInt(page),
    totalPages,
    total,
    {
      leagues,
      filters: {
        search: search || null,
        status: status || null,
        country: country || null,
        type: type || null,
        season: season || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        sortBy,
        sortOrder
      },
      message: `Found ${total} leagues with applied filters`
    }
  );
});

export const getLeagueById = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  
  const league = await League.findById(id);
  if (!league) {
    return sendError(res, { statusCode: 404, message: 'League not found' });
  }
  
  return sendSuccess(res, { data: league });
});

export const createLeague = catchAsyncError(async (req, res) => {
  const { leagueId, name, country, season, logo, flag, type, startDate, endDate } = req.body;
  
  const existingLeague = await League.findOne({ leagueId });
  if (existingLeague) {
    return sendError(res, { 
      statusCode: 400, 
      message: 'League with this ID already exists' 
    });
  }
  
  const newLeague = new League({
    leagueId,
    name,
    country,
    season,
    logo,
    flag,
    type,
    startDate,
    endDate,
    isActive: false
  });
  
  await newLeague.save();
  
  return sendSuccess(res, { 
    statusCode: 201, 
    data: newLeague,
    message: 'League created successfully' 
  });
});

export const updateLeague = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  
  const updatedLeague = await League.findByIdAndUpdate(id, updateData, { 
    new: true, 
    runValidators: true 
  });
  
  if (!updatedLeague) {
    return sendError(res, { statusCode: 404, message: 'League not found' });
  }
  
  return sendSuccess(res, { 
    data: updatedLeague,
    message: 'League updated successfully' 
  });
});

export const deleteLeague = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  
  const deletedLeague = await League.findByIdAndDelete(id);
  if (!deletedLeague) {
    return sendError(res, { statusCode: 404, message: 'League not found' });
  }
  
  return sendSuccess(res, { 
    data: deletedLeague,
    message: 'League deleted successfully' 
  });
});

export const activateLeague = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  
  const league = await League.findByIdAndUpdate(
    id, 
    { isActive: true }, 
    { new: true }
  );
  
  if (!league) {
    return sendError(res, { statusCode: 404, message: 'League not found' });
  }
  
  let activationResult = {
    fixturesProcessed: false,
    newMatchesCount: 0,
    updatedMatchesCount: 0,
    skippedMatchesCount: 0,
    teamsProcessed: 0,
    statsFetched: 0,
    statsErrors: 0,
    predictionsGenerated: 0,
    predictionErrors: 0
  };
  const ACTIVATION_TIMEOUT_MS = parseInt(process.env.LEAGUE_ACTIVATION_TIMEOUT_MS || '600000', 10);

  
  try {
    console.log(`🚀 League ${league.name} activated! Starting full activation flow (timeout: ${ACTIVATION_TIMEOUT_MS}ms)...`);
    
    const { activateLeagueWithFullSetup } = await import('../services/leagueActivationService.js');
    
    const activationPromise = activateLeagueWithFullSetup(league);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Activation timeout after ${ACTIVATION_TIMEOUT_MS}ms`));
      }, ACTIVATION_TIMEOUT_MS);
    });
    
    const result = await Promise.race([activationPromise, timeoutPromise]);
    
    if (result) {
      activationResult = result;
    }
    
    console.log(`✅ League activation flow completed:`);
    console.log(`   📊 New matches: ${activationResult.newMatchesCount}`);
    console.log(`   🔄 Updated matches: ${activationResult.updatedMatchesCount}`);
    console.log(`   👥 Teams processed: ${activationResult.teamsProcessed}`);
    console.log(`   📊 Stats fetched: ${activationResult.statsFetched}`);
    console.log(`   🔮 Predictions generated: ${activationResult.predictionsGenerated}`);
    
  } catch (error) {
    console.error(`❌ Error during league activation:`, error.message);
    if (error.message.includes('timeout')) {
      console.error(`   ⏱️ Activation timed out after ${ACTIVATION_TIMEOUT_MS}ms - returning partial results`);
    } else {
      console.error(`   Stack:`, error.stack);
    }
  }
  
  const responseData = {
    data: league,
    message: `League activated successfully! ${activationResult.fixturesProcessed ? 'Fixtures imported, team stats fetched, and predictions generated.' : 'Activation completed, but fixture processing encountered issues.'}`,
    activation: {
      fixturesProcessed: activationResult.fixturesProcessed || false,
      newMatches: activationResult.newMatchesCount || 0,
      updatedMatches: activationResult.updatedMatchesCount || 0,
      skippedMatches: activationResult.skippedMatchesCount || 0,
      teamsProcessed: activationResult.teamsProcessed || 0,
      statsFetched: activationResult.statsFetched || 0,
      statsErrors: activationResult.statsErrors || 0,
      predictionsGenerated: activationResult.predictionsGenerated || 0,
      predictionErrors: activationResult.predictionErrors || 0,
      success: activationResult.fixturesProcessed || false
    }
  };
  
  return sendSuccess(res, responseData);
});

export const deactivateLeague = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  
  const league = await League.findByIdAndUpdate(
    id, 
    { isActive: false }, 
    { new: true }
  );
  
  if (!league) {
    return sendError(res, { statusCode: 404, message: 'League not found' });
  }
  
  try {
    console.log(`🗑️ League ${league.name} deactivated! Deleting all matches, predictions, and teams...`);
    
    const Match = (await import('../models/matchModel.js')).default;
    const MatchPrediction = (await import('../models/matchPredictionModel.js')).default;
    const Team = (await import('../models/teamModel.js')).default;
    
    const matches = await Match.find({ leagueId: league.leagueId }).select('_id homeTeam awayTeam');
    const matchIds = matches.map(match => match._id);
    
    const teamIds = new Set();
    matches.forEach(match => {
      if (match.homeTeam) teamIds.add(match.homeTeam);
      if (match.awayTeam) teamIds.add(match.awayTeam);
    });
    const uniqueTeamIds = Array.from(teamIds);
    
    let deletedPredictions = 0;
    if (matchIds.length > 0) {
      const predictionDeleteResult = await MatchPrediction.deleteMany({ 
        match: { $in: matchIds } 
      });
      deletedPredictions = predictionDeleteResult.deletedCount;
      console.log(`✅ Deleted ${deletedPredictions} predictions from league ${league.name}`);
    }
    
    const matchDeleteResult = await Match.deleteMany({ leagueId: league.leagueId });
    const deletedMatches = matchDeleteResult.deletedCount;
    console.log(`✅ Deleted ${deletedMatches} matches from league ${league.name}`);
    
    let deletedTeams = 0;
    if (uniqueTeamIds.length > 0) {
      const teamsToDelete = [];
      
      for (const teamId of uniqueTeamIds) {
        const otherLeagueMatches = await Match.find({ 
          $and: [
            { $or: [{ homeTeam: teamId }, { awayTeam: teamId }] },
            { leagueId: { $ne: league.leagueId } }
          ]
        }).limit(1);
        
        if (otherLeagueMatches.length === 0) {
          teamsToDelete.push(teamId);
        } else {
          console.log(`   ⚠️ Team ${teamId} appears in other leagues, skipping deletion`);
        }
      }
      
      if (teamsToDelete.length > 0) {
        const teamDeleteResult = await Team.deleteMany({ 
          teamId: { $in: teamsToDelete } 
        });
        deletedTeams = teamDeleteResult.deletedCount;
        console.log(`✅ Deleted ${deletedTeams} teams exclusively associated with league ${league.name}`);
      } else {
        console.log(`   ℹ️ No teams exclusively associated with league ${league.name} to delete`);
      }
    }
    
    return sendSuccess(res, { 
      data: league,
      message: `League deactivated successfully! ${deletedMatches} matches, ${deletedPredictions} predictions, and ${deletedTeams} teams deleted.`,
      deletedMatches,
      deletedPredictions,
      deletedTeams
    });
    
  } catch (error) {
    console.error(`❌ Error deleting matches, predictions, and teams:`, error.message);
    return sendError(res, { 
      statusCode: 500, 
      message: 'League deactivated but failed to delete matches, predictions, and teams' 
    });
  }
});

