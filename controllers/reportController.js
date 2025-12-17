import { Reservation } from '../models/Reservation.js';
import { Invoice } from '../models/Invoice.js';
import { Feedback } from '../models/Feedback.js';

export const getSummaryReport = async (req, res, next) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const occupancyCount = await Reservation.countDocuments({
      status: 'checked_in',
    });
    const totalReservations = await Reservation.countDocuments();
    const revenueAgg = await Invoice.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);
    const revenue = revenueAgg[0]?.total || 0;

    const todayFeedback = await Feedback.find({
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    });
    const avgRating =
      todayFeedback.length > 0
        ? todayFeedback.reduce((sum, f) => sum + f.rating, 0) /
          todayFeedback.length
        : 0;

    res.json({
      occupancyCount,
      totalReservations,
      revenue,
      avgRating,
    });
  } catch (err) {
    next(err);
  }
};


