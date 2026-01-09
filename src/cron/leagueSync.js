import cron from 'node-cron';
import League from '../models/leaugeModel.js';
import { getAllLeaguesFromAPI, getLeagueDetailsById } from '../services/footballApiService.js';
import { startCronTracking } from '../utils/cronTracker.js';
import { createCronJob, withRetry, withTimeout } from '../utils/cronWrapper.js';

const processLeague = async (apiLeague, index, total) => {
      try {
        const leagueId = apiLeague.league?.id;
        if (!leagueId) {
      console.log(`⚠️ [${index + 1}/${total}] Skipping league with no ID: ${apiLeague.league?.name || 'Unknown'}`);
      return { status: 'skipped', reason: 'no_id' };
        }

    console.log(`🔄 [${index + 1}/${total}] Processing league: ${apiLeague.league.name} (ID: ${leagueId})`);
        const leagueDetails = await getLeagueDetailsById(leagueId);
        
        const leagueData = leagueDetails || apiLeague;
        
        const seasonsArr = Array.isArray(leagueData.seasons) ? leagueData.seasons : [];
        
        if (seasonsArr.length === 0) {
      console.log(`⚠️ [${index + 1}/${total}] No seasons found for league ${leagueId} (${apiLeague.league.name}), skipping`);
      return { status: 'skipped', reason: 'no_seasons' };
        }
        
        // Find the season with current: true - ONLY save leagues with current season
        const currentSeasonObj = seasonsArr.find(s => s?.current === true) || null;
        
        if (!currentSeasonObj) {
      console.log(`⚠️ [${index + 1}/${total}] No current season found for league ${leagueId} (${apiLeague.league.name}), skipping`);
      return { status: 'skipped', reason: 'no_current_season' };
        }
        
        // Use the current season's data
        const bestYear = currentSeasonObj.year;
        const bestStart = currentSeasonObj.start || null;
        const bestEnd = currentSeasonObj.end || null;
        
        const existingLeague = await League.findOne({ leagueId: leagueId });
        
        if (existingLeague) {
          await League.findOneAndUpdate(
            { leagueId: leagueId },
            {
              name: apiLeague.league.name,
              country: apiLeague.country?.name || '',
              season: bestYear,
              logo: apiLeague.league.logo || '',
              flag: apiLeague.country?.flag || '',
              type: apiLeague.league.type || 'League',
              startDate: bestStart,
              endDate: bestEnd,
              updatedAt: new Date()
            },
            { new: true, upsert: false }
          );
      console.log(`✅ [${index + 1}/${total}] Updated: ${apiLeague.league.name} (Season: ${bestYear}, Current: true)`);
      return { status: 'updated' };
        } else {
          const newLeague = new League({
            leagueId: leagueId,
            name: apiLeague.league.name,
            country: apiLeague.country?.name || '',
            season: bestYear,
            logo: apiLeague.league.logo || '',
            flag: apiLeague.country?.flag || '',
            type: apiLeague.league.type || 'League',
            startDate: bestStart,
            endDate: bestEnd,
            isActive: false
          });
          
          await newLeague.save();
      console.log(`➕ [${index + 1}/${total}] Added NEW: ${apiLeague.league.name} (Season: ${bestYear}, Current: true)`);
      return { status: 'created' };
        }
        
      } catch (leagueError) {
    console.error(`❌ [${index + 1}/${total}] Error processing league ${apiLeague.league?.name || 'Unknown'}:`, leagueError.message);
    return { status: 'error', error: leagueError.message };
  }
};

export const runLeagueSync = async () => {
  const startTime = Date.now();
  console.log('🔄 Starting league sync job...');
  
  try {
    const apiLeagues = await getAllLeaguesFromAPI();
    
    if (!apiLeagues || !Array.isArray(apiLeagues) || apiLeagues.length === 0) {
      console.log('⚠️ No leagues data received from API');
      return;
    }
    
    const totalLeagues = apiLeagues.length;
    console.log(`📊 Found ${totalLeagues} leagues from third-party API`);
    console.log(`⚡ Processing leagues in parallel (max 10 concurrent due to API rate limits)...`);
    
    // Process leagues in parallel batches (respecting API rate limits)
    const BATCH_SIZE = 10;
    const batches = [];
    for (let i = 0; i < totalLeagues; i += BATCH_SIZE) {
      batches.push(apiLeagues.slice(i, i + BATCH_SIZE));
    }
    
    let newLeaguesCount = 0;
    let updatedLeaguesCount = 0;
    let skippedLeaguesCount = 0;
    let errorCount = 0;
    let processedCount = 0;
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchStart = batchIndex * BATCH_SIZE;
      
      console.log(`\n📦 Processing batch ${batchIndex + 1}/${batches.length} (leagues ${batchStart + 1}-${Math.min(batchStart + batch.length, totalLeagues)} of ${totalLeagues})...`);
      
      const batchPromises = batch.map((apiLeague, batchPos) => 
        processLeague(apiLeague, batchStart + batchPos, totalLeagues)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, idx) => {
        processedCount++;
        if (result.status === 'fulfilled') {
          const res = result.value;
          if (res?.status === 'created') newLeaguesCount++;
          else if (res?.status === 'updated') updatedLeaguesCount++;
          else if (res?.status === 'skipped') skippedLeaguesCount++;
          else if (res?.status === 'error') errorCount++;
        } else {
          errorCount++;
          console.error(`❌ Batch item ${idx + 1} failed:`, result.reason);
        }
      });
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const remaining = totalLeagues - processedCount;
      const avgTimePerLeague = elapsed / processedCount;
      const estimatedRemaining = (remaining * avgTimePerLeague).toFixed(0);
      console.log(`📊 Progress: ${processedCount}/${totalLeagues} (${((processedCount / totalLeagues) * 100).toFixed(1)}%) | Elapsed: ${elapsed}s | Est. remaining: ${estimatedRemaining}s`);
    }
    
    const totalLeaguesInDB = await League.countDocuments();
    const activeLeaguesInDB = await League.countDocuments({ isActive: true });
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`\n✅ League sync completed successfully in ${totalDuration}s!`);
    console.log(`📈 NEW leagues added: ${newLeaguesCount}`);
    console.log(`🔄 Existing leagues updated: ${updatedLeaguesCount}`);
    console.log(`⏭️ Skipped leagues: ${skippedLeaguesCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Total leagues in DB: ${totalLeaguesInDB}`);
    console.log(`🟢 Active leagues in DB: ${activeLeaguesInDB}`);
    console.log(`🟡 Inactive leagues in DB: ${totalLeaguesInDB - activeLeaguesInDB}`);
    
  } catch (error) {
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`💥 League sync job failed after ${totalDuration}s:`, error.message);
    throw error;
  }
};

const runLeagueSyncWithTracking = async () => {
  let tracker = null;
  try {
    tracker = await startCronTracking('League Sync');
    console.log(`   [Tracked: ${tracker.executionId}]`);
  } catch (trackError) {
    console.warn('⚠️  Cron tracking failed, continuing without tracking:', trackError.message);
  }
  
  try {
    await runLeagueSync();
    
    if (tracker) {
      await tracker.success({ message: 'League sync completed successfully' });
    }
    console.log('⏰ League sync completed, fixture update will run at 00:20 UTC');
  } catch (error) {
    if (tracker) {
      try {
        await tracker.fail(error);
      } catch (trackError) {
        console.warn('⚠️  Failed to log error to tracker:', trackError.message);
      }
    }
    console.error('💥 League sync failed:', error.message);
    throw error;
  }
};

export const startLeagueSyncJob = () => {
  const wrappedLeagueSyncJob = createCronJob(
    'League Sync',
    withTimeout(withRetry(runLeagueSyncWithTracking, 2, 10000), 10800000), // 3 hours timeout (for 10000+ leagues)
    {
      sendSuccessNotification: false,
      context: { jobType: 'league_sync' }
    }
  );

  cron.schedule('10 0 * * *', wrappedLeagueSyncJob, {
    timezone: 'UTC'
  });
  
  console.log('⏰ League sync cron job scheduled for daily at 00:10 UTC (3 hour timeout, 2 retries)');
};
