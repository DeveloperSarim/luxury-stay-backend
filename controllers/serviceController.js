import { ServiceRequest } from '../models/ServiceRequest.js';

export const createServiceRequest = async (req, res, next) => {
  try {
    const service = await ServiceRequest.create(req.body);
    res.status(201).json(service);
  } catch (err) {
    next(err);
  }
};

export const listServiceRequests = async (req, res, next) => {
  try {
    const services = await ServiceRequest.find().populate('guest').populate('room');
    res.json(services);
  } catch (err) {
    next(err);
  }
};

export const updateServiceRequest = async (req, res, next) => {
  try {
    const service = await ServiceRequest.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!service) {
      res.status(404);
      throw new Error('Service request not found');
    }
    res.json(service);
  } catch (err) {
    next(err);
  }
};


