import Team from '../models/teamModel.js';
import { getTeamStatistics, getTeamDetails, getTeamsByLeagueSeason, getFinishedLeagueFixtures } from './footballApiService.js';
import { sendError } from '../utils/response.js';
import catchAsyncError from '../utils/catchAsync.js';
import { getFootballSeasons, getLatestAvailableSeason, getLatestAvailableSeasonFromDB, getLatestSeasonWithAPIData, getCurrentFootballSeason } from '../utils/seasonUtils.js';

const seasonCache = new Map();

const TEAM_STATS_REFRESH_HOURS = parseInt(process.env.TEAM_STATS_REFRESH_HOURS || '0', 10);

const getCachedBestSeason = async (leagueId) => {
  if (seasonCache.has(leagueId)) {
    const cachedSeason = seasonCache.get(leagueId);
    console.log(`📋 Using cached best season for league ${leagueId}: ${cachedSeason}`);
    return cachedSeason;
  }
  
  const sampleTeams = {
    39: 49,
    135: 495,
    78: 33,
    140: 529,
    218: 80
  };
  
  const sampleTeamId = sampleTeams[leagueId];
  if (sampleTeamId) {
    console.log(`🔍 Detecting best season for league ${leagueId} using sample team ${sampleTeamId}...`);
    const bestSeason = await getBestAvailableSeason(sampleTeamId, leagueId);
    
    if (bestSeason) {
      seasonCache.set(leagueId, bestSeason);
      console.log(`💾 Cached best season for league ${leagueId}: ${bestSeason}`);
      return bestSeason;
    }
  }
  
  const currentSeason = getCurrentFootballSeason();
  console.log(`⚠️ Could not detect best season for league ${leagueId}, using current season: ${currentSeason}`);
  return currentSeason;
};

const detectAvailableSeasons = async (teamId, leagueId) => {
  const seasonsToCheck = [2025, 2024, 2023, 2022];
  const availableSeasons = [];
  
  for (const season of seasonsToCheck) {
    try {
      console.log(`🔍 Checking if season ${season} has data for team ${teamId}...`);
      const stats = await getTeamStatistics(teamId, leagueId, season);
      
      if (stats && stats.response && stats.response.length > 0) {
        console.log(`✅ Season ${season} has data for team ${teamId}`);
        availableSeasons.push(season);
      } else {
        console.log(`⚠️ Season ${season} has no data for team ${teamId}`);
      }
    } catch (error) {
      console.log(`❌ Season ${season} failed for team ${teamId}: ${error.message}`);
    }
  }
  
  return availableSeasons.sort((a, b) => b - a);
};

const getBestAvailableSeason = async (teamId, leagueId) => {
  const availableSeasons = await detectAvailableSeasons(teamId, leagueId);
  
  if (availableSeasons.length > 0) {
    const bestSeason = availableSeasons[0];
    console.log(`🎯 Best available season for team ${teamId} in league ${leagueId}: ${bestSeason}`);
    return bestSeason;
  }
  
  console.log(`❌ No seasons have data for team ${teamId} in league ${leagueId}`);
  return null;
};

export const getTeamStatsWithFallback = async (teamId, leagueId, season) => {
  try {
    const team = await Team.findOne({ teamId: teamId });
    
    if (team && team.statistics) {
      let seasonStats = null;
      
      if (team.statistics instanceof Map) {
        if (team.statistics.has(leagueId.toString()) && team.statistics.get(leagueId.toString()).has(season.toString())) {
          seasonStats = team.statistics.get(leagueId.toString()).get(season.toString());
        }
      } else {
        const leagueKey = leagueId.toString();
        const seasonKey = season.toString();
        
        if (team.statistics[leagueKey] && team.statistics[leagueKey][seasonKey]) {
          seasonStats = team.statistics[leagueKey][seasonKey];
        }
      }
      
      if (seasonStats) {
        console.log(`✅ Found team statistics in database for team ${teamId}, season ${season}`);
        return seasonStats;
      }
    }
    
    console.log(`❌ No statistics available for team ${teamId} in league ${leagueId} for season ${season}`);
    return null;
    
  } catch (error) {
    console.log(`⚠️ Error getting team stats: ${error.message}`);
      return null;
    }
};



export const getTeamStatsForPrediction = async (teamId, leagueId, season) => {
  try {
    let team = null;
    
    if (typeof teamId === 'number' || !isNaN(Number(teamId))) {
      team = await Team.findOne({ teamId: Number(teamId) });
    }
    
    if (!team && typeof teamId === 'string' && teamId.length === 24) {
      try {
        team = await Team.findById(teamId);
      } catch (e) {
      }
    }
    
    if (!team) {
      team = await Team.findOne({ teamId: teamId.toString() });
    }

    if (!team) {
      console.warn(`⚠️ Team not found for teamId: ${teamId} (tried numeric, ObjectId, and string)`);
      return null;
    }

    let stats = null;
    
    if (team.statistics) {
      if (team.statistics instanceof Map) {
        if (team.statistics.has(leagueId.toString()) && team.statistics.get(leagueId.toString()).has(season.toString())) {
          stats = team.statistics.get(leagueId.toString()).get(season.toString());
        }
      } else {
        const leagueKey = leagueId.toString();
        const seasonKey = season.toString();
        
        if (team.statistics[leagueKey] && team.statistics[leagueKey][seasonKey]) {
          stats = team.statistics[leagueKey][seasonKey];
        }
      }
      
      if (stats) {
        console.log(`✅ Using stats for team ${teamId} in league ${leagueId}, season ${season}`);
        
        return {
          matchesPlayed: stats.matchesPlayed || 0,
          wins: stats.wins || 0,
          draws: stats.draws || 0,
          losses: stats.losses || 0,
          goalsFor: stats.goalsFor || 0,
          goalsAgainst: stats.goalsAgainst || 0,
          goalsForAvg: stats.goalsForAvg || 0,
          goalsAgainstAvg: stats.goalsAgainstAvg || 0,
          xG: stats.xG || 0,
          xGA: stats.xGA || 0,
          form: stats.form || '',
          winPercentage: stats.winPercentage || 0,
          goalDifference: stats.goalDifference || 0,
          lastUpdated: stats.lastUpdated
        };
      }
    }
    
    console.warn(`⚠️ No statistics found for team ${teamId} in league ${leagueId}, season ${season}`);
    return null;
    
    console.warn(`⚠️ No statistics found for team ${teamId} in any season.`);
    return null;
    
  } catch (error) {
    console.error(`💥 Error getting team stats for prediction:`, error);
    return null;
  }
};

export const updateTeamStatistics = async (teamId, leagueId, season) => {
  try {
    console.log(`🔄 Checking statistics for team ID: ${teamId}, League ID: ${leagueId}, Season: ${season}`);
    
    let team = await Team.findOne({ teamId: teamId });
    if (!team) {
      console.warn(`⚠️ Team ${teamId} not found in DB; attempting to create from API...`);
      const details = await getTeamDetails(teamId);
      if (!details || !details.team) {
        console.warn(`❌ Could not fetch team details for teamId=${teamId}; skipping`);
        return null;
      }
      const t = details.team;
      const venue = details.venue || {};
      team = new Team({
        teamId: t.id,
        name: t.name,
        code: t.code,
        country: t.country,
        founded: t.founded,
        logo: t.logo,
        venue: {
          id: venue.id,
          name: venue.name,
          city: venue.city,
          capacity: venue.capacity,
          surface: venue.surface,
          image: venue.image
        }
      });
      await team.save();
      console.log(`🆕 Created Team doc for teamId=${teamId}`);
    }

    let existing = null;
    if (team.statistics) {
      if (team.statistics instanceof Map) {
        if (team.statistics.has(leagueId.toString()) && team.statistics.get(leagueId.toString()).has(season.toString())) {
          existing = team.statistics.get(leagueId.toString()).get(season.toString());
        }
      } else {
        existing = team.statistics[leagueId?.toString()]?.[season?.toString()] || null;
      }
    }

    if (existing) {
      if (TEAM_STATS_REFRESH_HOURS === 0) {
        console.log(`🔄 Always fetching latest statistics for team ${teamId} (REFRESH_HOURS=0)`);
      } else {
        const lastUpdated = existing.lastUpdated ? new Date(existing.lastUpdated) : null;
        const ageMs = lastUpdated ? (Date.now() - lastUpdated.getTime()) : Number.POSITIVE_INFINITY;
        const ageHours = ageMs / (1000 * 60 * 60);
        if (ageHours < TEAM_STATS_REFRESH_HOURS) {
          console.log(`✅ Team ${teamId} has fresh statistics for season ${season} (age ${ageHours.toFixed(2)}h < ${TEAM_STATS_REFRESH_HOURS}h)`);
          return existing;
        } else {
          console.log(`♻️ Team ${teamId} statistics are stale (${ageHours.toFixed(2)}h ≥ ${TEAM_STATS_REFRESH_HOURS}h). Refreshing...`);
        }
      }
    } else {
      console.log(`ℹ️ No existing statistics for team ${teamId}, will fetch new data`);
    }

    const apiStats = await getTeamStatistics(teamId, leagueId, season);
    if (!apiStats) {
      console.log(`❌ API returned no statistics for team ${teamId}, league ${leagueId}, season ${season}`);
      return existing || null;
    }

    const mapped = (() => {
      try {
        console.log('🔍 Full API response structure for team', teamId, 'league', leagueId, 'season', season);
        console.log('📊 Top-level keys:', Object.keys(apiStats));
        
        const searchForXG = (obj, path = '') => {
          if (typeof obj !== 'object' || obj === null) return;
          
          Object.keys(obj).forEach(key => {
            const currentPath = path ? `${path}.${key}` : key;
            if (key.toLowerCase().includes('xg') || key.toLowerCase().includes('expected') || key.toLowerCase().includes('shot')) {
              console.log(`🎯 Found potential xG field: ${currentPath} =`, obj[key]);
            }
            if (typeof obj[key] === 'object') {
              searchForXG(obj[key], currentPath);
            }
          });
        };
        
        searchForXG(apiStats);
        
        const fixtures = apiStats.fixtures || {};
        const goals = apiStats.goals || {};
        const goalsFor = goals.for || {};
        const goalsAgainst = goals.against || {};
        const form = apiStats.form || '';
        const cards = apiStats.cards || {};
        const lineups = Array.isArray(apiStats.lineups) ? apiStats.lineups : [];

        const played = fixtures.played?.total || 0;
        const wins = fixtures.wins?.total || 0;
        const draws = fixtures.draws?.total || 0;
        const losses = fixtures.loses?.total || 0;

        const gfTotal = goalsFor.total?.total ?? goalsFor.total ?? 0;
        const gaTotal = goalsAgainst.total?.total ?? goalsAgainst.total ?? 0;

        const gfAvg = typeof goalsFor.average?.total === 'string' ? parseFloat(goalsFor.average.total) : (goalsFor.average?.total || 0);
        const gaAvg = typeof goalsAgainst.average?.total === 'string' ? parseFloat(goalsAgainst.average.total) : (goalsAgainst.average?.total || 0);

        const yellowCards = Object.values(cards.yellow || {}).reduce((sum, x) => sum + (x?.total || 0), 0);
        const redCards = Object.values(cards.red || {}).reduce((sum, x) => sum + (x?.total || 0), 0);

        const mostUsedFormation = lineups.length > 0 ? lineups[0]?.formation || '4-4-2' : '4-4-2';

        const winPercentage = played > 0 ? (wins / played) * 100 : 0;
        const drawPercentage = played > 0 ? (draws / played) * 100 : 0;
        const lossPercentage = played > 0 ? (losses / played) * 100 : 0;
        const goalDifference = (gfTotal || 0) - (gaTotal || 0);

        return {
          matchesPlayed: played,
          wins,
          draws,
          losses,
          goalsFor: gfTotal || 0,
          goalsAgainst: gaTotal || 0,
          goalsForAvg: gfAvg || 0,
          goalsAgainstAvg: gaAvg || 0,
          xG: 0,
          xGA: 0,
          form: form || '',
          winPercentage,
          drawPercentage,
          lossPercentage,
          goalDifference,
          mostUsedFormation,
          yellowCards,
          redCards,
          lastUpdated: new Date()
        };
      } catch (e) {
        console.error('💥 Failed to map API stats:', e?.message || e);
        return null;
      }
    })();

    if (!mapped) {
      console.log(`❌ Failed to map stats for team ${teamId}, league ${leagueId}, season ${season}`);
      return null;
    }

    const path = `statistics.${leagueId}.${season}`;
    await Team.updateOne({ _id: team._id }, { $set: { [path]: mapped } });
    console.log(`💾 Saved statistics for team ${teamId}, league ${leagueId}, season ${season}`);
    return mapped;
    
  } catch (error) {
    console.error(`💥 Error checking team statistics for team ${teamId}:`, error.message);
    return null;
  }
};

export const getLeagueAverages = async (leagueId, season) => {
  try {
    const League = (await import('../models/leaugeModel.js')).default;
    const league = await League.findOne({ leagueId: leagueId });
    const dbSeason = league ? league.season : season;
    
    console.log(`🔍 League ${leagueId} has season ${dbSeason} in database (requested: ${season})`);
    console.log(`🔄 Fetching league averages for season ${dbSeason} from API...`);
    
    let apiAverages = await computeLeagueAveragesFromAPI(leagueId, dbSeason);
    
    if (apiAverages) {
      console.log(`✅ Found league averages for season ${dbSeason}`);
      return apiAverages;
    }
    
    console.log(`⚠️ No league averages found for season ${dbSeason}, trying previous season as fallback...`);
    const previousSeason = dbSeason - 1;
    
    try {
      console.log(`🔍 Trying previous season ${previousSeason} for league averages...`);
      const prevApiAverages = await computeLeagueAveragesFromAPI(leagueId, previousSeason);
      
      if (prevApiAverages) {
        console.log(`✅ Found league averages for previous season ${previousSeason}`);
        return prevApiAverages;
      } else {
        console.log(`❌ No league averages found for previous season ${previousSeason} either`);
      }
    } catch (error) {
      console.error(`💥 Error fetching previous season league averages:`, error);
    }
    
    console.log(`❌ No league averages found for current season ${dbSeason} or previous season ${previousSeason}`);
    return null;
  } catch (error) {
    console.error(`💥 Error getting league averages:`, error);
    return null;
  }
};

const computeLeagueAveragesFromAPI = async (leagueId, season) => {
  try {
    console.log(`🔍 computeLeagueAveragesFromAPI fetching for league ${leagueId}, season ${season}`);
    
    const data = await getFinishedLeagueFixtures(leagueId, season);
    
    if (!data || !Array.isArray(data.response) || data.response.length === 0) {
      console.warn(`⚠️ No finished fixtures from API for league ${leagueId}, season ${season}`);
      return null;
    }
    
    const matches = data.response;
    
    console.log(`✅ Found ${matches.length} finished fixtures for league ${leagueId}, season ${season}`);

    let totalGoals = 0;
    let totalHomeGoals = 0;
    let totalAwayGoals = 0;
    let bttsCount = 0;

    matches.forEach(match => {
      const homeGoals = match.goals?.home || 0;
      const awayGoals = match.goals?.away || 0;
      const totalMatchGoals = homeGoals + awayGoals;
      
      totalGoals += totalMatchGoals;
      totalHomeGoals += homeGoals;
      totalAwayGoals += awayGoals;
      
      if (homeGoals > 0 && awayGoals > 0) {
        bttsCount++;
      }
    });

    const avgGoalsPerMatch = matches.length > 0 ? totalGoals / matches.length : 0;
    const avgHomeGoals = matches.length > 0 ? totalHomeGoals / matches.length : 0;
    const avgAwayGoals = matches.length > 0 ? totalAwayGoals / matches.length : 0;
    const bttsPercentage = matches.length > 0 ? (bttsCount / matches.length) * 100 : 0;
    
    return {
      avgGoalsPerMatch: Math.round(avgGoalsPerMatch * 100) / 100,
      avgHomeGoals: Math.round(avgHomeGoals * 100) / 100,
      avgAwayGoals: Math.round(avgAwayGoals * 100) / 100,
      bttsPercentage: Math.round(bttsPercentage * 100) / 100,
      leagueId: leagueId,
      season: season,
      lastUpdated: new Date(),
      source: 'API'
    };
  } catch (error) {
    console.error(`💥 Error computing league averages from API:`, error);
    return null;
  }
};

const calculateFormFromStats = (wins, draws, losses, matchesPlayed) => {
  if (!matchesPlayed || matchesPlayed === 0) return '';
  
  const winPercentage = (wins / matchesPlayed) * 100;
  if (winPercentage >= 60) return 'WWWWW';
  if (winPercentage >= 40) return 'WWDLW';
  if (winPercentage >= 20) return 'WDLDL';
  return 'LLLDL';
};

export const updateAllTeamsStatisticsInLeague = catchAsyncError(async (leagueId, season) => {
  console.log(`🚀 Starting to update statistics for all teams in League ID: ${leagueId}, Season: ${season}`);
  
  let teams = [];
  try {
    const { default: Match } = await import('../models/matchModel.js');
    const matches = await Match.find({ leagueId: leagueId, season: season }).select('homeTeam awayTeam').lean();
    const teamIdsSet = new Set();
    for (const m of matches) {
      if (typeof m.homeTeam === 'number') teamIdsSet.add(m.homeTeam);
      if (typeof m.awayTeam === 'number') teamIdsSet.add(m.awayTeam);
    }
    const apiTeams = await getTeamsByLeagueSeason(leagueId, season);
    for (const item of apiTeams) {
      const id = item?.team?.id;
      if (typeof id === 'number') teamIdsSet.add(id);
    }
    const teamIds = Array.from(teamIdsSet);
    if (teamIds.length > 0) {
      console.log(`🔎 Filtered ${teamIds.length} teams from matches for league ${leagueId}, season ${season}`);
      const existingTeams = await Team.find({ teamId: { $in: teamIds } }).select('teamId').lean();
      const existingIds = new Set(existingTeams.map(t => t.teamId));
      const missingIds = teamIds.filter(id => !existingIds.has(id));
      if (missingIds.length > 0) {
        console.log(`🆕 Creating ${missingIds.length} missing Team docs...`);
        for (const id of missingIds) {
          try {
            const details = await getTeamDetails(id);
            if (details && details.team) {
              const t = details.team; const venue = details.venue || {};
              await Team.create({
                teamId: t.id,
                name: t.name,
                code: t.code,
                country: t.country,
                founded: t.founded,
                logo: t.logo,
                venue: {
                  id: venue.id,
                  name: venue.name,
                  city: venue.city,
                  capacity: venue.capacity,
                  surface: venue.surface,
                  image: venue.image
                }
              });
            }
          } catch (e) {
            console.warn(`⚠️ Failed creating Team ${id}:`, e?.message || e);
          }
        }
      }
      teams = await Team.find({ teamId: { $in: teamIds } });
    }
  } catch (err) {
    console.warn('⚠️ Could not filter teams by matches, falling back to all teams:', err?.message || err);
  }

  if (!teams || teams.length === 0) {
    teams = await Team.find({});
  }
  
  if (teams.length === 0) {
    console.log('⚠️ No teams found in database');
    return;
  }

  console.log(`📊 Found ${teams.length} teams to update statistics for`);
  
  const updatePromises = teams.map(team =>
    updateTeamStatistics(team.teamId, leagueId, season)
      .catch(error => {
        console.error(`❌ Error updating stats for team ${team.teamId} (${team.name}):`, error.message);
        return null;
      })
  );

  const results = await Promise.allSettled(updatePromises);
  const successful = results.filter(result => result.status === 'fulfilled' && result.value !== null).length;
  const failed = results.length - successful;
  
  console.log(`✅ Finished updating statistics for all teams in League ID: ${leagueId}, Season: ${season}`);
  console.log(`📊 Results: ${successful} successful, ${failed} failed`);
  
  return { successful, failed, total: results.length };
});

const processLeagueStats = async (league, leagueIndex, totalLeagues) => {
  const { getCurrentFootballSeason } = await import('../utils/seasonUtils.js');
  const leagueId = league.leagueId;
  const season = league.season || getCurrentFootballSeason();
  
  try {
    console.log(`🏆 [${leagueIndex + 1}/${totalLeagues}] Processing League ${leagueId} (${league.name || 'Unknown'}) for season ${season}...`);
    
    const result = await updateAllTeamsStatisticsInLeague(leagueId, season);
    
    if (result && result.successful > 0) {
      console.log(`✅ [${leagueIndex + 1}/${totalLeagues}] League ${leagueId}: ${result.successful} teams updated successfully`);
      return { successful: result.successful, failed: result.failed || 0 };
    } else {
      console.log(`⚠️ [${leagueIndex + 1}/${totalLeagues}] League ${leagueId}: No teams updated`);
      return { successful: 0, failed: 0 };
    }
  } catch (error) {
    console.error(`💥 [${leagueIndex + 1}/${totalLeagues}] Error updating stats for League ${leagueId}:`, error.message);
    return { successful: 0, failed: 1 };
  }
};

export const updateAllActiveTeamsStatistics = catchAsyncError(async () => {
  const startTime = Date.now();
  console.log('🚀 Starting team statistics update for next 2 days fixtures...');
  
  // Get matches for next 2 days (same logic as fixture update)
  const Match = (await import('../models/matchModel.js')).default;
  const now = new Date();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setUTCDate(today.getUTCDate() + 2);
  dayAfterTomorrow.setUTCHours(23, 59, 59, 999);
  
  console.log(`📅 Fetching matches from ${today.toISOString()} to ${dayAfterTomorrow.toISOString()}`);
  
  const matches = await Match.find({
    date: { $gte: today, $lte: dayAfterTomorrow }
  }).select('homeTeam awayTeam leagueId season').lean();
  
  if (!matches || matches.length === 0) {
    console.log('⚠️ No matches found for next 2 days');
    console.log('💡 Team statistics will be fetched on-demand when predictions are generated');
    return { successful: 0, failed: 0 };
  }
  
  console.log(`📊 Found ${matches.length} matches in next 2 days`);
  
  // Extract unique team IDs grouped by leagueId and season
  const teamsByLeagueSeason = new Map();
  
  for (const match of matches) {
    if (!match.leagueId || !match.season) {
      continue;
    }
    
    const key = `${match.leagueId}_${match.season}`;
    if (!teamsByLeagueSeason.has(key)) {
      teamsByLeagueSeason.set(key, {
        leagueId: match.leagueId,
        season: match.season,
        teamIds: new Set()
      });
    }
    
    const entry = teamsByLeagueSeason.get(key);
    if (typeof match.homeTeam === 'number') {
      entry.teamIds.add(match.homeTeam);
    }
    if (typeof match.awayTeam === 'number') {
      entry.teamIds.add(match.awayTeam);
    }
  }
  
  const totalUniqueTeams = Array.from(teamsByLeagueSeason.values()).reduce(
    (sum, entry) => sum + entry.teamIds.size, 0
  );
  
  console.log(`📊 Found ${teamsByLeagueSeason.size} unique league+season combinations`);
  console.log(`📊 Total unique teams to update: ${totalUniqueTeams}`);
  
  if (totalUniqueTeams === 0) {
    console.log('⚠️ No teams found in matches for next 2 days');
    return { successful: 0, failed: 0 };
  }
  
  // Process each league+season combination
  const leagueSeasonEntries = Array.from(teamsByLeagueSeason.values());
  const TEAM_BATCH_SIZE = 10; // Process teams in batches to avoid API overload
  let totalSuccessful = 0;
  let totalFailed = 0;
  let processedEntries = 0;
  
  for (let entryIndex = 0; entryIndex < leagueSeasonEntries.length; entryIndex++) {
    const entry = leagueSeasonEntries[entryIndex];
    const teamIds = Array.from(entry.teamIds);
    
    console.log(`\n🏆 [${entryIndex + 1}/${leagueSeasonEntries.length}] Processing League ${entry.leagueId}, Season ${entry.season} (${teamIds.length} teams)...`);
    
    // Process teams in batches
    const teamBatches = [];
    for (let i = 0; i < teamIds.length; i += TEAM_BATCH_SIZE) {
      teamBatches.push(teamIds.slice(i, i + TEAM_BATCH_SIZE));
    }
    
    for (let batchIndex = 0; batchIndex < teamBatches.length; batchIndex++) {
      const batch = teamBatches[batchIndex];
      const batchStart = batchIndex * TEAM_BATCH_SIZE;
      
      console.log(`   📦 Processing team batch ${batchIndex + 1}/${teamBatches.length} (teams ${batchStart + 1}-${Math.min(batchStart + batch.length, teamIds.length)} of ${teamIds.length})...`);
      
      const batchPromises = batch.map(teamId =>
        updateTeamStatistics(teamId, entry.leagueId, entry.season)
          .then(result => ({ success: true, teamId }))
          .catch(error => {
            console.error(`   ❌ Error updating stats for team ${teamId}:`, error.message);
            return { success: false, teamId, error: error.message };
          })
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const res = result.value;
          if (res.success) {
            totalSuccessful++;
          } else {
            totalFailed++;
          }
        } else {
          totalFailed++;
          console.error(`   ❌ Team batch item failed:`, result.reason);
        }
      });
    }
    
    processedEntries++;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`   ✅ [${entryIndex + 1}/${leagueSeasonEntries.length}] League ${entry.leagueId}, Season ${entry.season}: Completed | Elapsed: ${elapsed}s`);
  }
  
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Team statistics update completed in ${totalDuration}s!`);
  console.log(`📊 Total Results: ${totalSuccessful} successful, ${totalFailed} failed`);
  console.log(`📊 Processed ${processedEntries} league+season combinations`);
  
  return { successful: totalSuccessful, failed: totalFailed };
});


