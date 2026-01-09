import axios from 'axios';
import https from 'https';
import Bottleneck from 'bottleneck';
import dotenv from 'dotenv';

dotenv.config();

const isRetryableError = (error) => {
  if (error.response?.status >= 400 && error.response?.status < 500) {
    return error.response.status === 429;
  }
  return true;
};

const makeAPICallWithRetry = async (apiCall, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      if (error.response?.status === 429) {
        const retryAfter = parseInt(error.response.headers['retry-after'] || error.response.headers['x-ratelimit-reset'] || '60', 10);
        console.log(`🚫 Rate limit exceeded! Waiting ${retryAfter}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }
      
      if (!isRetryableError(error)) {
        throw error;
      }
      
      if (attempt === maxRetries) throw error;
      
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`⚠️ API call failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const minuteLimiter = new Bottleneck({
  minTime: parseInt(process.env.API_MIN_TIME_MS || '0', 10),
  maxConcurrent: parseInt(process.env.API_MAX_CONCURRENT || '10', 10),
  reservoir: parseInt(process.env.API_RESERVOIR || '350', 10),
  reservoirRefreshAmount: parseInt(process.env.API_RESERVOIR_REFRESH || '350', 10),
  reservoirRefreshInterval: parseInt(process.env.API_RESERVOIR_REFRESH_MS || '60000', 10)
});

const calculateMillisecondsUntilMidnightUTC = () => {
  const now = new Date();
  const nowUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds()
  ));
  
  const nextMidnightUTC = new Date(Date.UTC(
    nowUTC.getUTCFullYear(),
    nowUTC.getUTCMonth(),
    nowUTC.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  
  return nextMidnightUTC.getTime() - nowUTC.getTime();
};

const dailyReservoir = parseInt(process.env.API_DAILY_RESERVOIR || '70000', 10);
const dailyLimiter = new Bottleneck({
  reservoir: dailyReservoir,
  reservoirRefreshAmount: dailyReservoir,
  reservoirRefreshInterval: calculateMillisecondsUntilMidnightUTC(),
  maxConcurrent: 1,
  minTime: 0
});

const scheduleDailyReset = () => {
  const msUntilMidnight = calculateMillisecondsUntilMidnightUTC();
  
  setTimeout(() => {
    const currentReservoir = dailyLimiter.counts().RESERVOIR;
    const needed = dailyReservoir - currentReservoir;
    
    if (needed > 0) {
      dailyLimiter.incrementReservoir(needed);
    } else {
      dailyLimiter.updateSettings({
        reservoir: dailyReservoir
      });
      dailyLimiter.incrementReservoir(dailyReservoir);
    }
    
    dailyLimiter.updateSettings({
      reservoirRefreshInterval: 86400000
    });
    
    console.log(`🔄 Daily API quota reset at UTC midnight (${dailyReservoir} tokens available)`);
    
    scheduleDailyReset();
  }, msUntilMidnight);
};

scheduleDailyReset();

minuteLimiter.chain(dailyLimiter);

const limiter = minuteLimiter;

const msUntilMidnight = calculateMillisecondsUntilMidnightUTC();
const hoursUntilMidnight = Math.floor(msUntilMidnight / (1000 * 60 * 60));
const minutesUntilMidnight = Math.floor((msUntilMidnight % (1000 * 60 * 60)) / (1000 * 60));

console.log(
  `⚙️ API limiter configured: ` +
  `minTime=${parseInt(process.env.API_MIN_TIME_MS || '0', 10)}ms (0 = token bucket only), ` +
  `maxConcurrent=${parseInt(process.env.API_MAX_CONCURRENT || '2', 10)}, ` +
  `perMinute=${parseInt(process.env.API_RESERVOIR || '350', 10)}/` +
  `${parseInt(process.env.API_RESERVOIR_REFRESH_MS || '60000', 10)}ms, ` +
  `perDay=${parseInt(process.env.API_DAILY_RESERVOIR || '70000', 10)}/day (resets at 00:00 UTC, ${hoursUntilMidnight}h ${minutesUntilMidnight}m until next reset)`
);

const FOOTBALL_API_CONFIG = {
  baseUrl: process.env.RAPIDAPI_BASE_URL || 'https://v3.football.api-sports.io',
  apiKey: process.env.RAPIDAPI_KEY,
  host: process.env.RAPIDAPI_HOST || 'v3.football.api-sports.io',
  endpoints: {
    leagues: '/leagues',
    fixtures: '/fixtures'
  },
  timeout: parseInt(process.env.RAPIDAPI_TIMEOUT_MS || '60000', 10)
};

const HTTPS_MAX_SOCKETS = parseInt(process.env.HTTP_MAX_SOCKETS || '200', 10);
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: HTTPS_MAX_SOCKETS });

const footballApi = axios.create({
  baseURL: FOOTBALL_API_CONFIG.baseUrl,
  timeout: FOOTBALL_API_CONFIG.timeout,
  httpsAgent,
  headers: {
    'X-RapidAPI-Key': FOOTBALL_API_CONFIG.apiKey,
    'X-RapidAPI-Host': FOOTBALL_API_CONFIG.host,
    'Content-Type': 'application/json'
  }
});

export const getTeamsByLeagueSeason = limiter.wrap(async (leagueId, season) => {
  try {
    console.log(`🔄 Fetching teams for league ${leagueId}, season ${season}`);
    const response = await footballApi.get(`/teams`, {
      params: {
        league: leagueId,
        season: season
      }
    });
    console.log('✅ Successfully fetched league teams from API-SPORTS');
    console.log('📊 Teams data received:', response.data?.response?.length || 0);
    return response.data?.response || [];
  } catch (error) {
    console.error('💥 Failed to fetch league teams from API-SPORTS:', error.message);
    return [];
  }
});

const DEBUG_API_CALLS = process.env.DEBUG_API_CALLS === 'true';

footballApi.interceptors.request.use(
  (config) => {
    if (DEBUG_API_CALLS) {
      console.log('🔍 API CALL:', config.method?.toUpperCase(), config.url);
    }
    return config;
  },
  (error) => {
    console.error('❌ Request Error:', error.message);
    return Promise.reject(error);
  }
);

footballApi.interceptors.response.use(
  (response) => {
    const rateLimit = response.headers['x-ratelimit-limit'] || response.headers['X-RateLimit-Limit'];
    const rateLimitRemaining = response.headers['x-ratelimit-remaining'] || response.headers['X-RateLimit-Remaining'];
    
    if (rateLimitRemaining && parseInt(rateLimitRemaining) < 50) {
      console.warn(`⚠️ Rate limit running low: ${rateLimitRemaining}/${rateLimit} remaining`);
    }
    
    if (DEBUG_API_CALLS) {
      console.log('✅ API Response:', response.status, response.config.url);
      if (rateLimitRemaining) {
        console.log(`📊 Rate Limit: ${rateLimitRemaining}/${rateLimit} remaining`);
      }
    }
    
    return response;
  },
  (error) => {
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'] || error.response.headers['Retry-After'];
      console.error('🚫 Rate limit exceeded!', retryAfter ? `Retry after ${retryAfter}s` : '');
      console.error('   Headers:', error.response.headers);
    } else if (error.code === 'ENOTFOUND') {
      console.error('❌ DNS Error: Cannot resolve host', error.hostname);
      console.error('💡 Check your FOOTBALL_API_HOST in .env file');
    } else if (error.response) {
      console.error('❌ API Error Response:', error.response.status, error.response.statusText);
      if (DEBUG_API_CALLS) {
        console.error('   Headers:', error.response.headers);
        console.error('   Data:', error.response.data);
      }
    } else if (error.request) {
      console.error('❌ Network Error: No response received');
      console.error('💡 Check your internet connection and API endpoint');
    } else {
      console.error('❌ Request Setup Error:', error.message);
    }
    return Promise.reject(error);
  }
);

export const getLeagueDetailsById = limiter.wrap(async (leagueId) => {
  try {
    console.log(`🔄 Fetching league details for league ID: ${leagueId}`);
    
    const response = await footballApi.get(FOOTBALL_API_CONFIG.endpoints.leagues, {
      params: { id: leagueId }
    });
    
    const leagueData = response.data?.response?.[0] || null;
    
    if (leagueData) {
      console.log(`✅ Successfully fetched league details for ID: ${leagueId}`);
      console.log(`📊 Found ${leagueData.seasons?.length || 0} seasons`);
    } else {
      console.log(`⚠️ No league data found for ID: ${leagueId}`);
    }
    
    return leagueData;
  } catch (error) {
    console.error(`💥 Failed to fetch league details for ID ${leagueId}:`, error.message);
    return null;
  }
});

export const getAllLeaguesFromAPI = limiter.wrap(async () => {
  try {
    console.log('🔄 Fetching all leagues from API-SPORTS (without season filter to get all seasons)...');
    
    // Call /leagues without season parameter to get all leagues with all their seasons
    // This allows us to check which season has current: true for each league
    // Since this function is already wrapped with limiter.wrap(), we don't need limiter.schedule() again
    const response = await footballApi.get(FOOTBALL_API_CONFIG.endpoints.leagues, { params: {} });
    
    const allLeagues = response.data?.response || [];
    
    // Filter to only include leagues that have at least one season with current: true
    const leaguesWithCurrentSeason = allLeagues.filter(league => {
      const seasons = Array.isArray(league.seasons) ? league.seasons : [];
      return seasons.some(s => s?.current === true);
    });
    
    console.log('✅ Successfully fetched leagues from API-SPORTS');
    console.log(`📊 Total leagues from API: ${allLeagues.length}`);
    console.log(`📊 Leagues with current season: ${leaguesWithCurrentSeason.length}`);
    
    return leaguesWithCurrentSeason;
  } catch (error) {
    console.error('💥 Failed to fetch leagues from API-SPORTS:', error.message);
    throw error;
  }
});

export const getLiveMatches = limiter.wrap(async (leagueIds) => {
  try {
    console.log('🔄 Fetching live matches for leagues:', leagueIds);
    
    const League = (await import('../models/leaugeModel.js')).default;
    
    const leagues = await League.find({ leagueId: { $in: leagueIds } });
    const seasons = [...new Set(leagues.map(l => l.season))];
    
    console.log(`📅 Found seasons in database: ${seasons.join(', ')}`);
    
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const currentSeason = currentMonth >= 8 ? currentYear : currentYear - 1;
    const previousSeason = currentSeason - 1;
    
    const prioritySeasons = [currentSeason, previousSeason];
    
    seasons.forEach(season => {
      if (!prioritySeasons.includes(season)) {
        prioritySeasons.push(season);
      }
    });
    
    if (prioritySeasons.length === 0 || prioritySeasons.every(s => s === 2010)) {
      console.log('⚠️ Priority seasons seem to be old (2010), using ONLY database seasons');
      prioritySeasons.length = 0;
      prioritySeasons.push(...seasons);
    }
    
    console.log(`🔍 Will try seasons in priority order: ${prioritySeasons.join(', ')} (Database: ${seasons.join(', ')}, Auto-detected: ${currentSeason})`);
    
    let allMatches = [];
    
    for (const season of prioritySeasons) {
      console.log(`🔍 Trying season ${season}...`);
      
      for (const leagueId of leagueIds) {
        try {
          console.log(`   🏆 Fetching data for League ${leagueId}...`);
          
          const liveResponse = await limiter.schedule(() => 
            footballApi.get(FOOTBALL_API_CONFIG.endpoints.fixtures, {
              params: {
                league: leagueId,
                season: season,
                live: 'all'
              }
            })
          );
          
          const today = new Date();
          const fromDate = today.toISOString().split('T')[0];
          
          const todayResponse = await limiter.schedule(() => 
            footballApi.get(FOOTBALL_API_CONFIG.endpoints.fixtures, {
              params: {
                league: leagueId,
                season: season,
                date: fromDate
              }
            })
          );
          
          const liveMatches = liveResponse.data?.response || [];
          const todayMatches = todayResponse.data?.response || [];
          
          console.log(`      📊 League ${leagueId} - Live: ${liveMatches.length}, Today: ${todayMatches.length}`);
          
          allMatches.push(...liveMatches);
          allMatches.push(...todayMatches);
          
        } catch (error) {
          console.log(`      ❌ League ${leagueId} failed: ${error.message}`);
        }
      }
    }
    
    const uniqueMatches = [];
    const seenIds = new Set();
    
    allMatches.forEach(match => {
      if (!seenIds.has(match.fixture.id)) {
        seenIds.add(match.fixture.id);
        uniqueMatches.push(match);
      }
    });
    
    console.log('✅ Successfully fetched data from API-SPORTS');
    console.log(`📊 Total unique matches: ${uniqueMatches.length}`);
    
    if (uniqueMatches.length > 0) {
      console.log('🔍 Sample match data:');
      uniqueMatches.slice(0, 3).forEach(match => {
        console.log(`   ${match.teams.home.name} vs ${match.teams.away.name} - Status: ${match.fixture.status.short} (${match.fixture.status.long})`);
      });
    }
    
    return uniqueMatches;
  } catch (error) {
    console.error('💥 Failed to fetch live matches from API-SPORTS:', error.message);
    return [];
  }
});

export const getNextTwoDaysFixtures = limiter.wrap(async (leagueIds) => {
  try {
    console.log('🔄 Fetching next 2 days fixtures for leagues:', leagueIds);
    
    const today = new Date();
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(today.getDate() + 2);
    
    const fromDate = today.toISOString().split('T')[0];
    const toDate = dayAfterTomorrow.toISOString().split('T')[0];
    
    console.log('📅 Date range:', fromDate, 'to', toDate);
    
    const League = (await import('../models/leaugeModel.js')).default;
    
    const leagues = await League.find({ leagueId: { $in: leagueIds } });
    const dbSeasons = [...new Set(leagues.map(l => l.season).filter(Boolean))];
    
    console.log(`📅 Found seasons in database: ${dbSeasons.join(', ')}`);
    
    let seasons = [...dbSeasons];
    
    if (dbSeasons.length === 0) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const currentSeason = currentMonth >= 8 ? currentYear : currentYear - 1;
    const previousSeason = currentSeason - 1;
      seasons.push(currentSeason, previousSeason);
      console.log(`⚠️ No seasons in database, using auto-detected: ${currentSeason}, ${previousSeason}`);
    }
    
    console.log(`🔍 Will try seasons (DB first): ${seasons.join(', ')}`);
    
    let allFixtures = [];
    
    for (const season of seasons) {
      console.log(`🔍 Trying season ${season} for fixtures...`);
      
      for (const leagueId of leagueIds) {
        try {
          console.log(`   🏆 Fetching fixtures for League ${leagueId}, Season ${season}...`);
          console.log(`   📋 Request params: league=${leagueId}, season=${season}, from=${fromDate}, to=${toDate}`);
          
          const limiterStatus = limiter.counts();
          const minuteLimiterStatus = minuteLimiter.counts();
          const dailyLimiterStatus = dailyLimiter.counts();
          
          console.log(`   📊 Limiter status: QUEUED=${limiterStatus.QUEUED}, RUNNING=${limiterStatus.RUNNING}`);
          console.log(`   📊 Minute limiter: QUEUED=${minuteLimiterStatus.QUEUED}, RUNNING=${minuteLimiterStatus.RUNNING}`);
          console.log(`   📊 Daily limiter: QUEUED=${dailyLimiterStatus.QUEUED}, RUNNING=${dailyLimiterStatus.RUNNING}`);
          
          const startTime = Date.now();
          console.log(`   ⏱️ Starting API call at ${new Date().toISOString()}...`);
          
          const SCHEDULE_TIMEOUT_MS = parseInt(process.env.API_SCHEDULE_TIMEOUT_MS || '30000', 10);
          
          console.log(`   🔄 Making API request (already rate-limited by wrapper)...`);
          
          const httpStartTime = Date.now();
          console.log(`   🔄 Executing HTTP request to API...`);
          
          const HTTP_TIMEOUT_MS = parseInt(process.env.RAPIDAPI_TIMEOUT_MS || '60000', 10);
          
          const httpPromise = footballApi.get(FOOTBALL_API_CONFIG.endpoints.fixtures, {
              params: {
                league: leagueId,
                season: season,
                from: fromDate,
                to: toDate
              }
          });
          
          const httpTimeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error(`HTTP request timeout after ${HTTP_TIMEOUT_MS}ms`));
            }, HTTP_TIMEOUT_MS);
          });
          
          let response;
          try {
            response = await Promise.race([httpPromise, httpTimeoutPromise]);
            const httpDuration = Date.now() - httpStartTime;
            console.log(`   ✅ HTTP request completed in ${httpDuration}ms`);
          } catch (httpError) {
            const httpDuration = Date.now() - httpStartTime;
            console.log(`   ❌ HTTP request failed after ${httpDuration}ms: ${httpError.message}`);
            throw httpError;
          }
          
          const endTime = Date.now();
          const duration = endTime - startTime;
          console.log(`   ✅ API call completed in ${duration}ms`);
          
          const fixtures = response.data?.response || [];
          console.log(`      📊 League ${leagueId} - Found ${fixtures.length} fixtures`);
          
          if (fixtures.length > 0) {
            console.log(`      ✅ Successfully retrieved ${fixtures.length} fixtures for League ${leagueId}`);
          }
          
          allFixtures.push(...fixtures);
          
        } catch (error) {
          const errorTime = Date.now();
          console.log(`      ❌ League ${leagueId} failed at ${new Date().toISOString()}: ${error.message}`);
          if (error.message && error.message.includes('timeout')) {
            console.log(`      ⏱️ TIMEOUT: Request exceeded timeout limit`);
            const limiterStatusAfter = limiter.counts();
            console.log(`      📊 Limiter status after timeout: QUEUED=${limiterStatusAfter.QUEUED}, RUNNING=${limiterStatusAfter.RUNNING}`);
          }
          if (error.code) {
            console.log(`      🔍 Error code: ${error.code}`);
          }
          if (error.response) {
            console.log(`      🔍 Response status: ${error.response.status}`);
          }
        }
      }
    }
    
    const uniqueFixtures = [];
    const seenIds = new Set();
    
    allFixtures.forEach(fixture => {
      if (!seenIds.has(fixture.fixture.id)) {
        seenIds.add(fixture.fixture.id);
        uniqueFixtures.push(fixture);
      }
    });
    
    console.log('✅ Successfully fetched fixtures from API-SPORTS');
    console.log(`📊 Total unique fixtures: ${uniqueFixtures.length}`);
    
    return uniqueFixtures;
  } catch (error) {
    console.error('💥 Failed to fetch fixtures from API-SPORTS:', error.message);
    throw error;
  }
});

export const getTeamDetails = limiter.wrap(async (teamId) => {
  try {
    console.log(`🔄 Fetching team details for team ID: ${teamId}`);
    
    const response = await footballApi.get(`/teams`, {
      params: { id: teamId }
    });
    
    console.log('✅ Successfully fetched team details from API-SPORTS');
    console.log('📊 Team data received:', response.data?.response?.length || 0);
    
    return response.data?.response?.[0] || null;
  } catch (error) {
    console.error('💥 Failed to fetch team details from API-SPORTS:', error.message);
    return null;
  }
});

export const getFixtures = limiter.wrap(async (leagueId, season, teamId) => {
  try {
    console.log(`🔄 Fetching fixtures for team ID: ${teamId}, league: ${leagueId}, season: ${season}`);
    
    const response = await footballApi.get(`/fixtures`, {
      params: { 
        team: teamId,
        league: leagueId,
        season: season
      }
    });
    
    console.log('✅ Successfully fetched fixtures from API-SPORTS');
    console.log('📊 Fixtures data received:', response.data?.response?.length || 0);
    
    return response.data;
  } catch (error) {
    console.error('💥 Failed to fetch fixtures from API-SPORTS:', error.message);
    return null;
  }
});

export const getFixturesByIds = async (fixtureIds) => {
  if (!fixtureIds || !Array.isArray(fixtureIds) || fixtureIds.length === 0) {
    return [];
  }
  
  try {
    console.log(`🔄 Fetching ${fixtureIds.length} fixtures by IDs from API-SPORTS (in batches of 10 with waits)...`);
    
    const fetchSingleFixture = limiter.wrap(async (id) => {
        const response = await footballApi.get(`/fixtures`, {
          params: {
          id: id
        }
      });
      return response.data?.response?.[0] || null;
    });
    
    const fixtures = [];
    let successCount = 0;
    let failCount = 0;
    let processedCount = 0;
    const BATCH_SIZE = 10;
    const BATCH_WAIT_MS = 2000;
    
    const totalBatches = Math.ceil(fixtureIds.length / BATCH_SIZE);
    
    console.log(`📊 Total fixtures to process: ${fixtureIds.length} (will be processed in ${totalBatches} batches of ${BATCH_SIZE})`);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, fixtureIds.length);
      const batch = fixtureIds.slice(batchStart, batchEnd);
      
      if (batch.length === 0) {
        console.log(`⚠️ Batch ${batchIndex + 1} is empty, skipping...`);
        continue;
      }
      
      console.log(`📦 Starting batch ${batchIndex + 1}/${totalBatches} (fixtures ${batchStart + 1}-${batchEnd} of ${fixtureIds.length})...`);
      
      for (let i = 0; i < batch.length; i++) {
        const fixtureId = batch[i];
        const globalIndex = batchStart + i;
        processedCount++;
        
        try {
          console.log(`🔄 Fetching fixture ${globalIndex + 1}/${fixtureIds.length} (ID: ${fixtureId})...`);
          
          const fixture = await fetchSingleFixture(fixtureId);
          
          if (fixture) {
            fixtures.push(fixture);
            successCount++;
            console.log(`✅ Successfully fetched fixture ${globalIndex + 1}/${fixtureIds.length} (ID: ${fixtureId})`);
          } else {
            console.log(`⚠️ No data returned for fixture ${fixtureId}`);
            failCount++;
        }
      } catch (singleError) {
        console.log(`⚠️ Failed to fetch fixture ${fixtureId}:`, singleError.message);
          failCount++;
      }
      }
      
      console.log(`✅ Batch ${batchIndex + 1}/${totalBatches} completed (${batch.length} fixtures processed)`);
      console.log(`📊 Total progress: ${processedCount}/${fixtureIds.length} fixtures processed (${successCount} success, ${failCount} failed)`);
      
      if (processedCount !== batchEnd) {
        console.error(`❌ ERROR: Processed count (${processedCount}) doesn't match expected (${batchEnd})!`);
      }
      
      if (batchIndex < totalBatches - 1) {
        console.log(`⏳ Waiting ${BATCH_WAIT_MS}ms before starting next batch...`);
        await delay(BATCH_WAIT_MS);
      }
    }
    
    if (processedCount !== fixtureIds.length) {
      console.error(`❌ WARNING: Not all fixtures were processed! Expected: ${fixtureIds.length}, Processed: ${processedCount}`);
    } else {
      console.log(`✅ Verification: All ${fixtureIds.length} fixtures were processed (none skipped)`);
    }
    
    if (fixtures.length > 0) {
      console.log(`✅ Successfully fetched ${successCount} out of ${fixtureIds.length} fixtures by IDs`);
    } else {
      console.log(`⚠️ No fixtures were successfully fetched`);
    }
    
    if (failCount > 0) {
      console.log(`⚠️ ${failCount} fixtures failed to fetch`);
    }
    
    return fixtures;
  } catch (error) {
    console.error('💥 Failed to fetch fixtures by IDs from API-SPORTS:', error.message);
    return [];
  }
};

export const getFinishedLeagueFixtures = limiter.wrap(async (leagueId, season, page = 1) => {
  try {
    console.log(`🔄 Fetching finished fixtures for league: ${leagueId}, season: ${season}, page: ${page}`);
    
    const statuses = ['FT', 'AET', 'PEN'];
    let allFixtures = [];
    
    for (const status of statuses) {
      const statusStartTime = Date.now();
      try {
        const params = {
          league: String(leagueId),
          season: String(season),
          status: status
        };
        
        console.log(`   🔄 Fetching ${status} fixtures for league ${leagueId}, season ${season}...`);
        
        const HTTP_TIMEOUT_MS = parseInt(process.env.RAPIDAPI_TIMEOUT_MS || '60000', 10);
        
        const httpPromise = footballApi.get(`/fixtures`, { params });
        const httpTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(`HTTP request timeout after ${HTTP_TIMEOUT_MS}ms`));
          }, HTTP_TIMEOUT_MS);
        });
        
        const response = await Promise.race([httpPromise, httpTimeoutPromise]);
        
        const statusDuration = Date.now() - statusStartTime;
        
        if (response.data?.response && Array.isArray(response.data.response)) {
          console.log(`   ✅ ${status}: ${response.data.response.length} fixtures (${statusDuration}ms)`);
          allFixtures.push(...response.data.response);
        } else {
          console.log(`   ❌ ${status}: No response data or empty response (${statusDuration}ms)`);
        }
      } catch (error) {
        const statusDuration = Date.now() - statusStartTime;
        console.log(`   ⚠️ Failed to fetch ${status} fixtures for league ${leagueId} (${statusDuration}ms):`, error.message);
      }
    }
    
    const result = {
      get: 'fixtures',
      parameters: { league: leagueId, season: season, status: 'FT,AET,PEN' },
      errors: [],
      results: allFixtures.length,
      paging: { current: page, total: 1 },
      response: allFixtures
    };
    
    console.log(`📊 getFinishedLeagueFixtures returning: ${allFixtures.length} total fixtures for league ${leagueId}, season ${season}`);
    return result;
  } catch (error) {
    console.error('💥 Failed to fetch finished league fixtures from API-SPORTS:', error.message);
    return null;
  }
});

export const getTeamStatistics = limiter.wrap(async (teamId, leagueId, season) => {
  try {
    console.log(`🔄 Fetching team statistics for team ID: ${teamId}, league: ${leagueId}, season: ${season}`);
    
    const response = await footballApi.get(`/teams/statistics`, {
      params: { 
        team: teamId,
        league: leagueId,
        season: season
      }
    });
    
    console.log('✅ Successfully fetched team statistics from API-SPORTS');
    const statsPayload = response.data?.response;
    const keysCount = statsPayload ? Object.keys(statsPayload).length : 0;
    console.log('📊 Statistics object keys:', keysCount);
    
    return statsPayload || null;
  } catch (error) {
    console.error('💥 Failed to fetch team statistics from API-SPORTS:', error.message);
    return null;
  }
});

export default footballApi;