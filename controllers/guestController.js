import { Guest } from '../models/Guest.js';
import bcrypt from 'bcrypt';

export const createGuest = async (req, res, next) => {
  try {
    const { password, ...guestData } = req.body;
    
    // Password is required
    if (!password || password.length < 6) {
      res.status(400);
      throw new Error('Password is required and must be at least 6 characters');
    }
    
    const guest = await Guest.create(req.body);
    // Don't send password in response
    const guestResponse = guest.toObject();
    delete guestResponse.password;
    res.status(201).json(guestResponse);
  } catch (err) {
    next(err);
  }
};

export const listGuests = async (req, res, next) => {
  try {
    const guests = await Guest.find();
    res.json(guests);
  } catch (err) {
    next(err);
  }
};

export const updateGuest = async (req, res, next) => {
  try {
    const { password, ...updateData } = req.body;
    const guest = await Guest.findById(req.params.id);
    
    if (!guest) {
      res.status(404);
      throw new Error('Guest not found');
    }
    
    // Update non-password fields
    Object.assign(guest, updateData);
    
    // If password is provided, hash it
    if (password) {
      if (password.length < 6) {
        res.status(400);
        throw new Error('Password must be at least 6 characters');
      }
      const salt = await bcrypt.genSalt(10);
      guest.password = await bcrypt.hash(password, salt);
    }
    
    await guest.save();
    
    // Don't send password in response
    const guestResponse = guest.toObject();
    delete guestResponse.password;
    res.json(guestResponse);
  } catch (err) {
    next(err);
  }
};

// Change guest password (admin only)
export const changeGuestPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    
    if (!password || password.length < 6) {
      res.status(400);
      throw new Error('Password is required and must be at least 6 characters');
    }
    
    const guest = await Guest.findById(req.params.id);
    if (!guest) {
      res.status(404);
      throw new Error('Guest not found');
    }
    
    const salt = await bcrypt.genSalt(10);
    guest.password = await bcrypt.hash(password, salt);
    await guest.save();
    
    res.json({ message: 'Guest password updated successfully' });
  } catch (err) {
    next(err);
  }
};

export const deleteGuest = async (req, res, next) => {
  try {
    const guest = await Guest.findByIdAndDelete(req.params.id);
    if (!guest) {
      res.status(404);
      throw new Error('Guest not found');
    }
    res.json({ message: 'Guest deleted successfully' });
  } catch (err) {
    next(err);
  }
};


