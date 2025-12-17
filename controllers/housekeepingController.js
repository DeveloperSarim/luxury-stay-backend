import { HousekeepingTask } from '../models/HousekeepingTask.js';

export const listTasks = async (req, res, next) => {
  try {
    const tasks = await HousekeepingTask.find().populate('room').populate('assignedTo');
    res.json(tasks);
  } catch (err) {
    next(err);
  }
};

export const createTask = async (req, res, next) => {
  try {
    const task = await HousekeepingTask.create(req.body);
    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
};

export const updateTaskStatus = async (req, res, next) => {
  try {
    const task = await HousekeepingTask.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!task) {
      res.status(404);
      throw new Error('Task not found');
    }
    res.json(task);
  } catch (err) {
    next(err);
  }
};


