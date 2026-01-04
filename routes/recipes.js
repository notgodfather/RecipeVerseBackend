// backend/routes/recipes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Recipe = require('../models/Recipe');
const multer = require('multer'); // ← Required for file upload
const cloudinary = require('cloudinary').v2; // ← Cloudinary SDK
const { CloudinaryStorage } = require('multer-storage-cloudinary'); // ← Storage engine

// Configure Cloudinary (must be done once)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Multer to use Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'recipeverse', // All uploads go to this folder
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif'],
    transformation: [{ width: 1000, height: 1000, crop: 'limit' }], // Optional resize
  },
});

const upload = multer({ storage }); // ← Now upload is defined!

// GET ALL recipes (with optional search)
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;

    let query = {};
    if (search) {
      query = {
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { tags: { $in: [new RegExp(search, 'i')] } },
        ],
      };
    }

    const recipes = await Recipe.find(query)
      .populate('author', 'username')
      .sort({ createdAt: -1 });

    res.json(recipes);
  } catch (err) {
    console.error('Error fetching recipes:', err);
    res.status(500).json({ message: 'Server error while fetching recipes' });
  }
});

// GET single recipe by ID
router.get('/:id', async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id)
      .populate('author', 'username')
      .populate('comments.user', 'username');

    if (!recipe) return res.status(404).json({ message: 'Recipe not found' });

    res.json(recipe);
  } catch (err) {
    console.error('Error fetching single recipe:', err);
    res.status(500).json({ message: 'Server error while fetching recipe' });
  }
});

// POST - Create new recipe with image upload (protected)
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    const { title, description, ingredients, instructions, tags } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }

    let parsedIngredients = [];
    try {
      parsedIngredients = ingredients ? JSON.parse(ingredients) : [];
    } catch (e) {
      return res.status(400).json({ message: 'Invalid ingredients format' });
    }

    let parsedInstructions = [];
    try {
      parsedInstructions = instructions ? JSON.parse(instructions) : [];
    } catch (e) {
      return res.status(400).json({ message: 'Invalid instructions format' });
    }

    if (parsedIngredients.length === 0) {
      return res.status(400).json({ message: 'At least one ingredient is required' });
    }

    if (parsedInstructions.length === 0) {
      return res.status(400).json({ message: 'At least one instruction step is required' });
    }

    const recipeData = {
      title: title.trim(),
      description: description?.trim() || '',
      ingredients: parsedIngredients,
      instructions: parsedInstructions,
      tags: tags ? JSON.parse(tags) : [],
      author: req.user.id,
    };

    // Add image if uploaded
    if (req.file) {
      recipeData.image = req.file.path; // Cloudinary secure URL
    }

    const recipe = new Recipe(recipeData);
    await recipe.save();

    const populated = await Recipe.findById(recipe._id).populate('author', 'username');

    res.status(201).json(populated);
  } catch (err) {
    console.error('Create recipe error:', err.message, err.stack);
    res.status(400).json({ message: err.message || 'Failed to create recipe' });
  }
});

// LIKE / UNLIKE (protected)
router.post('/:id/like', auth, async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ success: false, message: 'Recipe not found' });

    const userId = req.user.id;
    const alreadyLiked = recipe.likes.includes(userId.toString());

    if (alreadyLiked) {
      recipe.likes = recipe.likes.filter((id) => id.toString() !== userId.toString());
    } else {
      recipe.likes.push(userId);
    }

    await recipe.save();

    res.json({
      success: true,
      likesCount: recipe.likes.length,
      liked: !alreadyLiked,
    });
  } catch (err) {
    console.error('Error liking/unliking recipe:', err.message, err.stack);
    res.status(500).json({ success: false, message: 'Server error while processing like' });
  }
});

// ADD COMMENT (protected)
router.post('/:id/comment', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, message: 'Comment text is required' });

    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ success: false, message: 'Recipe not found' });

    recipe.comments.push({
      user: req.user.id,
      text: text.trim(),
    });

    await recipe.save();

    // Return updated comments with populated user
    const updated = await Recipe.findById(req.params.id)
      .populate('comments.user', 'username');

    res.json({
      success: true,
      comments: updated.comments,
    });
  } catch (err) {
    console.error('Error adding comment:', err.message, err.stack);
    res.status(500).json({ success: false, message: 'Server error while adding comment' });
  }
});

// RATE (protected)
router.post('/:id/rate', auth, async (req, res) => {
  try {
    const { value } = req.body;
    if (!value || value < 1 || value > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ success: false, message: 'Recipe not found' });

    const userId = req.user.id;
    const existingRating = recipe.ratings.find((r) => r.user.toString() === userId.toString());

    if (existingRating) {
      existingRating.value = value; // Update existing rating
    } else {
      recipe.ratings.push({ user: userId, value }); // Add new rating
    }

    await recipe.save();

    const avgRating =
      recipe.ratings.reduce((sum, r) => sum + r.value, 0) / (recipe.ratings.length || 1);

    res.json({
      success: true,
      avgRating: avgRating.toFixed(1),
      ratingsCount: recipe.ratings.length,
    });
  } catch (err) {
    console.error('Error submitting rating:', err.message, err.stack);
    res.status(500).json({ success: false, message: 'Server error while submitting rating' });
  }
});

module.exports = router;