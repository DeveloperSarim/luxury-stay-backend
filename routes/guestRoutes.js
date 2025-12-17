import express from 'express';
import {
  createGuest,
  listGuests,
  updateGuest,
  deleteGuest,
  changeGuestPassword,
} from '../controllers/guestController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.route('/').get(authorize('admin', 'manager', 'receptionist'), listGuests).post(authorize('admin', 'manager', 'receptionist'), createGuest);
router.route('/:id')
  .put(authorize('admin', 'manager', 'receptionist'), updateGuest)
  .delete(authorize('admin', 'manager'), deleteGuest);
router.route('/:id/change-password')
  .put(authorize('admin'), changeGuestPassword);

export default router;


