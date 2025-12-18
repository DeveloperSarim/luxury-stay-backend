import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { Guest } from '../models/Guest.js';
import { sendPasswordResetEmail } from '../utils/emailService.js';

const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET || 'devsecret', {
    expiresIn: '7d',
  });

export const registerAdmin = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      res.status(400);
      throw new Error('Admin already exists');
    }
    const exists = await User.findOne({ email });
    if (exists) {
      res.status(400);
      throw new Error('User already exists');
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashed,
      role: 'admin',
    });
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id, user.role),
    });
  } catch (err) {
    next(err);
  }
};

export const registerStaffWithRole = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const allowedRoles = ['manager', 'receptionist', 'housekeeping', 'maintenance'];
    if (!allowedRoles.includes(role)) {
      res.status(400);
      throw new Error('Invalid role');
    }
    const exists = await User.findOne({ email });
    if (exists) {
      res.status(400);
      throw new Error('User already exists');
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashed,
      role,
    });
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id, user.role),
    });
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // First try User model
    let user = await User.findOne({ email });
    if (user && user.isActive) {
      const match = await bcrypt.compare(password, user.password);
      if (match) {
        return res.json({
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          token: generateToken(user._id, user.role),
        });
      }
    }
    
    // If not found in User, try Guest model
    const guest = await Guest.findOne({ email: email.toLowerCase() });
    if (guest && guest.password) {
      const match = await bcrypt.compare(password, guest.password);
      if (match) {
        return res.json({
          _id: guest._id,
          name: `${guest.firstName} ${guest.lastName}`.trim(),
          email: guest.email,
          role: 'user', // Guest is treated as 'user' role
          token: generateToken(guest._id, 'user'),
        });
      }
    }
    
    // If neither matches
    res.status(401);
    throw new Error('Invalid credentials');
  } catch (err) {
    next(err);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    // Try User model first, then Guest model
    let user = await User.findById(req.user.id).select('-password');
    if (!user) {
      const guest = await Guest.findById(req.user.id).select('-password');
      if (guest) {
        // Convert guest to user-like format
        user = {
          _id: guest._id,
          name: `${guest.firstName} ${guest.lastName}`.trim(),
          email: guest.email,
          role: 'user',
        };
      }
    }
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const { name, email } = req.body;
    
    // Try User model first, then Guest model
    let user = await User.findById(req.user.id);
    let isGuest = false;
    
    if (!user) {
      const guest = await Guest.findById(req.user.id);
      if (guest) {
        isGuest = true;
        user = guest;
      }
    }
    
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }
    
    // Email address cannot be changed
    if (email && email !== user.email) {
      res.status(400);
      throw new Error('Email address cannot be changed');
    }
    
    if (name) {
      if (isGuest) {
        // For guests, split name into firstName and lastName
        const nameParts = name.split(' ');
        user.firstName = nameParts[0] || name;
        user.lastName = nameParts.slice(1).join(' ') || '';
      } else {
        user.name = name;
      }
    }
    
    await user.save();
    const safeUser = user.toObject();
    delete safeUser.password;
    
    // Format response for guests
    if (isGuest) {
      safeUser.name = `${safeUser.firstName} ${safeUser.lastName}`.trim();
      safeUser.role = 'user';
    }
    
    res.json(safeUser);
  } catch (err) {
    next(err);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Try User model first, then Guest model
    let user = await User.findById(req.user.id);
    
    if (!user) {
      user = await Guest.findById(req.user.id);
    }
    
    if (!user || !user.password) {
      res.status(404);
      throw new Error('User not found');
    }
    
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      res.status(401);
      throw new Error('Current password is incorrect');
    }
    
    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();
    
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
};

// Registration (public) - creates Guest for 'user' role, User for other roles
export const registerUser = async (req, res, next) => {
  try {
    const { name, email, password, phone, role } = req.body;
    
    // Allowed roles for public registration
    const allowedRoles = ['user', 'admin', 'receptionist', 'housekeeping', 'maintenance'];
    let selectedRole = role && allowedRoles.includes(role) ? role : 'user';
    
    // If user selects 'admin', set role as 'admin' (admin and manager are same)
    if (selectedRole === 'admin') {
      selectedRole = 'admin';
    }
    
    // If role is 'user', create Guest; otherwise create User
    if (selectedRole === 'user') {
      // Check if guest already exists
      const existingGuest = await Guest.findOne({ email: email.toLowerCase() });
      if (existingGuest) {
        res.status(400);
        throw new Error('Guest already exists with this email');
      }
      
      // Create guest
      const nameParts = name.split(' ');
      const guest = await Guest.create({
        firstName: nameParts[0] || name,
        lastName: nameParts.slice(1).join(' ') || '',
        email: email.toLowerCase(),
        phone: phone || '',
        password: password, // Will be hashed by pre-save hook
      });
      
      // Generate token for guest
      res.status(201).json({
        _id: guest._id,
        name: `${guest.firstName} ${guest.lastName}`.trim(),
        email: guest.email,
        role: 'user', // Guest is treated as 'user' role
        token: generateToken(guest._id, 'user'),
      });
    } else {
      // Create User for other roles
      const exists = await User.findOne({ email: email.toLowerCase() });
      if (exists) {
        res.status(400);
        throw new Error('User already exists with this email');
      }
      
      const hashed = await bcrypt.hash(password, 10);
      const user = await User.create({
        name,
        email: email.toLowerCase(),
        password: hashed,
        phone: phone || '',
        role: selectedRole,
      });
      
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id, user.role),
      });
    }
  } catch (err) {
    next(err);
  }
};

// Forgot password
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    
    // Don't reveal if user exists or not for security
    if (!user) {
      res.json({ message: 'If email exists, reset link has been sent' });
      return;
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date();
    resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1); // 1 hour expiry
    
    // Save reset token to user
    user.resetToken = resetToken;
    user.resetTokenExpiry = resetTokenExpiry;
    await user.save();
    
    // Send email with reset link
    try {
      console.log('📧 Sending password reset email to:', user.email);
      await sendPasswordResetEmail(user.email, resetToken);
      console.log('✅ Email sent successfully to:', user.email);
      
      // For development: also return the reset link in response (remove in production)
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
      res.json({ 
        message: 'Password reset link sent to your email',
        // Development only - remove in production
        resetLink: process.env.NODE_ENV === 'development' ? resetUrl : undefined
      });
    } catch (emailError) {
      console.error('❌ Email sending failed:');
      console.error('   Error:', emailError.message);
      console.error('   Code:', emailError.code);
      console.error('   Stack:', emailError.stack);
      
      // For development: return reset link even if email fails
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
      
      // Clear the token if email fails
      user.resetToken = undefined;
      user.resetTokenExpiry = undefined;
      await user.save();
      
      res.status(500).json({ 
        message: emailError.message || 'Failed to send email. Please check your SMTP configuration and try again later.',
        // Development only - show reset link if email fails
        resetLink: process.env.NODE_ENV === 'development' ? resetUrl : undefined,
        error: 'Email sending failed. Check server logs for details.'
      });
    }
  } catch (err) {
    next(err);
  }
};

// Reset password
export const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      res.status(400);
      throw new Error('Token and password are required');
    }
    
    // Find user with valid reset token
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: new Date() }, // Token not expired
    });
    
    if (!user) {
      res.status(400);
      throw new Error('Invalid or expired reset token');
    }
    
    // Hash new password
    const hashed = await bcrypt.hash(password, 10);
    
    // Update password and clear reset token
    user.password = hashed;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();
    
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
};


