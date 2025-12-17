import { Chat } from '../models/Chat.js';
import { User } from '../models/User.js';

// Get all messages (for user and admin)
export const getMessages = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }
    
    let messages;
    
    if (user.role === 'admin' || user.role === 'manager') {
      // Admin can see all messages, but we'll filter by conversation in frontend
      // If specific userId query param is provided, show only that conversation
      const { userId: targetUserId } = req.query;
      
      if (targetUserId) {
        // Show conversation between admin and specific user
        messages = await Chat.find({
          $or: [
            { senderId: targetUserId, $or: [{ receiverId: null }, { receiverId: { $exists: false } }] }, // User messages to admin (old messages may not have receiverId)
            { senderId: userId, receiverId: targetUserId }, // Admin messages to this user
            { senderId: targetUserId, receiverId: { $exists: false } } // Old messages from this user
          ]
        })
          .populate('senderId', 'name email')
          .populate('receiverId', 'name email')
          .sort({ createdAt: 1 })
          .limit(200);
      } else {
        // Show all messages for admin to see all conversations
        // Include both old messages (no receiverId) and new messages
        messages = await Chat.find({
          $or: [
            { receiverId: null }, // Messages to admin
            { receiverId: { $exists: false } }, // Old messages without receiverId
            { receiverId: { $exists: true, $ne: null } } // Messages with receiverId (admin to user)
          ]
        })
          .populate('senderId', 'name email')
          .populate('receiverId', 'name email')
          .sort({ createdAt: -1 })
          .limit(500);
      }
    } else {
      // Regular users can only see their own conversation with admin
      messages = await Chat.find({
        $or: [
          { senderId: userId, $or: [{ receiverId: null }, { receiverId: { $exists: false } }] }, // User's messages to admin (old messages may not have receiverId)
          { receiverId: userId }, // Admin's messages to this user
          { senderId: userId, receiverId: { $exists: false } } // Old messages where user is sender
        ]
      })
        .populate('senderId', 'name email')
        .populate('receiverId', 'name email')
        .sort({ createdAt: 1 })
        .limit(200);
    }
    
    res.json(messages);
  } catch (err) {
    next(err);
  }
};

// Send a message
export const sendMessage = async (req, res, next) => {
  try {
    const { message, receiverId } = req.body;
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }
    
    if (!message || !message.trim()) {
      res.status(400);
      throw new Error('Message is required');
    }
    
    let finalReceiverId = null;
    
    if (user.role === 'admin' || user.role === 'manager') {
      // Admin sending message - receiverId is required
      if (receiverId) {
        const receiver = await User.findById(receiverId);
        if (!receiver) {
          res.status(404);
          throw new Error('Receiver user not found');
        }
        finalReceiverId = receiverId;
      } else {
        res.status(400);
        throw new Error('Admin must specify receiverId when sending messages');
      }
    } else {
      // Regular user sending message - receiverId is null (message goes to admin)
      finalReceiverId = null;
    }
    
    const chatMessage = await Chat.create({
      senderId: userId,
      receiverId: finalReceiverId,
      senderRole: user.role === 'admin' || user.role === 'manager' ? 'admin' : 'user',
      message: message.trim(),
    });
    
    const populatedMessage = await Chat.findById(chatMessage._id)
      .populate('senderId', 'name email')
      .populate('receiverId', 'name email');
    
    res.status(201).json(populatedMessage);
  } catch (err) {
    next(err);
  }
};

// Mark messages as read (for admin)
export const markAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    const { conversationUserId } = req.body; // Optional: mark specific conversation as read
    
    if (user.role !== 'admin' && user.role !== 'manager') {
      res.status(403);
      throw new Error('Only admin can mark messages as read');
    }
    
    if (conversationUserId) {
      // Mark specific conversation as read
      await Chat.updateMany(
        { 
          senderId: conversationUserId, 
          receiverId: null,
          senderRole: 'user', 
          isRead: false 
        },
        { isRead: true }
      );
    } else {
      // Mark all user messages as read
      await Chat.updateMany(
        { senderRole: 'user', isRead: false },
        { isRead: true }
      );
    }
    
    res.json({ message: 'Messages marked as read' });
  } catch (err) {
    next(err);
  }
};

