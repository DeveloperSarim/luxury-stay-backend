import mongoose from 'mongoose';

const reservationSchema = new mongoose.Schema(
  {
    guest: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    checkInDate: { type: Date, required: true },
    checkOutDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['reserved', 'checked_in', 'checked_out', 'cancelled'],
      default: 'reserved',
    },
    numGuests: { type: Number, default: 1 },
    totalAmount: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'refunded'],
      default: 'pending',
    },
    qrCode: { type: String },
    qrCodeData: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

export const Reservation = mongoose.model('Reservation', reservationSchema);


