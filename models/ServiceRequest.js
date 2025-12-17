import mongoose from 'mongoose';

const serviceRequestSchema = new mongoose.Schema(
  {
    guest: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    type: {
      type: String,
      enum: ['room_service', 'wake_up_call', 'transport', 'other'],
      required: true,
    },
    details: { type: String },
    status: {
      type: String,
      enum: ['requested', 'in_progress', 'completed', 'cancelled'],
      default: 'requested',
    },
  },
  { timestamps: true }
);

export const ServiceRequest = mongoose.model(
  'ServiceRequest',
  serviceRequestSchema
);


