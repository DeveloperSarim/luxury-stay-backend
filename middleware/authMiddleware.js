import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { Guest } from '../models/Guest.js';

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'devsecret');
      
      // First try to find in User model
      let user = await User.findById(decoded.id).select('-password');
      
      // If not found in User, try Guest model
      if (!user) {
        const guest = await Guest.findById(decoded.id).select('-password');
        if (guest) {
          // Convert guest to user-like object for compatibility
          user = {
            _id: guest._id,
            name: `${guest.firstName} ${guest.lastName}`.trim(),
            email: guest.email,
            role: 'user', // Guest is treated as 'user' role
            id: guest._id.toString(),
          };
        }
      }
      
      if (!user) {
        res.status(401);
        throw new Error('Not authorized, user not found');
      }
      
      // Check if user is active (for User model only, guests don't have isActive)
      if (user.isActive === false) {
        res.status(401);
        throw new Error('Not authorized, user inactive');
      }
      
      // Ensure id is set (use _id if id is not present)
      if (!user.id && user._id) {
        user.id = user._id.toString();
      }
      
      req.user = user;
      next();
    } catch (error) {
      console.error(error);
      res.status(401);
      next(new Error('Not authorized, token failed'));
    }
  } else {
    res.status(401);
    next(new Error('Not authorized, no token'));
  }
};

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    res.status(403);
    return next(new Error('Forbidden: insufficient role'));
  }
  next();
};


