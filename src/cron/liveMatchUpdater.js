import mongoose from 'mongoose';
import Match from '../models/matchModel.js';
import { getFixturesByIds } from '../services/footballApiService.js';

const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'CANC', 'ABD', 'AWD', 'WO'];
const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'PST'];
const ACTUAL_LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT'];

let lastUpdateTime = 0;
const MIN_UPDATE_INTERVAL = 15000;

export const updateLiveMatches = async () => {
  const now = Date.now();
  
  if (now - lastUpdateTime < MIN_UPDATE_INTERVAL) {
    console.log('⏱️ Rate limited - skipping update');
    return;
  }
  
  const startTime = process.hrtime();
  const nowUTC = new Date();
  const todayStart = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate(), 0, 0, 0, 0));
  const todayEnd = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate(), 23, 59, 59, 999));
  
  const maxTrackingWindow = new Date(nowUTC.getTime() - 6 * 60 * 60 * 1000);
  const maxTrackingWindowLive = new Date(nowUTC.getTime() - 24 * 60 * 60 * 1000);
  
  try {
    console.log('🔄 Starting LIVE matches update (matches already in progress)...');
    console.log(`🕒 Current UTC time: ${nowUTC.toISOString()}`);
    
    const matches = await Match.find({
      $and: [
        {
          $or: [
            {
              date: {
                $gte: todayStart,
                $lte: todayEnd
              }
            },
            {
              date: {
                $gte: maxTrackingWindowLive,
                $lt: todayStart
              },
              'status.short': { $in: LIVE_STATUSES }
            },
            {
              date: {
                $gte: maxTrackingWindow,
                $lt: todayStart
              },
              'status.short': { $in: ['PST', 'SUSP'] }
            },
            {
              date: {
                $gte: maxTrackingWindow,
                $lt: todayStart
              },
              'status.short': { $nin: [...FINISHED_STATUSES, ...LIVE_STATUSES, 'PST', 'SUSP'] }
            }
          ]
        },
        {
          $or: [
            {
              'status.short': { $in: LIVE_STATUSES }
            },
            {
              date: { $lt: nowUTC },
              'status.short': { $nin: FINISHED_STATUSES }
            }
          ]
        }
      ]
    }).select('_id leagueId fixtureId status date homeTeam awayTeam');
    
    if (matches.length === 0) {
      console.log('ℹ️ No live matches scheduled for today or from yesterday');
      return;
    }
    
    console.log(`📊 Found ${matches.length} matches (today or from yesterday - LIVE matches tracked until finished or 24h old, PST/SUSP tracked for 6h, others within 6h)`);
    
    const matchesToTrack = matches.filter(match => {
      if (trackedMatches.has(match._id.toString())) {
        return false;
      }
      
      const matchDate = new Date(match.date);
      const matchStatus = match.status?.short;
      const hasStarted = matchDate < nowUTC;
      const isNotFinished = !matchStatus || !FINISHED_STATUSES.includes(matchStatus);
      
      if (matchStatus === 'PST') {
        if (matchDate < maxTrackingWindow) {
          console.log(`⏸️ PST match older than 6h: ${match.homeTeam} vs ${match.awayTeam} - Stopping tracking`);
          return false;
        }
        
        const twoHoursLater = new Date(nowUTC.getTime() + 2 * 60 * 60 * 1000);
        if (matchDate > twoHoursLater) {
          return false;
        }
        
        return true;
      }
      
      if (matchStatus === 'SUSP') {
        if (matchDate < maxTrackingWindow) {
          console.log(`⏸️ SUSP match older than 6h: ${match.homeTeam} vs ${match.awayTeam} - Stopping tracking`);
          return false;
        }
        
        const twoHoursLater = new Date(nowUTC.getTime() + 2 * 60 * 60 * 1000);
        if (matchDate > twoHoursLater) {
          return false;
        }
        
        return true;
      }
      
      const isLive = matchStatus && ACTUAL_LIVE_STATUSES.includes(matchStatus);
      
      if (isLive) {
        if (matchDate < maxTrackingWindowLive) {
          console.log(`⏰ LIVE match older than 24h: ${match.homeTeam} vs ${match.awayTeam} - Stopping tracking`);
          return false;
        }
        return true;
      }
      
      if (matchDate < maxTrackingWindow) {
        return false;
      }
      
      return isLive || (hasStarted && isNotFinished);
    });
    
    if (matchesToTrack.length === 0) {
      console.log('ℹ️ No live matches need tracking');
      return;
    }
    
    console.log(`🎯 Tracking ${matchesToTrack.length} matches (LIVE or started)`);
    
    console.log('🔍 Matches being tracked:');
    matchesToTrack.slice(0, 5).forEach(match => {
      const matchTime = new Date(match.date);
      const matchTimeStr = matchTime.toISOString();
      const elapsed = match.status?.elapsed || 0;
      const status = match.status?.short || 'NS';
      const hasStarted = matchTime < nowUTC;
      const isFromYesterday = matchTime < todayStart;
      let note = '';
      if (hasStarted && status === 'NS') {
        note = ' (started, checking API for status)';
      } else if (isFromYesterday) {
        note = ' (from yesterday, crossing midnight)';
      }
      console.log(`   ${match.homeTeam} vs ${match.awayTeam} at ${matchTimeStr} - Status: ${status} (Elapsed: ${elapsed}min)${note}`);
    });
    
    const fixtureIds = matchesToTrack
      .map(match => match.fixtureId)
      .filter(id => id != null && id !== undefined);
    
    if (fixtureIds.length === 0) {
      console.log('⚠️ No valid fixture IDs found in matches to track');
      return;
    }
    
    console.log(`📡 Fetching ${fixtureIds.length} matches from API using fixture IDs...`);
    
    const liveMatchesData = await getFixturesByIds(fixtureIds);
    
    if (!liveMatchesData || liveMatchesData.length === 0) {
      console.log('ℹ️ No live match data available from API');
      return;
    }
    
    console.log(`📡 Received data for ${liveMatchesData.length} matches from API`);
    
    try {
      const League = (await import('../models/leaugeModel.js')).default;
      const { syncLeagueSeasonsFromMatches } = await import('../utils/leagueSeasonSync.js');
      await syncLeagueSeasonsFromMatches(League, liveMatchesData);
    } catch (syncError) {
      console.error('⚠️ Error syncing league seasons from live matches:', syncError.message);
    }
    
    const bulkOps = [];
    let updatedCount = 0;
    let skippedCount = 0;
    let finishedCount = 0;
    
    const apiDataMap = new Map();
    liveMatchesData.forEach(match => {
      if (match.fixture?.id) {
        apiDataMap.set(match.fixture.id, match);
      }
    });
    
    for (const match of matchesToTrack) {
      try {
        const liveData = apiDataMap.get(match.fixtureId);
        
        if (!liveData) {
          console.log(
            `⚠️ Skipping match ${match.fixtureId} - No API data found (leagueId: ${match.leagueId}, date: ${new Date(match.date).toISOString()})`
          );
          skippedCount++;
          continue;
        }
        
        const { fixture, goals, score } = liveData;
        const status = fixture?.status;
        
        if (!status || !goals || !score) {
          console.log(`⚠️ Skipping match ${match.fixtureId} - Missing required data (status: ${!!status}, goals: ${!!goals}, score: ${!!score})`);
          skippedCount++;
          continue;
        }
        
        const isFinished = status.short === 'FT' || status.long === 'Match Finished' || FINISHED_STATUSES.includes(status.short);
        const wasPstOrSusp = match.status?.short === 'PST' || match.status?.short === 'SUSP';
        const resumedToLive = wasPstOrSusp && ACTUAL_LIVE_STATUSES.includes(status.short);
        
        if (isFinished) {
          finishedCount++;
          if (wasPstOrSusp) {
            console.log(`🏁 PST/SUSP MATCH FINISHED: ${match.homeTeam} vs ${match.awayTeam} - Final Score: ${goals.home || 0}-${goals.away || 0} - Status: ${match.status?.short} → ${status.short}`);
          } else {
            console.log(`🏁 MATCH FINISHED: ${match.homeTeam} vs ${match.awayTeam} - Final Score: ${goals.home || 0}-${goals.away || 0} (will stop tracking)`);
          }
        } else if (resumedToLive) {
          console.log(`▶️ PST/SUSP MATCH RESUMED: ${match.homeTeam} vs ${match.awayTeam} - Status: ${match.status?.short} → ${status.short} - Will continue tracking until finished`);
        }
        
        const updateData = {
          date: fixture?.date ? new Date(fixture.date) : match.date,
          'status.short': status.short || 'NS',
          'status.long': status.long || 'Not Started',
          'status.elapsed': status.elapsed || 0,
          'goals.home': goals.home || 0,
          'goals.away': goals.away || 0,
          'score.halftime': score.halftime || { home: 0, away: 0 },
          'score.fulltime': score.fulltime || { home: 0, away: 0 },
          'score.extratime': score.extratime || { home: 0, away: 0 },
          'score.penalty': score.penalty || { home: 0, away: 0 },
          updatedAt: new Date()
        };
        
        if (fixture?.date && new Date(fixture.date).getTime() !== new Date(match.date).getTime()) {
          console.log(`📅 DATE/TIME UPDATE: ${match.homeTeam} vs ${match.awayTeam} - Status: ${status.short} - Old: ${new Date(match.date).toISOString()} → New: ${new Date(fixture.date).toISOString()}`);
        }
        
        if (ACTUAL_LIVE_STATUSES.includes(status.short)) {
          const updateTime = new Date().toISOString();
          console.log(`📊 LIVE MATCH UPDATE [${updateTime}]: ${match.homeTeam} vs ${match.awayTeam}`);
          console.log(`   🏟️ Status: ${status.short || 'NS'} (${status.long || 'Not Started'}) - Elapsed: ${status.elapsed || 0}min`);
          console.log(`   ⚽ Goals: ${goals.home || 0} - ${goals.away || 0}`);
          console.log(`   📊 Score: HT ${score.halftime?.home || 0}-${score.halftime?.away || 0} | FT ${score.fulltime?.home || 0}-${score.fulltime?.away || 0}`);
        } else if (status.short === 'PST' || status.short === 'SUSP') {
          const lastUpdate = match.updatedAt || match.createdAt;
          const minutesSinceUpdate = (nowUTC.getTime() - new Date(lastUpdate).getTime()) / (1000 * 60);
          if (minutesSinceUpdate >= 10 || match.status?.short !== status.short) {
            const updateTime = new Date().toISOString();
            const statusEmoji = status.short === 'PST' ? '⏸️' : '⏸️';
            console.log(`${statusEmoji} PST/SUSP MATCH CHECK [${updateTime}]: ${match.homeTeam} vs ${match.awayTeam}`);
            console.log(`   🏟️ Status: ${status.short || 'NS'} (${status.long || 'Not Started'})`);
          }
        }
        
        if (status.short !== match.status?.short) {
          console.log(`🔄 STATUS CHANGE: ${match.homeTeam} vs ${match.awayTeam}: ${match.status?.short || 'NS'} → ${status.short}`);
        }
        
        bulkOps.push({
          updateOne: {
            filter: { _id: match._id },
            update: { $set: updateData }
          }
        });
        
        updatedCount++;
        
      } catch (error) {
        console.error(`❌ Error processing match ${match.fixtureId}:`, error.message);
        skippedCount++;
      }
    }
    
    if (bulkOps.length > 0) {
      await Match.bulkWrite(bulkOps, { ordered: false });
      console.log(`✅ Updated ${updatedCount} matches in bulk`);
    }
    
    lastUpdateTime = now;
    const [seconds] = process.hrtime(startTime);
    const endTime = new Date().toISOString();
    console.log(`🏁 Live update completed at ${endTime} in ${seconds}s. Updated: ${updatedCount}, Skipped: ${skippedCount}, Finished: ${finishedCount}`);
    
    if (updatedCount > 0) {
      console.log(`🎯 Successfully updated ${updatedCount} matches with latest data!`);
    }
    
    console.log(`📊 Currently tracking: ${matchesToTrack.length} live matches`);
    
    if (finishedCount > 0) {
      console.log(`⏹️ ${finishedCount} matches finished and will no longer be tracked`);
    }
    
  } catch (error) {
    console.error('💥 Error in live matches update:', error.message);
    if (error.response) {
      console.error('API Error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: error.response.data
      });
    }
  }
};

let updateInterval = null;
let upcomingMatchesInterval = null;
let trackedMatches = new Set();

export const startLiveMatchUpdater = () => {
  if (updateInterval) {
    console.log('ℹ️ Live match updater is already running');
    return updateInterval;
  }
  
  updateLiveMatches().catch(console.error);
  checkAndTrackUpcomingMatches().catch(console.error);
  
  updateInterval = setInterval(() => {
    updateLiveMatches().catch(console.error);
  }, 2 * 60 * 1000);
  
  setInterval(() => {
    checkAndTrackUpcomingMatches().catch(console.error);
  }, 30 * 60 * 1000);
  
  console.log('⏱️ Live and upcoming match updater started. Checking every 2 minutes.');
  console.log('🔍 Upcoming matches will be checked every 30 minutes (to catch matches entering 30-min window)');
  return updateInterval;
};

export const stopLiveMatchUpdater = () => {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
    console.log('🛑 Live and upcoming match updater stopped');
  }
  
  if (upcomingMatchesInterval) {
    clearInterval(upcomingMatchesInterval);
    upcomingMatchesInterval = null;
    trackedMatches.clear();
    console.log('🛑 Upcoming matches tracker stopped');
  }
};

const checkAndTrackUpcomingMatches = async () => {
  try {
    console.log('🔍 Checking for matches starting in the next 30 minutes...');
    
    const now = new Date();
    const thirtyMinsLater = new Date(now.getTime() + 30 * 60 * 1000);
    
    const upcomingMatches = await Match.find({
      'status.short': { $in: ['NS', 'TBD'] },
      date: {
        $gte: now,
        $lte: thirtyMinsLater
      }
    });
    
    if (upcomingMatches.length > 0) {
      console.log(`📅 Found ${upcomingMatches.length} matches starting soon:`);
      
      upcomingMatches.forEach(match => {
        if (!trackedMatches.has(match._id.toString())) {
          console.log(`   ⏳ Tracking match: ${match.homeTeam} vs ${match.awayTeam} at ${match.date.toISOString()}`);
          trackedMatches.add(match._id.toString());
        }
      });
      
      if (trackedMatches.size > 0 && !upcomingMatchesInterval) {
        console.log('🔍 Starting intensive tracking for upcoming matches (every minute)');
        
        const trackMatches = async () => {
          if (trackedMatches.size === 0) {
            clearInterval(upcomingMatchesInterval);
            upcomingMatchesInterval = null;
            console.log('ℹ️ No more matches to track');
            return;
          }
          
          try {
            const matchesToUpdate = await Match.find({
              _id: { $in: Array.from(trackedMatches).map(id => new mongoose.Types.ObjectId(id)) },
              'status.short': { $nin: ['FT', 'AET', 'PEN', 'CANC'] }
            });
            
            console.log(`🔄 Intensively updating ${matchesToUpdate.length} tracked matches`);
            await updateLiveMatchesFor(matchesToUpdate);
            
            const activeMatches = matchesToUpdate
              .filter(m => !['FT', 'AET', 'PEN', 'CANC'].includes(m.status.short))
              .map(m => m._id.toString());
              
            trackedMatches = new Set(activeMatches);
            
          } catch (error) {
            console.error('💥 Error in intensive tracking:', error.message);
          }
        };
        
        trackMatches();
        upcomingMatchesInterval = setInterval(trackMatches, 60 * 1000);
      }
    } else {
      console.log('ℹ️ No matches starting in the next 30 minutes');
    }
  } catch (error) {
    console.error('💥 Error checking upcoming matches:', error.message);
  }
};

const updateLiveMatchesFor = async (matches) => {
  if (!matches || matches.length === 0) return 0;
  
  const fixtureIds = matches
    .filter(m => !FINISHED_STATUSES.includes(m.status?.short))
    .map(m => m.fixtureId)
    .filter(id => id != null && id !== undefined);
  
  if (fixtureIds.length === 0) {
    console.log(`⚠️ [Intensive Tracking] No valid fixture IDs found`);
    return 0;
  }
  
  console.log(`🔍 [Intensive Tracking] Fetching ${fixtureIds.length} matches by fixture ID...`);
  
  const liveMatchesData = await getFixturesByIds(fixtureIds);
  
  if (!liveMatchesData || liveMatchesData.length === 0) {
    console.log(`⚠️ [Intensive Tracking] No live match data available from API`);
    return 0;
  }
  
  console.log(`✅ [Intensive Tracking] Received data for ${liveMatchesData.length} matches from API`);
  
  const apiDataMap = new Map();
  liveMatchesData.forEach(match => {
    if (match.fixture?.id) {
      apiDataMap.set(match.fixture.id, match);
    }
  });
  
  const bulkOps = [];
  
  for (const match of matches) {
    const liveData = apiDataMap.get(match.fixtureId);
    if (!liveData) {
      console.log(
        `⚠️ [Intensive Tracking] Skipping match ${match.fixtureId} - No API data found (leagueId: ${match.leagueId}, date: ${new Date(match.date).toISOString()})`
      );
      continue;
    }
    
    try {
      const { fixture, goals, score } = liveData;
      const status = fixture?.status;
      
      if (!status || !goals || !score) {
        console.log(`⚠️ Skipping intensive tracking for match ${match.fixtureId} - Missing required data`);
        continue;
      }
      
      const trackTime = new Date().toISOString();
      const statusEmoji = status.short === 'PST' ? '⏸️' : status.short === 'SUSP' ? '⏸️' : '🔍';
      console.log(`${statusEmoji} INTENSIVE TRACKING UPDATE [${trackTime}]: ${match.homeTeam} vs ${match.awayTeam}`);
      console.log(`   🏟️ Status: ${status.short || 'NS'} (${status.long || 'Not Started'}) - Elapsed: ${status.elapsed || 0}min`);
      if (status.short !== 'PST' && status.short !== 'SUSP') {
        console.log(`   ⚽ Goals: ${goals.home || 0} - ${goals.away || 0}`);
        console.log(`   📊 Score: HT ${score.halftime?.home || 0}-${score.halftime?.away || 0} | FT ${score.fulltime?.home || 0}-${score.fulltime?.away || 0}`);
      }
      
      const updateData = {
        date: fixture?.date ? new Date(fixture.date) : match.date,
        'status.short': status.short || 'NS',
        'status.long': status.long || 'Not Started',
        'status.elapsed': status.elapsed || 0,
        'goals.home': goals.home || 0,
        'goals.away': goals.away || 0,
        'score.halftime': score.halftime || { home: 0, away: 0 },
        'score.fulltime': score.fulltime || { home: 0, away: 0 },
        'score.extratime': score.extratime || { home: 0, away: 0 },
        'score.penalty': score.penalty || { home: 0, away: 0 },
        updatedAt: new Date()
      };
      
      if (fixture?.date && new Date(fixture.date).getTime() !== new Date(match.date).getTime()) {
        console.log(`📅 [Intensive Tracking] DATE/TIME UPDATE: ${match.homeTeam} vs ${match.awayTeam} - Status: ${status.short} - Old: ${new Date(match.date).toISOString()} → New: ${new Date(fixture.date).toISOString()}`);
      }
      
      bulkOps.push({
        updateOne: {
          filter: { _id: match._id },
          update: {
            $set: updateData
          }
        }
      });
    } catch (error) {
      console.error(`❌ Error in intensive tracking for match ${match.fixtureId}:`, error.message);
    }
  }
  
  if (bulkOps.length > 0) {
    await Match.bulkWrite(bulkOps, { ordered: false });
  }
  
  return bulkOps.length;
};

if (process.env.NODE_ENV === 'development') {
  startLiveMatchUpdater();
  
  checkAndTrackUpcomingMatches().catch(console.error);
  
  setInterval(() => {
    checkAndTrackUpcomingMatches().catch(console.error);
  }, 5 * 60 * 1000);
  
  process.on('SIGINT', () => {
    stopLiveMatchUpdater();
    if (upcomingMatchesInterval) clearInterval(upcomingMatchesInterval);
    process.exit(0);
  });
}
