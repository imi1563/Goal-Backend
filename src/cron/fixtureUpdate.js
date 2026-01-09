import cron from 'node-cron';
import League from '../models/leaugeModel.js';
import Match from '../models/matchModel.js';
import Team from '../models/teamModel.js';
import { getNextTwoDaysFixtures, getTeamDetails } from '../services/footballApiService.js';
import { startCronTracking } from '../utils/cronTracker.js';
import { createCronJob, withRetry, withTimeout } from '../utils/cronWrapper.js';

const runFixtureUpdateWithTracking = async () => {
  let tracker = null;
  try {
    tracker = await startCronTracking('Fixture Update');
    console.log(`   [Tracked: ${tracker.executionId}]`);
  } catch (trackError) {
    console.warn('⚠️  Cron tracking failed, continuing without tracking:', trackError.message);
  }
  
  try {
    const result = await runFixtureUpdate();
    
    if (tracker) {
      const details = result ? {
        newMatches: result.newMatches || 0,
        updatedMatches: result.updatedMatches || 0,
        skippedMatches: result.skippedMatches || 0,
        totalFixtures: result.totalFixtures || 0,
        message: result.message || 'Fixture update completed successfully'
      } : { message: 'Fixture update completed successfully' };
      await tracker.success(details);
    }
    console.log('⏰ Fixture update completed, team stats will run at 00:30 UTC');
    return result;
  } catch (error) {
    if (tracker) {
      try {
        await tracker.fail(error);
      } catch (trackError) {
        console.warn('⚠️  Failed to log error to tracker:', trackError.message);
      }
    }
    console.error('💥 Fixture update failed:', error.message);
    console.error('💥 Full error:', error);
    throw error;
  }
};

export const startFixtureUpdateJob = () => {
  const wrappedFixtureUpdateJob = createCronJob(
    'Fixture Update',
    withTimeout(withRetry(runFixtureUpdateWithTracking, 2, 10000), 5400000), // 90 minutes timeout
    {
      sendSuccessNotification: false,
      context: { jobType: 'fixture_update' }
    }
  );

  cron.schedule('30 1 * * *', wrappedFixtureUpdateJob, {
    timezone: 'UTC'
  });
  
  console.log('⏰ Fixture update cron job scheduled for daily at 00:20 UTC (90 min timeout, 2 retries)');
};

const processFixture = async (fixture, league, existingMatchesMap, leaguesMap) => {
        try {
    const fixtureId = fixture.fixture.id;
    const existingMatch = existingMatchesMap.get(fixtureId);
              
              if (existingMatch) {
                const matchSeason = fixture.league?.season;
                if (matchSeason && fixture.league?.id) {
                  try {
                    const { syncLeagueSeasonFromMatch } = await import('../utils/leagueSeasonSync.js');
                    await syncLeagueSeasonFromMatch(League, fixture.league.id, matchSeason);
                  } catch (syncError) {
          console.error(`⚠️ Error syncing league season for match ${fixtureId}:`, syncError.message);
                  }
                }
                
      const leagueId = fixture.league?.id || league.leagueId;
      const currentLeague = leaguesMap.get(leagueId) || await League.findOne({ leagueId: leagueId });
      if (currentLeague && !leaguesMap.has(leagueId)) {
        leaguesMap.set(leagueId, currentLeague);
      }
      
                const latestLeagueSeason = currentLeague?.season || matchSeason || existingMatch.season || new Date().getFullYear();
                
                const updateData = {
                  date: new Date(fixture.fixture.date),
                  status: {
                    long: fixture.fixture.status.long || 'Not Started',
                    short: fixture.fixture.status.short || 'NS',
                    elapsed: fixture.fixture.status.elapsed || 0
                  },
                  goals: {
                    home: fixture.goals?.home || 0,
                    away: fixture.goals?.away || 0
                  },
                  score: {
                    halftime: fixture.score?.halftime || { home: 0, away: 0 },
                    fulltime: fixture.score?.fulltime || { home: 0, away: 0 },
                    extratime: fixture.score?.extratime || { home: 0, away: 0 },
                    penalty: fixture.score?.penalty || { home: 0, away: 0 }
                  },
                  updatedAt: new Date()
                };
                
                if (latestLeagueSeason !== existingMatch.season) {
                  updateData.season = latestLeagueSeason;
                }
                
                await Match.findOneAndUpdate(
        { fixtureId: fixtureId },
                  { $set: updateData },
                  { new: true }
                );
      
      return { status: 'updated', fixtureId };
              } else {
      const leagueId = fixture.league?.id || league.leagueId;
      const currentLeague = leaguesMap.get(leagueId) || await League.findOne({ leagueId: leagueId });
      if (currentLeague && !leaguesMap.has(leagueId)) {
        leaguesMap.set(leagueId, currentLeague);
      }
      
                const latestLeagueSeason = currentLeague?.season || fixture.league?.season || new Date().getFullYear();
                
                const newMatch = new Match({
        fixtureId: fixtureId,
                  leagueId: league.leagueId,
                  season: latestLeagueSeason,
                  date: new Date(fixture.fixture.date),
                  status: {
                    long: fixture.fixture.status.long || 'Not Started',
                    short: fixture.fixture.status.short || 'NS',
                    elapsed: fixture.fixture.status.elapsed || 0
                  },
                  homeTeam: fixture.teams?.home?.id || 0,
                  awayTeam: fixture.teams?.away?.id || 0,
                  goals: {
                    home: fixture.goals?.home || 0,
                    away: fixture.goals?.away || 0
                  },
                  score: {
                    halftime: fixture.score?.halftime || { home: 0, away: 0 },
                    fulltime: fixture.score?.fulltime || { home: 0, away: 0 },
                    extratime: fixture.score?.extratime || { home: 0, away: 0 },
                    penalty: fixture.score?.penalty || { home: 0, away: 0 }
                  }
                });
                
                await newMatch.save();
      
      // Process teams in parallel
      const teamPromises = [];
      if (fixture.teams?.home) teamPromises.push(ensureTeamExists(fixture.teams.home));
      if (fixture.teams?.away) teamPromises.push(ensureTeamExists(fixture.teams.away));
      await Promise.allSettled(teamPromises);
      
      return { status: 'created', fixtureId };
    }
            } catch (matchError) {
              console.error(`❌ Error processing fixture ${fixture.fixture.id}:`, matchError.message);
    return { status: 'error', fixtureId: fixture.fixture.id, error: matchError.message };
  }
};

const processLeagueFixtures = async (league, leagueIndex, totalLeagues) => {
  try {
    console.log(`🔄 [${leagueIndex + 1}/${totalLeagues}] Fetching fixtures for: ${league.name} (ID: ${league.leagueId})`);
    
    let fixturesData;
    try {
      fixturesData = await getNextTwoDaysFixtures([league.leagueId]);
    } catch (apiError) {
      console.error(`❌ [${leagueIndex + 1}/${totalLeagues}] API error fetching fixtures for ${league.name}:`, apiError.message);
      return { newMatches: 0, updatedMatches: 0, skippedMatches: 0, totalFixtures: 0, error: apiError.message };
    }
    
    if (!fixturesData || !Array.isArray(fixturesData) || fixturesData.length === 0) {
      console.log(`⚠️ [${leagueIndex + 1}/${totalLeagues}] No fixtures data received for ${league.name} (ID: ${league.leagueId})`);
      console.log(`   📅 This could mean: no matches scheduled, API returned empty, or date range issue`);
      return { newMatches: 0, updatedMatches: 0, skippedMatches: 0, totalFixtures: 0 };
    }
    
    const fixtures = fixturesData;
    console.log(`📅 [${leagueIndex + 1}/${totalLeagues}] Found ${fixtures.length} fixtures for ${league.name}`);
    
    // Batch fetch existing matches
    const fixtureIds = fixtures.map(f => f.fixture.id);
    const existingMatches = await Match.find({ fixtureId: { $in: fixtureIds } });
    const existingMatchesMap = new Map(existingMatches.map(m => [m.fixtureId, m]));
    
    // Cache leagues to avoid repeated DB queries
    const leaguesMap = new Map();
    leaguesMap.set(league.leagueId, league);
    
    // Process fixtures in parallel batches
    const FIXTURE_BATCH_SIZE = 20;
    const fixtureBatches = [];
    for (let i = 0; i < fixtures.length; i += FIXTURE_BATCH_SIZE) {
      fixtureBatches.push(fixtures.slice(i, i + FIXTURE_BATCH_SIZE));
    }
    
    let newMatchesCount = 0;
    let updatedMatchesCount = 0;
    let skippedMatchesCount = 0;
    
    for (let batchIndex = 0; batchIndex < fixtureBatches.length; batchIndex++) {
      const batch = fixtureBatches[batchIndex];
      
      const batchPromises = batch.map(fixture => 
        processFixture(fixture, league, existingMatchesMap, leaguesMap)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const res = result.value;
          if (res?.status === 'created') newMatchesCount++;
          else if (res?.status === 'updated') updatedMatchesCount++;
          else if (res?.status === 'error') skippedMatchesCount++;
        } else {
              skippedMatchesCount++;
            }
      });
          }
          
    console.log(`✅ [${leagueIndex + 1}/${totalLeagues}] Processed ${league.name}: ${newMatchesCount} new, ${updatedMatchesCount} updated, ${skippedMatchesCount} skipped`);
    
    return { 
      newMatches: newMatchesCount, 
      updatedMatches: updatedMatchesCount, 
      skippedMatches: skippedMatchesCount,
      totalFixtures: fixtures.length
    };
          
        } catch (leagueError) {
    console.error(`❌ [${leagueIndex + 1}/${totalLeagues}] Error updating league ${league.name}:`, leagueError.message);
    return { newMatches: 0, updatedMatches: 0, skippedMatches: 0, totalFixtures: 0, error: leagueError.message };
  }
};

export const runFixtureUpdate = async () => {
  const startTime = Date.now();
  try {
    const activeLeagues = await League.find({ isActive: true }).lean();
    console.log(`📊 Found ${activeLeagues.length} ACTIVE leagues in your system`);
    
    if (activeLeagues.length === 0) {
      console.log('⚠️ No active leagues found in your system');
      console.log('💡 Tip: Activate leagues via admin API or set isActive: true in database');
      // Return early but don't throw - let the wrapper handle tracking
      return {
        newMatches: 0,
        updatedMatches: 0,
        skippedMatches: 0,
        totalFixtures: 0,
        message: 'No active leagues found'
      };
    }
    
    console.log(`⚡ Processing leagues in parallel (max 5 concurrent to avoid API overload)...`);
    
    // Process leagues in parallel batches
    const LEAGUE_BATCH_SIZE = 5;
    const leagueBatches = [];
    for (let i = 0; i < activeLeagues.length; i += LEAGUE_BATCH_SIZE) {
      leagueBatches.push(activeLeagues.slice(i, i + LEAGUE_BATCH_SIZE));
    }
    
    let totalFixturesProcessed = 0;
    let newMatchesCount = 0;
    let updatedMatchesCount = 0;
    let skippedMatchesCount = 0;
    let processedLeagues = 0;
    
    for (let batchIndex = 0; batchIndex < leagueBatches.length; batchIndex++) {
      const batch = leagueBatches[batchIndex];
      const batchStart = batchIndex * LEAGUE_BATCH_SIZE;
      
      console.log(`\n📦 Processing league batch ${batchIndex + 1}/${leagueBatches.length} (leagues ${batchStart + 1}-${Math.min(batchStart + batch.length, activeLeagues.length)} of ${activeLeagues.length})...`);
      
      const batchPromises = batch.map((league, batchPos) => 
        processLeagueFixtures(league, batchStart + batchPos, activeLeagues.length)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result) => {
        processedLeagues++;
        if (result.status === 'fulfilled') {
          const res = result.value;
          newMatchesCount += res.newMatches || 0;
          updatedMatchesCount += res.updatedMatches || 0;
          skippedMatchesCount += res.skippedMatches || 0;
          totalFixturesProcessed += res.totalFixtures || 0;
        } else {
          console.error(`❌ League batch item failed:`, result.reason);
        }
      });
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const remaining = activeLeagues.length - processedLeagues;
      console.log(`📊 Progress: ${processedLeagues}/${activeLeagues.length} leagues (${((processedLeagues / activeLeagues.length) * 100).toFixed(1)}%) | Elapsed: ${elapsed}s`);
      }
      
      const totalMatchesInDB = await Match.countDocuments();
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
      
    console.log(`\n🎉 Fixture update job completed successfully in ${totalDuration}s!`);
      console.log(`📊 Total fixtures processed: ${totalFixturesProcessed}`);
      console.log(`🆕 NEW matches added: ${newMatchesCount}`);
      console.log(`🔄 Existing matches updated: ${updatedMatchesCount}`);
      console.log(`⏭️ Skipped matches: ${skippedMatchesCount}`);
      console.log(`📊 Total matches in DB: ${totalMatchesInDB}`);
      
      return {
        newMatches: newMatchesCount,
        updatedMatches: updatedMatchesCount,
        skippedMatches: skippedMatchesCount,
        totalFixtures: totalFixturesProcessed,
        totalMatchesInDB
      };
      
    } catch (error) {
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`💥 Fixture update job failed after ${totalDuration}s:`, error.message);
    console.error('💥 Full error stack:', error.stack);
    throw error;
    }
  };

const ensureTeamExists = async (teamData) => {
  try {
    console.log(`🔍 DEBUG: Team data received:`, JSON.stringify(teamData, null, 2));
    
    const existingTeam = await Team.findOne({ teamId: teamData.id });
    
    if (!existingTeam) {
      const fullTeamData = await getTeamDetails(teamData.id);
      
      console.log(`🔍 DEBUG: Full team data received:`, JSON.stringify(fullTeamData, null, 2));
      
              const newTeam = new Team({
          teamId: teamData.id,
          name: fullTeamData?.name || teamData.name || '',
          code: fullTeamData?.code || teamData.code || '',
          country: fullTeamData?.country?.name || teamData.country || '',
          logo: fullTeamData?.logo || teamData.logo || '',
          venue: {
            id: fullTeamData?.venue?.id || 0,
            name: fullTeamData?.venue?.name || '',
            city: fullTeamData?.venue?.city || '',
            capacity: fullTeamData?.venue?.capacity || 0,
            surface: fullTeamData?.venue?.surface || '',
            image: fullTeamData?.venue?.image || ''
          }
        });
      
              await newTeam.save();
        console.log(`👥 Created NEW team: ${newTeam.name}`);
        console.log(`🏟️ Venue data:`, newTeam.venue);
    } else {
      console.log(`👥 Team already exists: ${teamData.name}`);
    }
  } catch (error) {
    console.error(`❌ Error ensuring team exists:`, error.message);
  }
};
