// backend/routes/users.js - FULL PRODUCTION VERSION + FOLLOW SYSTEM
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Recipe = require('../models/Recipe');

// 📱 GET /api/users/:id - Public profile + recipes
router.get('/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    // 👤 Fetch user (no password)
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 🍲 Fetch their recipes (recent first)
    const recipes = await Recipe.find({ author: userId })
      .sort({ createdAt: -1 })
      .limit(12)
      .populate('author', 'username avatar')
      .lean();

    // 📊 Calculate stats
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
    console.error('Profile error:', err);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
});

// 👤 GET /api/users/me - Current user (protected)
router.get('/me', auth, async (req, res) => {
  try {
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
      following: user.following?.length || 0
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ❤️ POST /api/users/:id/follow - Toggle follow (protected)
router.post('/:id/follow', auth, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user.id;

    // Can't follow self
    if (targetUserId === currentUserId) {
      return res.status(400).json({ message: "Can't follow yourself" });
    }

    const targetUser = await User.findById(targetUserId);
    const currentUser = await User.findById(currentUserId);
    
    if (!targetUser || !currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Toggle follow
    const isFollowing = currentUser.following.includes(targetUserId);
    
    if (isFollowing) {
      // Unfollow
      currentUser.following.pull(targetUserId);
      targetUser.followers.pull(currentUserId);
    } else {
      // Follow
      currentUser.following.push(targetUserId);
      targetUser.followers.push(currentUserId);
    }

    await currentUser.save();
    await targetUser.save();

    res.json({
      following: !isFollowing,
      followersCount: targetUser.followers.length
    });
  } catch (err) {
    console.error('Follow error:', err);
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
    console.error('Search error:', err);
    res.status(500).json({ message: 'Server error searching users' });
  }
});

// 🖼️ PATCH /api/users/me - Update profile (protected)
router.patch('/me', auth, async (req, res) => {
  try {
    const updates = req.body;
    
    // Sanitize updates
    const allowedUpdates = ['username', 'email', 'bio', 'avatar'];
    const updateData = {};
    
    for (let key of allowedUpdates) {
      if (updates[key] !== undefined) updateData[key] = updates[key];
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
    console.error('Update profile error:', err);
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
