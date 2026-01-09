import express from 'express';
import {
  getAllMatches,
  getMatchById,
  createMatch,
  updateMatch,
  deleteMatch,
  getPublishedMatches,
  getMatchesByDate,
  updateMatchScore,
  getLiveMatches,
  toggleFeaturedMatch,
  getFeaturedMatches,
  markAsPlayOfTheDay,
  removePlayOfTheDay,
  getPlayOfTheDayMatches,
  markAsAIPick,
  removeAIPick,
  getAIPickMatches,
  getAIPickMatchById,
  getDashboardStats,
  getUpcomingMatches,
  getUpcomingMatchesCount,
  getLiveMatchesCount,
  getLiveMatchData,
  getHomepageMatchesScores,
  getAllCountries,
  getLeaguesByCountry,
  getMatchesByLeagueForAdmin
} from '../controllers/matchController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getAllMatches);
router.get('/featured', getFeaturedMatches);
router.get('/live', getLiveMatches);
router.get('/live/count', getLiveMatchesCount);
router.get('/published', getPublishedMatches);
router.get('/upcoming', getUpcomingMatches);
router.get('/upcoming/count', getUpcomingMatchesCount);
router.get('/league/:leagueId', getMatchesByLeagueForAdmin);
router.get('/date/:date', getMatchesByDate);
router.get('/stats/dashboard', protect, authorize('admin'), getDashboardStats);
router.get('/play-of-day', getPlayOfTheDayMatches);
router.get('/ai-picks', getAIPickMatches);
router.get('/ai-picks/:id', getAIPickMatchById);
router.get('/live/data', getLiveMatchData);
router.get('/homepage/scores', getHomepageMatchesScores);
router.get('/countries', protect, authorize('admin'), getAllCountries);
router.get('/leagues', protect, authorize('admin'), getLeaguesByCountry);
router.get('/league-matches', protect, authorize('admin'), getMatchesByLeagueForAdmin);
router.get('/:id', getMatchById);

router.post('/', protect, authorize('admin'), createMatch);
router.put('/:id', protect, authorize('admin'), updateMatch);
router.delete('/:id', protect, authorize('admin'), deleteMatch);
router.patch('/:id/score', protect, authorize('admin'), updateMatchScore);
router.patch('/:id/featured', protect, authorize('admin'), toggleFeaturedMatch);
router.patch('/:id/play-of-day', protect, authorize('admin'), markAsPlayOfTheDay);
router.delete('/:id/play-of-day', protect, authorize('admin'), removePlayOfTheDay);
router.patch('/:id/ai-pick', protect, authorize('admin'), markAsAIPick);
router.delete('/:id/ai-pick', protect, authorize('admin'), removeAIPick);

export default router;
