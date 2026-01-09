import express from 'express';
import {
  getMatchPredictions,
  getMatchPredictionById,
  generateMatchPredictions,
  processMatchPrediction,
  getMatchPredictionStats,
  getPredictionSummary,
  processAllFinishedMatches,
  backfillPredictionStats,
  getExistingPredictionsOnly,
  migratePredictionStats,
  updateMatchPrediction,
  getPredictionFields
} from '../controllers/matchPredictionController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getMatchPredictions);
router.get('/existing-only', getExistingPredictionsOnly);
router.get('/stats/summary', getPredictionSummary);
router.get('/:matchId', getMatchPredictionById);
router.get('/stats/overview', protect, authorize('admin'), getMatchPredictionStats);
router.post('/process-finished', protect, authorize('admin'), processAllFinishedMatches);
router.post('/stats/backfill', protect, authorize('admin'), backfillPredictionStats);
router.post('/stats/migrate', protect, authorize('admin'), migratePredictionStats);

router.post('/generate', protect, authorize('admin'), generateMatchPredictions);
router.post('/process/:matchId', protect, authorize('admin'), processMatchPrediction);

router.get('/fields/:matchId', protect, authorize('admin'), getPredictionFields);
router.put('/update/:matchId', protect, authorize('admin'), updateMatchPrediction);

export default router;
