import express from 'express';
import {
  createStaff,
  listStaff,
  updateStaff,
  deleteStaff,
} from '../controllers/userController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect, authorize('admin', 'manager'));

router.route('/').get(listStaff).post(createStaff);
router.route('/:id').put(updateStaff).delete(deleteStaff);

export default router;


