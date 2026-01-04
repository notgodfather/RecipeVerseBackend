// backend/models/User.js - 🎉 FULLY FIXED: No index warnings + production-ready
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // 👤 Basic Info - unique: true creates indexes automatically
  username: { 
    type: String, 
    required: [true, 'Username is required'],
    unique: true,  // ✅ Auto-index (no schema.index needed)
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters']
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    unique: true,  // ✅ Auto-index (no schema.index needed)
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: { 
    type: String, 
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false  // 🔑 Login uses .select('+password')
  },

  // 🌐 Profile
  avatar: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    maxlength: 500,
    default: ''
  },

  // 👥 Social
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // 📊 Stats
  recipesCount: {
    type: Number,
    default: 0
  },
  totalLikes: {
    type: Number,
    default: 0
  }

}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 🌟 Virtuals
userSchema.virtual('fullName').get(function() {
  return `${this.username}`;
});

// ✅ FIXED: Only compound indexes (no duplicates)
// unique: true already indexes username/email
userSchema.index({ followers: 1 });
userSchema.index({ following: 1 });

// 🔐 Pre-save: Auto-hash password
userSchema.pre('save', async function(next) {
  try {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// 🔐 Password methods
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model('User', userSchema);
