import 'dotenv/config';
import axios from 'axios';

const baseURL = process.env.RAPIDAPI_BASE_URL || 'https://v3.football.api-sports.io';
const host = process.env.RAPIDAPI_HOST || 'v3.football.api-sports.io';
const key = process.env.RAPIDAPI_KEY;

const leagueId = process.argv[2];
const season = process.argv[3];

if (!leagueId || !season) {
  console.error('Usage: node scripts/verifyFinishedFixtures.js <leagueId> <seasonStartYear>');
  process.exit(1);
}

const run = async () => {
  try {
    // Test each status separately like our updated function
    const statuses = ['FT', 'AET', 'PEN'];
    let allFixtures = [];
    
    for (const status of statuses) {
      try {
        const res = await axios.get(`${baseURL}/fixtures`, {
          headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host },
          params: { league: leagueId, season, status: status }
        });
        
        if (res.data?.response) {
          allFixtures.push(...res.data.response);
          console.log(`✅ ${status}: ${res.data.response.length} fixtures`);
        }
      } catch (e) {
        console.log(`❌ ${status}: ${e?.response?.status} ${e?.response?.statusText}`);
      }
    }
    
    console.log(JSON.stringify({
      leagueId: Number(leagueId),
      season: Number(season),
      totalFixtures: allFixtures.length,
      breakdown: statuses.map(s => `${s}: ${allFixtures.filter(f => f.fixture?.status?.short === s).length}`)
    }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('Request failed:', e?.response?.status, e?.response?.statusText);
    console.error('Data:', e?.response?.data);
    process.exit(1);
  }
};

run();



