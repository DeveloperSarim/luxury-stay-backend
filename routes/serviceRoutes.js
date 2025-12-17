import express from 'express';
import {
  createServiceRequest,
  listServiceRequests,
  updateServiceRequest,
} from '../controllers/serviceController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect, authorize('admin', 'manager', 'receptionist'));

router.route('/').get(listServiceRequests).post(createServiceRequest);
router.route('/:id').put(updateServiceRequest);

export default router;


