import express from 'express';
import {
  listTasks,
  createTask,
  updateTaskStatus,
} from '../controllers/housekeepingController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect, authorize('admin', 'manager', 'housekeeping'));

router.route('/').get(listTasks).post(createTask);
router.route('/:id').put(updateTaskStatus);

export default router;


