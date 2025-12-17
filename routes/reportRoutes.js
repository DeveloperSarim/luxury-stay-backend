import express from 'express';
import { getSummaryReport } from '../controllers/reportController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect, authorize('admin', 'manager'));

router.get('/summary', getSummaryReport);

export default router;


