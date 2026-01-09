export const getCurrentFootballSeason = () => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  
  if (currentMonth >= 7) {
    return currentYear;
  } else {
    return currentYear - 1;
  }
};

export const getLatestAvailableSeason = () => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  
  if (currentMonth >= 7) {
    return currentYear;
  } else {
    return currentYear - 1;
  }
};

export const getLatestAvailableSeasonFromDB = async (Team, leagueId = null) => {
  try {
    let query = {};
    
    if (leagueId) {
      query[`statistics.${leagueId}`] = { $exists: true };
    } else {
      query.statistics = { $exists: true };
    }
    
    const teams = await Team.find(query);
    
    if (teams.length === 0) {
      console.log('⚠️ No teams with statistics found in database');
      return getLatestAvailableSeason();
    }
    
    const seasonsWithData = new Set();
    
    teams.forEach(team => {
      if (team.statistics) {
        Object.keys(team.statistics).forEach(leagueKey => {
          if (leagueId && leagueKey !== leagueId.toString()) return;
          
          if (team.statistics[leagueKey]) {
            Object.keys(team.statistics[leagueKey]).forEach(seasonKey => {
              const season = parseInt(seasonKey);
              if (!isNaN(season)) {
                seasonsWithData.add(season);
              }
            });
          }
        });
      }
    });
    
    if (seasonsWithData.size === 0) {
      console.log('⚠️ No valid seasons found in database');
      return getLatestAvailableSeason();
    }
    
    const sortedSeasons = Array.from(seasonsWithData).sort((a, b) => b - a);
    const latestSeason = sortedSeasons[0];
    
    console.log(`🔍 Found seasons in database: ${Array.from(seasonsWithData).sort((a, b) => a - b).join(', ')}`);
    console.log(`✅ Using latest available season: ${latestSeason}`);
    
    return latestSeason;
    
  } catch (error) {
    console.error('❌ Error getting latest season from database:', error.message);
    return getLatestAvailableSeason();
  }
};

export const getLatestSeasonWithAPIData = async (getTeamStatistics, testTeamId = 49, testLeagueId = 39) => {
  try {
    console.log('🔍 Dynamically searching for latest season with API data...');
    
    const currentYear = new Date().getFullYear();
    
    for (let year = currentYear; year >= currentYear - 3; year--) {
      console.log(`🔍 Testing season ${year} for API data...`);
      
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 10000)
        );
        
        const testStats = await Promise.race([
          getTeamStatistics(testTeamId, testLeagueId, year),
          timeoutPromise
        ]);
        
        if (testStats && testStats.response && testStats.response.length > 0) {
          console.log(`✅ Found API data for season ${year}. This is the latest available season.`);
          return year;
        } else {
          console.log(`⚠️ Season ${year} returned empty data. Trying next season...`);
        }
      } catch (error) {
        console.log(`⚠️ Season ${year} failed: ${error.message}`);
        continue;
      }
    }
    
    const currentSeason = getCurrentFootballSeason();
    console.log(`⚠️ No API data found for any recent season. Using current season: ${currentSeason}`);
    return currentSeason;
    
  } catch (error) {
    console.error('❌ Error finding latest season with API data:', error.message);
    const currentSeason = getCurrentFootballSeason();
    return currentSeason;
  }
};

export const getPreviousFootballSeason = () => {
  return getCurrentFootballSeason() - 1;
};

export const getFootballSeasons = () => {
  const currentSeason = getCurrentFootballSeason();
  const previousSeason = getPreviousFootballSeason();
  return [currentSeason, previousSeason];
};

export const getFootballSeasonForDate = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  if (month >= 7) {
    return year;
  } else {
    return year - 1;
  }
};
