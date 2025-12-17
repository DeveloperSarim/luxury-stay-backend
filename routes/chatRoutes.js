import express from 'express';
import {
  getMessages,
  sendMessage,
  markAsRead,
} from '../controllers/chatController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// All chat routes require authentication
router.use(protect);

// Get messages (user and admin can both access)
router.get('/messages', getMessages);

// Send message (user and admin can both send)
router.post('/send', sendMessage);

// Mark as read (admin and manager)
router.put('/mark-read', authorize('admin', 'manager'), markAsRead);

export default router;

