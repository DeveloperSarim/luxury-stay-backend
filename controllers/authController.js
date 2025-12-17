import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User.js';
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
    const user = await User.findOne({ email });
    if (!user || !user.isActive) {
      res.status(401);
      throw new Error('Invalid credentials');
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      res.status(401);
      throw new Error('Invalid credentials');
    }
    res.json({
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

export const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
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
    const user = await User.findById(req.user.id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }
    
    if (email && email !== user.email) {
      const exists = await User.findOne({ email });
      if (exists) {
        res.status(400);
        throw new Error('Email already in use');
      }
      user.email = email;
    }
    
    if (name) {
      user.name = name;
    }
    
    await user.save();
    const safeUser = user.toObject();
    delete safeUser.password;
    res.json(safeUser);
  } catch (err) {
    next(err);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) {
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

// User registration (public)
export const registerUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email });
    if (exists) {
      res.status(400);
      throw new Error('User already exists with this email');
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashed,
      role: 'user',
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


