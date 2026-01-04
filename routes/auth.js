// backend/routes/auth.js - 🎉 FULLY FIXED PRODUCTION VERSION
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// ✅ POST /api/auth/register - FIXED: Let model handle hashing
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const cleanEmail = email?.toLowerCase().trim();
    const cleanUsername = username?.trim();

    // Input validation
    if (!cleanUsername || !cleanEmail || !password) {
      return res.status(400).json({ message: 'Username, email, and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    if (cleanUsername.length < 3) {
      return res.status(400).json({ message: 'Username must be at least 3 characters' });
    }

    // Check duplicates
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

    // ✅ FIXED: Plain password → model pre('save') auto-hashes
    const user = new User({ 
      username: cleanUsername,
      email: cleanEmail,
      password // Plaintext - model handles bcrypt.hash()
    });
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username }, 
      process.env.JWT_SECRET || 'fallback-secret-change-in-prod',
      { expiresIn: '7d' }
    );

    console.log('✅ REGISTER:', user.username);
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
      message: 'Registration failed' 
    });
  }
});

// 🔥 POST /api/auth/login - FIXED: .select('+password')
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = email?.toLowerCase().trim();

    console.log('📧 Login:', cleanEmail.substring(0, 10) + '...');

    if (!cleanEmail || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    // ✅ CRITICAL: .select('+password') to override schema select: false
    const user = await User.findOne({ email: cleanEmail }).select('+password');
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.password) {
      console.error('🚨 NO PASSWORD - ID:', user._id);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // 🔍 Debug (remove after working)
    console.log('🔍 Hash check:', {
      hasHash: user.password.length > 50,
      preview: user.password.substring(0, 20)
    });

    // ✅ Uses model method (consistent)
    const isMatch = await user.matchPassword(password);
    console.log('🔐 Result:', isMatch ? '✅ PASS' : '❌ FAIL');

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username }, 
      process.env.JWT_SECRET || 'fallback-secret-change-in-prod',
      { expiresIn: '7d' }
    );

    console.log('✅ LOGIN OK:', user.username);
    res.json({
      success: true,
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
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
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
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

module.exports = router;
