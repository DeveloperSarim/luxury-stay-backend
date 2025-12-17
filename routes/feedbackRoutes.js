import express from 'express';
import { createFeedback, listFeedback } from '../controllers/feedbackController.js';

const router = express.Router();

router.route('/').get(listFeedback).post(createFeedback);

export default router;


