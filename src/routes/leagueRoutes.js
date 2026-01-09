import express from 'express';
import {
  getAllLeagues,
  getLeagueById,
  createLeague,
  updateLeague,
  deleteLeague,
  activateLeague,
  deactivateLeague,
  getActiveLeagues
} from '../controllers/leagueController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/active', getActiveLeagues);
router.get('/:id', getLeagueById);

router.get('/', protect, authorize('admin'), getAllLeagues);
router.post('/', protect, authorize('admin'), createLeague);
router.put('/:id', protect, authorize('admin'), updateLeague);
router.delete('/:id', protect, authorize('admin'), deleteLeague);
router.patch('/:id/activate', protect, authorize('admin'), activateLeague);
router.patch('/:id/deactivate', protect, authorize('admin'), deactivateLeague);

export default router;
