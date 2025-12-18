import { Chat } from '../models/Chat.js';
import { User } from '../models/User.js';
import { Guest } from '../models/Guest.js';

// Get all messages (for user and admin)
export const getMessages = async (req, res, next) => {
  try {
    const userId = req.user.id;
    // Try User model first, then Guest model
    let user = await User.findById(userId);
    
    if (!user) {
      const guest = await Guest.findById(userId);
      if (guest) {
        // Convert guest to user-like object for compatibility
        user = {
          _id: guest._id,
          name: `${guest.firstName} ${guest.lastName}`.trim(),
          email: guest.email,
          role: 'user', // Guest is treated as 'user' role
        };
      }
    }
    
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
          .lean()
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
          .lean()
          .sort({ createdAt: -1 })
          .limit(500);
      }
      
      // Manually populate senderId and receiverId for both User and Guest
      for (let msg of messages) {
        // Populate senderId
        if (msg.senderId) {
          let sender = await User.findById(msg.senderId).select('name email').lean();
          if (!sender) {
            sender = await Guest.findById(msg.senderId).select('firstName lastName email').lean();
            if (sender) {
              msg.senderId = {
                _id: sender._id,
                name: `${sender.firstName || ''} ${sender.lastName || ''}`.trim(),
                email: sender.email
              };
            }
          } else {
            msg.senderId = {
              _id: sender._id,
              name: sender.name,
              email: sender.email
            };
          }
        }
        
        // Populate receiverId
        if (msg.receiverId) {
          let receiver = await User.findById(msg.receiverId).select('name email').lean();
          if (!receiver) {
            receiver = await Guest.findById(msg.receiverId).select('firstName lastName email').lean();
            if (receiver) {
              msg.receiverId = {
                _id: receiver._id,
                name: `${receiver.firstName || ''} ${receiver.lastName || ''}`.trim(),
                email: receiver.email
              };
            }
          } else {
            msg.receiverId = {
              _id: receiver._id,
              name: receiver.name,
              email: receiver.email
            };
          }
        }
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
    // Try User model first, then Guest model
    let user = await User.findById(userId);
    
    if (!user) {
      const guest = await Guest.findById(userId);
      if (guest) {
        // Convert guest to user-like object for compatibility
        user = {
          _id: guest._id,
          name: `${guest.firstName} ${guest.lastName}`.trim(),
          email: guest.email,
          role: 'user', // Guest is treated as 'user' role
        };
      }
    }
    
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
        // Check both User and Guest models
        let receiver = await User.findById(receiverId);
        if (!receiver) {
          receiver = await Guest.findById(receiverId);
          if (!receiver) {
            res.status(404);
            throw new Error('Receiver user not found');
          }
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
    
    // Manually populate senderId and receiverId for both User and Guest
    const populatedMessage = await Chat.findById(chatMessage._id).lean();
    
    // Populate senderId
    if (populatedMessage.senderId) {
      let sender = await User.findById(populatedMessage.senderId).select('name email').lean();
      if (!sender) {
        sender = await Guest.findById(populatedMessage.senderId).select('firstName lastName email').lean();
        if (sender) {
          populatedMessage.senderId = {
            _id: sender._id,
            name: `${sender.firstName || ''} ${sender.lastName || ''}`.trim(),
            email: sender.email
          };
        }
      } else {
        populatedMessage.senderId = {
          _id: sender._id,
          name: sender.name,
          email: sender.email
        };
      }
    }
    
    // Populate receiverId
    if (populatedMessage.receiverId) {
      let receiver = await User.findById(populatedMessage.receiverId).select('name email').lean();
      if (!receiver) {
        receiver = await Guest.findById(populatedMessage.receiverId).select('firstName lastName email').lean();
        if (receiver) {
          populatedMessage.receiverId = {
            _id: receiver._id,
            name: `${receiver.firstName || ''} ${receiver.lastName || ''}`.trim(),
            email: receiver.email
          };
        }
      } else {
        populatedMessage.receiverId = {
          _id: receiver._id,
          name: receiver.name,
          email: receiver.email
        };
      }
    }
    
    res.status(201).json(populatedMessage);
  } catch (err) {
    next(err);
  }
};

// Mark messages as read (for admin)
export const markAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    // Try User model first, then Guest model
    let user = await User.findById(userId);
    
    if (!user) {
      const guest = await Guest.findById(userId);
      if (guest) {
        // Convert guest to user-like object for compatibility
        user = {
          _id: guest._id,
          name: `${guest.firstName} ${guest.lastName}`.trim(),
          email: guest.email,
          role: 'user', // Guest is treated as 'user' role
        };
      }
    }
    
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }
    
    if (user.role !== 'admin' && user.role !== 'manager') {
      res.status(403);
      throw new Error('Only admin can mark messages as read');
    }
    
    const { conversationUserId } = req.body;
    
    if (conversationUserId) {
      // Mark specific conversation as read
      await Chat.updateMany(
        { 
          senderId: conversationUserId, 
          $or: [
            { receiverId: null },
            { receiverId: { $exists: false } }
          ],
          senderRole: 'user', 
          isRead: false 
        },
        { isRead: true }
      );
    } else {
      // Mark all user messages as read
      await Chat.updateMany(
        { 
          senderRole: 'user', 
          $or: [
            { receiverId: null },
            { receiverId: { $exists: false } }
          ],
          isRead: false 
        },
        { isRead: true }
      );
    }
    
    res.json({ message: 'Messages marked as read' });
  } catch (err) {
    next(err);
  }
};

