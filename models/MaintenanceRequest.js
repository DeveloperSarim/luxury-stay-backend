import mongoose from 'mongoose';

const maintenanceRequestSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    reportedByGuest: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest' },
    reportedByStaff: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    issue: { type: String, required: true },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

export const MaintenanceRequest = mongoose.model(
  'MaintenanceRequest',
  maintenanceRequestSchema
);


