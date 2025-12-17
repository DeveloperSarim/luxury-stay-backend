import { Feedback } from '../models/Feedback.js';

export const createFeedback = async (req, res, next) => {
  try {
    const feedback = await Feedback.create(req.body);
    res.status(201).json(feedback);
  } catch (err) {
    next(err);
  }
};

export const listFeedback = async (req, res, next) => {
  try {
    const feedbacks = await Feedback.find().populate('guest');
    res.json(feedbacks);
  } catch (err) {
    next(err);
  }
};


