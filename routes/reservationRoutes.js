import express from 'express';
import {
  createReservation,
  createPublicReservation,
  listReservations,
  checkIn,
  checkOut,
  scanQRCode,
  getMyBookings,
  cancelBooking,
  downloadQRCode,
} from '../controllers/reservationController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes (no auth required)
router.post('/public', createPublicReservation);
router.post('/scan-qr', scanQRCode);

// User routes (protected, user role)
router.get('/my-bookings', protect, getMyBookings);
router.get('/:id/qr-code', protect, downloadQRCode); // Download QR code for reservation
router.put('/:id/cancel', protect, cancelBooking);
router.post('/', protect, createReservation); // Users can create bookings

// Protected routes for staff
router.use(protect, authorize('admin', 'manager', 'receptionist'));

router.route('/').get(listReservations);
router.route('/:id/check-in').post(checkIn);
router.route('/:id/check-out').post(checkOut);

export default router;


