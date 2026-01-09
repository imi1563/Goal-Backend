export const syncLeagueSeasonFromMatch = async (League, leagueId, matchSeason) => {
  if (!League || !leagueId || !matchSeason || typeof matchSeason !== 'number') {
    return null;
  }

  try {
    const updatedLeague = await League.findOneAndUpdate(
      { 
        leagueId: leagueId,
        $or: [
          { season: { $lt: matchSeason } },
          { season: { $exists: false } },
          { season: null }
        ]
      },
      {
        $set: {
          season: matchSeason,
          updatedAt: new Date()
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (updatedLeague) {
      console.log(`🔄 Updated league ${leagueId} season to ${matchSeason} (was older/missing)`);
      return updatedLeague;
    }
    
    return null;
  } catch (error) {
    console.error(`❌ Error syncing league ${leagueId} season to ${matchSeason}:`, error.message);
    return null;
  }
};

export const syncLeagueSeasonsFromMatches = async (League, matches) => {
  if (!League || !matches || !Array.isArray(matches) || matches.length === 0) {
    return { synced: 0, skipped: 0, errors: 0 };
  }

  try {
    const leagueSeasonMap = new Map();
    
    for (const match of matches) {
      const leagueId = match.league?.id;
      const season = match.league?.season;
      
      if (leagueId && season && typeof season === 'number') {
        const existingSeason = leagueSeasonMap.get(leagueId);
        if (!existingSeason || season > existingSeason) {
          leagueSeasonMap.set(leagueId, season);
        }
      }
    }

    if (leagueSeasonMap.size === 0) {
      return { synced: 0, skipped: 0, errors: 0 };
    }

    let synced = 0;
    let errors = 0;

    const syncPromises = Array.from(leagueSeasonMap.entries()).map(async ([leagueId, season]) => {
      try {
        const result = await syncLeagueSeasonFromMatch(League, leagueId, season);
        if (result) {
          synced++;
        }
      } catch (error) {
        console.error(`❌ Error syncing league ${leagueId} season ${season}:`, error.message);
        errors++;
      }
    });

    await Promise.all(syncPromises);

    console.log(`✅ League season sync complete: ${synced} updated, ${errors} errors, ${leagueSeasonMap.size - synced - errors} unchanged`);
    
    return { synced, skipped: leagueSeasonMap.size - synced - errors, errors };
  } catch (error) {
    console.error('❌ Error in batch league season sync:', error.message);
    return { synced: 0, skipped: 0, errors: 1 };
  }
};
