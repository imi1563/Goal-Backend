import express from 'express';
import {
  getAllTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam,
  getTeamsByLeague
} from '../controllers/teamController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getAllTeams);
router.get('/league/:leagueId', getTeamsByLeague);
router.get('/:id', getTeamById);

router.post('/', protect, authorize('admin'), createTeam);
router.put('/:id', protect, authorize('admin'), updateTeam);
router.delete('/:id', protect, authorize('admin'), deleteTeam);

export default router;
