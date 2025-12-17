import mongoose from 'mongoose';

const housekeepingTaskSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending',
    },
    notes: { type: String },
    scheduledAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

export const HousekeepingTask = mongoose.model(
  'HousekeepingTask',
  housekeepingTaskSchema
);


