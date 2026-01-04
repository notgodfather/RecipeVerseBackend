// backend/routes/users.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // ← Add this import!
const User = require('../models/User');
const Recipe = require('../models/Recipe');

// GET user profile + their recipes (public)
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const recipes = await Recipe.find({ author: req.params.id })
      .sort({ createdAt: -1 })
      .populate('author', 'username');

    res.json({ user, recipes });
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET current user's own profile (protected - /api/users/me)
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
  } catch (err) {
    console.error('Error fetching own profile:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;