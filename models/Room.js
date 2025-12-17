import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema(
  {
    roomNumber: { type: String, required: true, unique: true },
    type: {
      type: String,
      enum: ['standard', 'deluxe', 'suite', 'presidential'],
      required: true,
    },
    floor: { type: Number },
    pricePerNight: { type: Number, required: true },
    status: {
      type: String,
      enum: ['available', 'reserved', 'occupied', 'cleaning', 'maintenance'],
      default: 'available',
    },
    description: { type: String },
    amenities: [{ type: String }],
  },
  { timestamps: true }
);

export const Room = mongoose.model('Room', roomSchema);


