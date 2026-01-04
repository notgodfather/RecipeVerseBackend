// backend/models/User.js - FULL PRODUCTION-READY VERSION
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // 👤 Basic Info
  username: { 
    type: String, 
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters']
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: { 
    type: String, 
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't return in queries
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
  timestamps: true, // createdAt, updatedAt auto
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 🌟 Virtuals - Computed fields
userSchema.virtual('fullName').get(function() {
  return `${this.username}`;
});

// 📈 Index for performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ followers: 1 });
userSchema.index({ following: 1 });

// Pre-save middleware - Hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// 🔐 Compare password method
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// 💾 JSON output - Exclude password
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model('User', userSchema);
