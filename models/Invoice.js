import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema(
  {
    reservation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reservation',
      required: true,
    },
    guest: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true },
    items: [
      {
        description: String,
        amount: Number,
      },
    ],
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['unpaid', 'paid', 'void'],
      default: 'unpaid',
    },
  },
  { timestamps: true }
);

export const Invoice = mongoose.model('Invoice', invoiceSchema);


