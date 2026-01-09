import express from 'express';
import {
  getHomepageMatches,
  getDoubleOrNothingMatches,
  toggleDoubleOrNothing,
  toggleShowOnHomepage,
  getDashboardCounts,
  getMarkedAsShowOnHomepageMatches,
  getTomorrowMatches
} from '../controllers/adminMatchController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/homepage', getHomepageMatches);
router.get('/tomorrow', getTomorrowMatches);
router.get('/markedasshowonhomepage', getMarkedAsShowOnHomepageMatches);
router.get('/double-or-nothing', getDoubleOrNothingMatches);
router.get('/dashboard/counts', getDashboardCounts);

router.patch('/:matchId/double-or-nothing', protect, authorize('admin'), toggleDoubleOrNothing);
router.patch('/:matchId/homepage', protect, authorize('admin'), toggleShowOnHomepage);

export default router;
