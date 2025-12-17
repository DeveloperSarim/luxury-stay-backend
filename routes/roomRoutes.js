import express from 'express';
import { createRoom, listRooms, updateRoom, deleteRoom, getRoomAvailability } from '../controllers/roomController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/').get(listRooms);
router.route('/:id/availability').get(getRoomAvailability);

router.use(protect);

router
  .route('/')
  .post(authorize('admin', 'manager', 'receptionist'), createRoom);
router
  .route('/:id')
  .put(authorize('admin', 'manager', 'receptionist'), updateRoom)
  .delete(authorize('admin', 'manager', 'receptionist'), deleteRoom);

export default router;


