import { getNextTwoDaysFixtures, getTeamDetails } from './footballApiService.js';
import { updateTeamStatistics } from './teamStatsService.js';
import { generatePredictionsForMatches } from './matchPredictionService.js';
import { getCurrentFootballSeason } from '../utils/seasonUtils.js';
import League from '../models/leaugeModel.js';
import Match from '../models/matchModel.js';
import Team from '../models/teamModel.js';


const processFixturesForLeague = async (league) => {
  try {
    console.log(`🔄 Fetching fixtures for league: ${league.name} (ID: ${league.leagueId})`);
    
    const fixturesData = await getNextTwoDaysFixtures([league.leagueId]);
    
    if (!fixturesData || !Array.isArray(fixturesData) || fixturesData.length === 0) {
      console.log(`⚠️ No fixtures data received for ${league.name}`);
      return {
        newMatchesCount: 0,
        updatedMatchesCount: 0,
        skippedMatchesCount: 0,
        newMatchIds: [],
        allMatchIds: []
      };
    }
    
    const fixtures = fixturesData;
    console.log(`📅 Found ${fixtures.length} fixtures for ${league.name}`);
    
    let newMatchesCount = 0;
    let updatedMatchesCount = 0;
    let skippedMatchesCount = 0;
    const newMatchIds = [];
    const allMatchIds = [];
    
    for (const fixture of fixtures) {
      try {
        const existingMatch = await Match.findOne({ fixtureId: fixture.fixture.id });
        
        if (existingMatch) {
          const matchSeason = fixture.league?.season;
          if (matchSeason && fixture.league?.id) {
            try {
              const { syncLeagueSeasonFromMatch } = await import('../utils/leagueSeasonSync.js');
              await syncLeagueSeasonFromMatch(League, fixture.league.id, matchSeason);
            } catch (syncError) {
              console.error(`⚠️ Error syncing league season for match ${fixture.fixture.id}:`, syncError.message);
            }
          }
          
          const currentLeague = await League.findOne({ leagueId: fixture.league?.id || league.leagueId });
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
            console.log(`🔄 Updating match season: ${existingMatch.season} → ${latestLeagueSeason} (to match league.season)`);
          }
          
          const updatedMatch = await Match.findOneAndUpdate(
            { fixtureId: fixture.fixture.id },
            { $set: updateData },
            { new: true }
          );
          updatedMatchesCount++;
          if (updatedMatch) allMatchIds.push(updatedMatch._id);
          console.log(`🔄 Updated existing match: ${fixture.fixture.id}`);
        } else {
          const currentLeague = await League.findOne({ leagueId: fixture.league?.id || league.leagueId });
          const latestLeagueSeason = currentLeague?.season || fixture.league?.season || new Date().getFullYear();
          
          const newMatch = new Match({
            fixtureId: fixture.fixture.id,
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
          newMatchesCount++;
          newMatchIds.push(newMatch._id);
          allMatchIds.push(newMatch._id);
          console.log(`➕ Added NEW match: ${fixture.fixture.id}`);
          
          if (fixture.teams?.home) await ensureTeamExists(fixture.teams.home);
          if (fixture.teams?.away) await ensureTeamExists(fixture.teams.away);
        }
        
      } catch (matchError) {
        console.error(`❌ Error processing fixture ${fixture.fixture.id}:`, matchError.message);
        skippedMatchesCount++;
      }
    }
    
    console.log(`✅ Successfully processed fixtures for ${league.name}`);
    
    return {
      newMatchesCount,
      updatedMatchesCount,
      skippedMatchesCount,
      newMatchIds,
      allMatchIds
    };
    
  } catch (leagueError) {
    console.error(`❌ Error updating league ${league.name}:`, leagueError.message);
    return {
      newMatchesCount: 0,
      updatedMatchesCount: 0,
      skippedMatchesCount: 0,
      newMatchIds: [],
      allMatchIds: []
    };
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

export const activateLeagueWithFullSetup = async (league) => {
  const result = {
    fixturesProcessed: false,
    newMatchesCount: 0,
    updatedMatchesCount: 0,
    skippedMatchesCount: 0,
    newMatchIds: [],
    allMatchIds: [],
    teamsProcessed: 0,
    statsFetched: 0,
    statsErrors: 0,
    predictionsGenerated: 0,
    predictionErrors: 0,
    fixturesData: null
  };

  try {
    console.log(`🚀 Starting full activation flow for league: ${league.name} (ID: ${league.leagueId})`);
    console.log(`📅 League season from DB: ${league.season || 'NOT SET'}`);

    console.log(`📅 Step 1: Processing fixtures for next 2 days...`);
    console.log(`   ⏱️ Step 1 started at: ${new Date().toISOString()}`);
    const fixtureResult = await processFixturesForLeague(league);
    console.log(`   ✅ Step 1 completed at: ${new Date().toISOString()}`);
    
    result.fixturesProcessed = true;
    result.newMatchesCount = fixtureResult.newMatchesCount;
    result.updatedMatchesCount = fixtureResult.updatedMatchesCount;
    result.skippedMatchesCount = fixtureResult.skippedMatchesCount;
    result.newMatchIds = fixtureResult.newMatchIds;
    result.allMatchIds = fixtureResult.allMatchIds;

    console.log(`✅ Fixtures processed: ${result.newMatchesCount} new, ${result.updatedMatchesCount} updated`);

    console.log(`👥 Step 2: Getting fixtures data to extract teams...`);
    console.log(`   ⏱️ Step 2 started at: ${new Date().toISOString()}`);
    result.fixturesData = await getNextTwoDaysFixtures([league.leagueId]);
    console.log(`   ✅ Step 2 completed at: ${new Date().toISOString()}`);

    if (!result.fixturesData || result.fixturesData.length === 0) {
      console.log(`⚠️ No fixtures data found, skipping team stats and predictions`);
      return result;
    }

    const teamIds = new Set();
    result.fixturesData.forEach(fixture => {
      if (fixture.teams?.home?.id) teamIds.add(fixture.teams.home.id);
      if (fixture.teams?.away?.id) teamIds.add(fixture.teams.away.id);
    });

    const uniqueTeamIds = Array.from(teamIds);
    result.teamsProcessed = uniqueTeamIds.length;
    console.log(`✅ Found ${uniqueTeamIds.length} unique teams in fixtures`);

    if (uniqueTeamIds.length > 0) {
      console.log(`📊 Step 3: Fetching team statistics for ${uniqueTeamIds.length} teams...`);
      console.log(`   ⏱️ Step 3 started at: ${new Date().toISOString()}`);
      console.log(`   📋 Using season: ${league.season || getCurrentFootballSeason()} for team stats`);
      
      for (let i = 0; i < uniqueTeamIds.length; i++) {
        const teamId = uniqueTeamIds[i];
        try {
          console.log(`   🔄 [${i + 1}/${uniqueTeamIds.length}] Fetching stats for team ${teamId}...`);
          await updateTeamStatistics(teamId, league.leagueId, league.season || getCurrentFootballSeason());
          result.statsFetched++;
          console.log(`   ✅ [${i + 1}/${uniqueTeamIds.length}] Fetched stats for team ${teamId}`);
        } catch (statsError) {
          result.statsErrors++;
          console.error(`   ❌ [${i + 1}/${uniqueTeamIds.length}] Failed to fetch stats for team ${teamId}:`, statsError.message);
        }
      }
      console.log(`   ✅ Step 3 completed at: ${new Date().toISOString()}`);

      console.log(`✅ Team stats fetch completed: ${result.statsFetched} successful, ${result.statsErrors} errors`);
    }

    if (result.allMatchIds.length > 0) {
      console.log(`🔮 Step 4: Generating predictions for ${result.allMatchIds.length} matches...`);
      console.log(`   ⏱️ Step 4 started at: ${new Date().toISOString()}`);
      
      try {
        const predictionResults = await generatePredictionsForMatches(result.allMatchIds);
        result.predictionsGenerated = predictionResults.length;
        console.log(`   ✅ Step 4 completed at: ${new Date().toISOString()}`);
        console.log(`✅ Successfully generated ${result.predictionsGenerated} predictions`);
      } catch (predictionError) {
        result.predictionErrors++;
        console.error(`   ❌ Step 4 failed at: ${new Date().toISOString()}`);
        console.error(`❌ Error generating predictions:`, predictionError.message);
      }
    } else {
      console.log(`⚠️ No match IDs available for prediction generation`);
    }

    console.log(`🎉 League activation flow completed successfully!`);
    console.log(`   📊 New matches: ${result.newMatchesCount}`);
    console.log(`   🔄 Updated matches: ${result.updatedMatchesCount}`);
    console.log(`   👥 Teams processed: ${result.teamsProcessed}`);
    console.log(`   📊 Stats fetched: ${result.statsFetched}`);
    console.log(`   🔮 Predictions generated: ${result.predictionsGenerated}`);

    return result;

  } catch (error) {
    console.error(`💥 Error in league activation flow:`, error.message);
    throw error;
  }
};

