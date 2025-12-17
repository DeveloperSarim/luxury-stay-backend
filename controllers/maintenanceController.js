import { MaintenanceRequest } from '../models/MaintenanceRequest.js';

export const listMaintenance = async (req, res, next) => {
  try {
    const items = await MaintenanceRequest.find().populate('room');
    res.json(items);
  } catch (err) {
    next(err);
  }
};

export const createMaintenance = async (req, res, next) => {
  try {
    const item = await MaintenanceRequest.create(req.body);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
};

export const updateMaintenance = async (req, res, next) => {
  try {
    const item = await MaintenanceRequest.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!item) {
      res.status(404);
      throw new Error('Maintenance request not found');
    }
    res.json(item);
  } catch (err) {
    next(err);
  }
};


