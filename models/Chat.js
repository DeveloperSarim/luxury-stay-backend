import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null, // null means message is for admin (when user sends) or for all users (when admin sends to specific user)
  },
  senderRole: {
    type: String,
    enum: ['user', 'admin'],
    required: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Index for faster queries
chatSchema.index({ createdAt: -1 });
chatSchema.index({ senderId: 1, createdAt: -1 });
chatSchema.index({ receiverId: 1, createdAt: -1 });
chatSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 }); // For conversation queries

export const Chat = mongoose.model('Chat', chatSchema);

