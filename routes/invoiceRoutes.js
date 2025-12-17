import express from 'express';
import {
  createInvoice,
  listInvoices,
  updateInvoiceStatus,
} from '../controllers/invoiceController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect, authorize('admin', 'manager', 'receptionist'));

router.route('/').get(listInvoices).post(createInvoice);
router.route('/:id/status').put(updateInvoiceStatus);

export default router;


