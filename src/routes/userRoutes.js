import express from 'express';
import {
  getAllUsers,
  getUserById,
  createUser,
  createAdmin,
  updateUser,
  deleteUser,
  getProfile,
  loginUser
} from '../controllers/userController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', createUser);
router.post('/register/admin', createAdmin);
router.post('/login', loginUser);

router.get('/profile', protect, getProfile);
router.get('/:id', protect, getUserById);
router.put('/:id', protect, updateUser);
router.delete('/:id', protect, deleteUser);

router.get('/', protect, authorize('admin'), getAllUsers);

export default router;
