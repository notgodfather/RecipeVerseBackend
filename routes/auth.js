// backend/routes/auth.js - ✅ bcrypt CRASH FIXED + PRODUCTION READY
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// ✅ POST /api/auth/register (UNCHANGED)
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const cleanEmail = email?.toLowerCase().trim();
    const cleanUsername = username?.trim();

    if (!cleanUsername || !cleanEmail || !password) {
      return res.status(400).json({ message: 'Username, email, and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    if (cleanUsername.length < 3) {
      return res.status(400).json({ message: 'Username must be at least 3 characters' });
    }

    const existingUser = await User.findOne({ 
      $or: [{ email: cleanEmail }, { username: cleanUsername }] 
    });
    if (existingUser) {
      return res.status(409).json({ 
        message: existingUser.email === cleanEmail 
          ? 'Email already registered' 
          : 'Username already taken'
      });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({ 
      username: cleanUsername,
      email: cleanEmail,
      password: hashedPassword 
    });
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username }, 
      process.env.JWT_SECRET || 'fallback-secret-change-in-prod',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: { 
        id: user._id, 
        username: user.username, 
        email: user.email,
        createdAt: user.createdAt 
      }
    });
  } catch (err) {
    console.error('🚨 Register error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Registration failed - server error' 
    });
  }
});

// 🔥 FIXED POST /api/auth/login - bcrypt SAFE
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = email?.toLowerCase().trim();

    if (!cleanEmail || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // ✅ CRITICAL FIX: Password existence check → NO MORE 500 CRASH
    if (!user.password) {
      console.error('🚨 MISSING PASSWORD - User ID:', user._id);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username }, 
      process.env.JWT_SECRET || 'fallback-secret-change-in-prod',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: { 
        id: user._id,
        username: user.username, 
        email: user.email,
        avatar: user.avatar
      }
    });
  } catch (err) {
    console.error('🚨 Login error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed - server error' 
    });
  }
});

// ✅ GET /api/auth/me (UNCHANGED)
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        followers: user.followers?.length || 0,
        following: user.following?.length || 0
      }
    });
  } catch (err) {
    console.error('🚨 /me error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ POST /api/auth/logout (UNCHANGED)
router.post('/logout', (req, res) => {
  res.json({ 
    success: true,
    message: 'Logged out successfully - clear token on frontend' 
  });
});

module.exports = router;
