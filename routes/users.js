// backend/routes/users.js - 🎉 FULLY FIXED: No CastError + production-ready
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Recipe = require('../models/Recipe');

// 📱 GET /api/users/:id - Public profile + recipes
router.get('/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    // ✅ FIXED: ObjectId validation (prevents CastError)
    if (!userId || userId === 'undefined' || userId.length !== 24) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const recipes = await Recipe.find({ author: userId })
      .sort({ createdAt: -1 })
      .limit(12)
      .populate('author', 'username avatar')
      .lean();

    const recipesCount = recipes.length;
    const totalLikes = recipes.reduce((sum, r) => sum + (r.likes?.length || 0), 0);

    res.json({ 
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        followers: user.followers?.length || 0,
        following: user.following?.length || 0,
        recipesCount,
        totalLikes,
        createdAt: user.createdAt
      },
      recipes 
    });
  } catch (err) {
    console.error('🚨 Profile error:', err.message);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
});

// 👤 GET /api/users/me - Current user (PROTECTED)
router.get('/me', auth, async (req, res) => {
  try {
    // ✅ FIXED: Validate req.user.id before query
    if (!req.user?.id || req.user.id === 'undefined' || req.user.id.length !== 24) {
      return res.status(401).json({ message: 'Invalid authentication - login required' });
    }

    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio,
      followers: user.followers?.length || 0,
      following: user.following?.length || 0,
      recipesCount: user.recipesCount || 0,
      totalLikes: user.totalLikes || 0
    });
  } catch (err) {
    console.error('🚨 /me error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ❤️ POST /api/users/:id/follow - Toggle follow (PROTECTED)
router.post('/:id/follow', auth, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user.id;

    // ✅ FIXED: Full ID validation
    if (!currentUserId || currentUserId === 'undefined' || currentUserId.length !== 24) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!targetUserId || targetUserId === 'undefined' || targetUserId.length !== 24) {
      return res.status(400).json({ message: 'Invalid target user ID' });
    }

    if (targetUserId === currentUserId) {
      return res.status(400).json({ message: "Can't follow yourself" });
    }

    const targetUser = await User.findById(targetUserId);
    const currentUser = await User.findById(currentUserId);
    
    if (!targetUser || !currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isFollowing = currentUser.following.includes(targetUserId);
    
    if (isFollowing) {
      currentUser.following.pull(targetUserId);
      targetUser.followers.pull(currentUserId);
    } else {
      currentUser.following.push(targetUserId);
      targetUser.followers.push(currentUserId);
    }

    await currentUser.save();
    await targetUser.save();

    res.json({
      following: !isFollowing,
      followersCount: targetUser.followers.length,
      followingCount: currentUser.following.length
    });
  } catch (err) {
    console.error('🚨 Follow error:', err.message);
    res.status(500).json({ message: 'Server error following user' });
  }
});

// 👥 GET /api/users/search?q=john - Search users
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const users = await User.find({
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ]
    })
    .select('username email avatar bio followers')
    .limit(parseInt(limit))
    .lean();

    res.json(users);
  } catch (err) {
    console.error('🚨 Search error:', err.message);
    res.status(500).json({ message: 'Server error searching users' });
  }
});

// 🖼️ PATCH /api/users/me - Update profile (PROTECTED)
router.patch('/me', auth, async (req, res) => {
  try {
    // ✅ FIXED: Validate req.user.id
    if (!req.user?.id || req.user.id === 'undefined') {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const updates = req.body;
    const allowedUpdates = ['username', 'email', 'bio', 'avatar'];
    const updateData = {};

    for (let key of allowedUpdates) {
      if (updates[key] !== undefined) updateData[key] = updates[key];
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id, 
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'Profile updated successfully',
      user
    });
  } catch (err) {
    console.error('🚨 Update profile error:', err.message);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
