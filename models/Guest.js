import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const guestSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: false, default: '' },
    email: { type: String, lowercase: true },
    phone: { type: String },
    password: { 
      type: String, 
      required: false, // Make optional - will be set when needed
      default: null
    },
    resetToken: { type: String },
    resetTokenExpiry: { type: Date },
    address: { type: String },
    preferences: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

// Hash password before saving
guestSchema.pre('save', async function() {
  // Skip if password is not modified or doesn't exist
  if (!this.isModified('password') || !this.password) {
    return;
  }
  
  // Skip hashing if already hashed (starts with $2b$)
  if (this.password.startsWith('$2b$')) {
    return;
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    // In async hooks, we can throw the error directly
    throw error;
  }
});

export const Guest = mongoose.model('Guest', guestSchema);


