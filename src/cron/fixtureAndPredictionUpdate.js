import cron from 'node-cron';
import League from '../models/leaugeModel.js';
import Match from '../models/matchModel.js';
import Team from '../models/teamModel.js';
import MatchPrediction from '../models/matchPredictionModel.js';
import { getNextTwoDaysFixtures, getTeamDetails } from '../services/footballApiService.js';
import { generatePredictionsForMatches } from '../services/matchPredictionService.js';
import { updateTeamStatistics } from '../services/teamStatsService.js';
import { startCronTracking } from '../utils/cronTracker.js';
import { createCronJob, withRetry, withTimeout } from '../utils/cronWrapper.js';

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
      
      return { status: 'updated', fixtureId, matchId: existingMatch._id };
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
      
      return { status: 'created', fixtureId, matchId: newMatch._id };
    }
  } catch (matchError) {
    console.error(`❌ Error processing fixture ${fixture.fixture.id}:`, matchError.message);
    return { status: 'error', fixtureId: fixture.fixture.id, error: matchError.message };
  }
};

const ensureTeamExists = async (teamData) => {
  try {
    const existingTeam = await Team.findOne({ teamId: teamData.id });
    
    if (!existingTeam) {
      const fullTeamData = await getTeamDetails(teamData.id);
      
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
    }
  } catch (error) {
    console.error(`❌ Error ensuring team exists:`, error.message);
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
      return { newMatches: 0, updatedMatches: 0, skippedMatches: 0, totalFixtures: 0, matchIds: [], error: apiError.message };
    }
    
    if (!fixturesData || !Array.isArray(fixturesData) || fixturesData.length === 0) {
      console.log(`⚠️ [${leagueIndex + 1}/${totalLeagues}] No fixtures data received for ${league.name} (ID: ${league.leagueId})`);
      return { newMatches: 0, updatedMatches: 0, skippedMatches: 0, totalFixtures: 0, matchIds: [] };
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
    const matchIds = [];
    
    for (let batchIndex = 0; batchIndex < fixtureBatches.length; batchIndex++) {
      const batch = fixtureBatches[batchIndex];
      
      const batchPromises = batch.map(fixture => 
        processFixture(fixture, league, existingMatchesMap, leaguesMap)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const res = result.value;
          if (res?.status === 'created') {
            newMatchesCount++;
            if (res.matchId) matchIds.push(res.matchId);
          } else if (res?.status === 'updated') {
            updatedMatchesCount++;
            if (res.matchId) matchIds.push(res.matchId);
          } else if (res?.status === 'error') {
            skippedMatchesCount++;
          }
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
      totalFixtures: fixtures.length,
      matchIds
    };
    
  } catch (leagueError) {
    console.error(`❌ [${leagueIndex + 1}/${totalLeagues}] Error updating league ${league.name}:`, leagueError.message);
    return { newMatches: 0, updatedMatches: 0, skippedMatches: 0, totalFixtures: 0, matchIds: [], error: leagueError.message };
  }
};

export const runFixtureAndPredictionUpdate = async () => {
  const startTime = Date.now();
  try {
    const activeLeagues = await League.find({ isActive: true }).lean();
    console.log(`📊 Found ${activeLeagues.length} ACTIVE leagues in your system`);
    
    if (activeLeagues.length === 0) {
      console.log('⚠️ No active leagues found in your system');
      console.log('💡 Tip: Activate leagues via admin API or set isActive: true in database');
      return {
        newMatches: 0,
        updatedMatches: 0,
        skippedMatches: 0,
        totalFixtures: 0,
        predictionsGenerated: 0,
        message: 'No active leagues found'
      };
    }
    
    console.log(`⚡ Step 1: Processing fixtures for next 2 days (max 5 concurrent leagues to avoid API overload)...`);
    
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
    const allMatchIds = [];
    
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
          if (res.matchIds && Array.isArray(res.matchIds)) {
            allMatchIds.push(...res.matchIds);
          }
        } else {
          console.error(`❌ League batch item failed:`, result.reason);
        }
      });
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`📊 Progress: ${processedLeagues}/${activeLeagues.length} leagues (${((processedLeagues / activeLeagues.length) * 100).toFixed(1)}%) | Elapsed: ${elapsed}s`);
    }
    
    console.log(`\n✅ Step 1 completed: Fixture update`);
    console.log(`📊 Total fixtures processed: ${totalFixturesProcessed}`);
    console.log(`🆕 NEW matches added: ${newMatchesCount}`);
    console.log(`🔄 Existing matches updated: ${updatedMatchesCount}`);
    console.log(`⏭️ Skipped matches: ${skippedMatchesCount}`);
    console.log(`📊 Total match IDs collected: ${allMatchIds.length}`);
    
    // Step 2: Update team statistics for teams in the matches
    let teamStatsUpdated = 0;
    let teamStatsFailed = 0;
    
    if (allMatchIds.length > 0) {
      console.log(`\n👥 Step 2: Updating team statistics for matches...`);
      
      // Get all matches with their team and league info
      const matches = await Match.find({
        _id: { $in: allMatchIds }
      }).select('homeTeam awayTeam leagueId season').lean();
      
      // Collect unique team-league-season combinations
      const teamLeagueSeasonSet = new Set();
      matches.forEach(match => {
        if (match.homeTeam && match.leagueId && match.season) {
          teamLeagueSeasonSet.add(`${match.homeTeam}-${match.leagueId}-${match.season}`);
        }
        if (match.awayTeam && match.leagueId && match.season) {
          teamLeagueSeasonSet.add(`${match.awayTeam}-${match.leagueId}-${match.season}`);
        }
      });
      
      const teamLeagueSeasonArray = Array.from(teamLeagueSeasonSet).map(item => {
        const [teamId, leagueId, season] = item.split('-');
        return { teamId: parseInt(teamId), leagueId: parseInt(leagueId), season: parseInt(season) };
      });
      
      console.log(`📊 Found ${teamLeagueSeasonArray.length} unique team-league-season combinations to update`);
      
      if (teamLeagueSeasonArray.length > 0) {
        // Process team stats updates in batches to avoid API overload
        const TEAM_STATS_BATCH_SIZE = 10;
        const batches = [];
        for (let i = 0; i < teamLeagueSeasonArray.length; i += TEAM_STATS_BATCH_SIZE) {
          batches.push(teamLeagueSeasonArray.slice(i, i + TEAM_STATS_BATCH_SIZE));
        }
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];
          console.log(`📦 Processing team stats batch ${batchIndex + 1}/${batches.length} (${batch.length} teams)...`);
          
          const batchPromises = batch.map(({ teamId, leagueId, season }) =>
            updateTeamStatistics(teamId, leagueId, season)
              .then(result => ({ success: result !== null, teamId, leagueId, season }))
              .catch(error => {
                console.error(`❌ Error updating stats for team ${teamId}, league ${leagueId}, season ${season}:`, error.message);
                return { success: false, teamId, leagueId, season };
              })
          );
          
          const batchResults = await Promise.allSettled(batchPromises);
          batchResults.forEach((result) => {
            if (result.status === 'fulfilled') {
              if (result.value.success) {
                teamStatsUpdated++;
              } else {
                teamStatsFailed++;
              }
            } else {
              teamStatsFailed++;
            }
          });
          
          // Small delay between batches to avoid API rate limits
          if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        console.log(`✅ Team statistics update completed: ${teamStatsUpdated} successful, ${teamStatsFailed} failed`);
      } else {
        console.log(`⚠️ No team statistics to update`);
      }
    } else {
      console.log(`⚠️ No matches found, skipping team statistics update`);
    }
    
    // Step 3: Generate predictions for all matches
    let predictionsGenerated = 0;
    
    if (allMatchIds.length > 0) {
      console.log(`\n🔮 Step 3: Generating predictions for ${allMatchIds.length} matches...`);
      
      // Filter out matches that already have predictions
      const existingPredictions = await MatchPrediction.find({
        match: { $in: allMatchIds }
      }).select('match');
      
      const existingMatchIds = new Set(existingPredictions.map(p => p.match.toString()));
      const matchesWithoutPredictions = allMatchIds.filter(m => !existingMatchIds.has(m.toString()));
      
      if (matchesWithoutPredictions.length > 0) {
        console.log(`📊 Found ${matchesWithoutPredictions.length} matches without predictions (${existingPredictions.length} already have predictions)`);
        
        try {
          const predictionResults = await generatePredictionsForMatches(matchesWithoutPredictions);
          predictionsGenerated = predictionResults.length;
          console.log(`✅ Successfully generated ${predictionsGenerated} predictions`);
        } catch (predictionError) {
          console.error(`❌ Error generating predictions:`, predictionError.message);
          console.error(`💥 Prediction error stack:`, predictionError.stack);
        }
      } else {
        console.log(`✅ All ${allMatchIds.length} matches already have predictions`);
      }
    } else {
      console.log(`⚠️ No match IDs to generate predictions for`);
    }
    
    const totalMatchesInDB = await Match.countDocuments();
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`\n🎉 Fixture and prediction update job completed successfully in ${totalDuration}s!`);
    console.log(`📊 Summary:`);
    console.log(`  - Total fixtures processed: ${totalFixturesProcessed}`);
    console.log(`  - NEW matches added: ${newMatchesCount}`);
    console.log(`  - Existing matches updated: ${updatedMatchesCount}`);
    console.log(`  - Skipped matches: ${skippedMatchesCount}`);
    console.log(`  - Team stats updated: ${teamStatsUpdated} successful, ${teamStatsFailed} failed`);
    console.log(`  - Predictions generated: ${predictionsGenerated}`);
    console.log(`  - Total matches in DB: ${totalMatchesInDB}`);
    
    return {
      newMatches: newMatchesCount,
      updatedMatches: updatedMatchesCount,
      skippedMatches: skippedMatchesCount,
      totalFixtures: totalFixturesProcessed,
      teamStatsUpdated,
      teamStatsFailed,
      predictionsGenerated,
      totalMatchesInDB
    };
    
  } catch (error) {
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`💥 Fixture and prediction update job failed after ${totalDuration}s:`, error.message);
    console.error('💥 Full error stack:', error.stack);
    throw error;
  }
};

const runFixtureAndPredictionUpdateWithTracking = async () => {
  let tracker = null;
  try {
    tracker = await startCronTracking('Fixture and Prediction Update');
    console.log(`   [Tracked: ${tracker.executionId}]`);
  } catch (trackError) {
    console.warn('⚠️  Cron tracking failed, continuing without tracking:', trackError.message);
  }
  
  try {
    const result = await runFixtureAndPredictionUpdate();
    
    if (tracker) {
      const details = result ? {
        newMatches: result.newMatches || 0,
        updatedMatches: result.updatedMatches || 0,
        skippedMatches: result.skippedMatches || 0,
        totalFixtures: result.totalFixtures || 0,
        teamStatsUpdated: result.teamStatsUpdated || 0,
        teamStatsFailed: result.teamStatsFailed || 0,
        predictionsGenerated: result.predictionsGenerated || 0,
        message: result.message || 'Fixture and prediction update completed successfully'
      } : { message: 'Fixture and prediction update completed successfully' };
      await tracker.success(details);
    }
    console.log('⏰ Fixture and prediction update completed successfully');
    return result;
  } catch (error) {
    if (tracker) {
      try {
        await tracker.fail(error);
      } catch (trackError) {
        console.warn('⚠️  Failed to log error to tracker:', trackError.message);
      }
    }
    console.error('💥 Fixture and prediction update failed:', error.message);
    console.error('💥 Full error:', error);
    throw error;
  }
};

export const startFixtureAndPredictionUpdateJob = () => {
  const wrappedJob = createCronJob(
    'Fixture and Prediction Update',
    withTimeout(withRetry(runFixtureAndPredictionUpdateWithTracking, 2, 10000), 10800000), // 3 hours timeout
    {
      sendSuccessNotification: false,
      context: { jobType: 'fixture_and_prediction_update' }
    }
  );

  cron.schedule('45 5 * * *', wrappedJob, {
    timezone: 'UTC'
  });
  
  console.log('⏰ Fixture and prediction update cron job scheduled for daily at 05:45 UTC (3 hour timeout, 2 retries)');
};

export const triggerFixtureAndPredictionUpdate = async () => {
  try {
    console.log('🔧 Manual trigger: Starting fixture and prediction update...');
    return await runFixtureAndPredictionUpdate();
  } catch (error) {
    console.error('💥 Manual fixture and prediction update failed:', error.message);
    throw error;
  }
};

