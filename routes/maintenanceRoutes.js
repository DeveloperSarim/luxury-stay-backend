import express from 'express';
import {
  listMaintenance,
  createMaintenance,
  updateMaintenance,
} from '../controllers/maintenanceController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect, authorize('admin', 'manager', 'maintenance'));

router.route('/').get(listMaintenance).post(createMaintenance);
router.route('/:id').put(updateMaintenance);

export default router;


