// backend/routes/recipes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Recipe = require('../models/Recipe');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Enhanced Cloudinary storage with better params
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isValidFormat = ['jpg', 'jpeg', 'png', 'webp'].includes(file.mimetype.split('/')[1]);
    if (!isValidFormat) {
      throw new Error('Invalid image format');
    }

    return {
      folder: 'recipeverse/recipes',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      public_id: `recipe_${Date.now()}_${Math.round(Math.random() * 1e9)}`,
      transformation: [
        { width: 1200, height: 800, crop: 'fill', quality: 'auto' },
        { width: 400, height: 267, crop: 'fill', quality: 'auto' }
      ],
    };
  },
});

// File size limit: 5MB
const fileFilter = (req, file, cb) => {
  if (file.size > 5 * 1024 * 1024) {
    return cb(new Error('File size too large. Maximum 5MB allowed.'), false);
  }
  cb(null, true);
};

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter 
});

// Rate limiting middleware for POST endpoints
const rateLimit = require('express-rate-limit');
const createRecipeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 recipes per 15 minutes
  message: { error: 'Too many recipe creation attempts, please try again later.' }
});

// Validation middleware
const validateRecipeData = (req, res, next) => {
  try {
    const { title, ingredients, instructions, tags } = req.body;
    
    if (!title?.trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }
    if (title.trim().length < 3 || title.trim().length > 100) {
      return res.status(400).json({ message: 'Title must be 3-100 characters' });
    }

    const parsedIngredients = JSON.parse(ingredients || '[]');
    if (!Array.isArray(parsedIngredients) || parsedIngredients.length === 0) {
      return res.status(400).json({ message: 'At least one ingredient is required' });
    }
    if (parsedIngredients.length > 20) {
      return res.status(400).json({ message: 'Maximum 20 ingredients allowed' });
    }
    parsedIngredients.forEach((ing, i) => {
      if (!ing?.trim() || ing.trim().length > 150) {
        throw new Error(`Ingredient ${i + 1} invalid`);
      }
    });

    const parsedInstructions = JSON.parse(instructions || '[]');
    if (!Array.isArray(parsedInstructions) || parsedInstructions.length === 0) {
      return res.status(400).json({ message: 'At least one instruction step is required' });
    }
    if (parsedInstructions.length > 15) {
      return res.status(400).json({ message: 'Maximum 15 instruction steps allowed' });
    }
    parsedInstructions.forEach((step, i) => {
      if (!step?.trim() || step.trim().length > 300) {
        throw new Error(`Instruction step ${i + 1} invalid`);
      }
    });

    let parsedTags = [];
    if (tags) {
      parsedTags = JSON.parse(tags);
      if (!Array.isArray(parsedTags)) {
        return res.status(400).json({ message: 'Tags must be an array' });
      }
      parsedTags = parsedTags.map(tag => tag.trim().toLowerCase()).filter(Boolean);
      if (parsedTags.length > 10) {
        parsedTags = parsedTags.slice(0, 10);
      }
      parsedTags = [...new Set(parsedTags)]; // Remove duplicates
    }

    req.validatedData = {
      title: title.trim(),
      description: req.body.description?.trim() || '',
      ingredients: parsedIngredients.map(ing => ing.trim()),
      instructions: parsedInstructions.map(step => step.trim()),
      tags: parsedTags
    };

    next();
  } catch (error) {
    res.status(400).json({ message: error.message || 'Invalid recipe data format' });
  }
};

// GET ALL recipes - Enhanced search and pagination
router.get('/', async (req, res) => {
  try {
    const { 
      search, 
      tag, 
      page = 1, 
      limit = 12, 
      sort = 'createdAt',
      order = 'desc'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    let query = {};

    // Multi-field search
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Tag filter
    if (tag) {
      query.tags = { $in: [tag.toLowerCase()] };
    }

    // Build sort object
    const sortObj = {};
    sortObj[sort === 'rating' ? 'avgRating' : sort] = order === 'asc' ? 1 : -1;

    const recipes = await Recipe.aggregate([
      { $match: query },
      {
        $addFields: {
          avgRating: {
            $divide: [
              { $sum: '$ratings.value' },
              { $cond: [{ $gt: [{ $size: '$ratings' }, 0] }, { $size: '$ratings' }, 1] }
            ]
          }
        }
      },
      { $sort: sortObj },
      { $skip: skip },
      { $limit: limitNum },
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'author',
          pipeline: [{ $project: { username: 1, avatar: 1 } }]
        }
      },
      { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          author: { $ifNull: ['$author', { username: 'Unknown' }] },
          title: 1,
          description: 1,
          image: 1,
          tags: 1,
          avgRating: { $round: ['$avgRating', 1] },
          ratingsCount: { $size: '$ratings' },
          likesCount: { $size: '$likes' },
          commentsCount: { $size: '$comments' },
          createdAt: 1,
          updatedAt: 1
        }
      }
    ]);

    // Get total count for pagination
    const total = await Recipe.countDocuments(query);

    res.json({
      recipes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
        hasNext: pageNum * limitNum < total,
        hasPrev: pageNum > 1
      }
    });
  } catch (err) {
    console.error('Error fetching recipes:', err);
    res.status(500).json({ message: 'Server error while fetching recipes' });
  }
});

// GET single recipe by ID - Enhanced
router.get('/:id', async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    // Calculate average rating
    const avgRating = recipe.ratings.reduce((sum, r) => sum + r.value, 0) / 
                     (recipe.ratings.length || 1);

    const result = {
      ...recipe.toObject(),
      avgRating: parseFloat(avgRating.toFixed(1)),
      ratingsCount: recipe.ratings.length
    };

    // Populate author and recent comments
    await recipe.populate([
      { path: 'author', select: 'username avatar' },
      { 
        path: 'comments', 
        populate: { path: 'user', select: 'username avatar' },
        options: { limit: 10, sort: { createdAt: -1 } }
      }
    ]);

    res.json(result);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid recipe ID' });
    }
    console.error('Error fetching recipe:', err);
    res.status(500).json({ message: 'Server error while fetching recipe' });
  }
});

// POST - Create new recipe (Enhanced)
router.post('/', auth, createRecipeLimiter, upload.single('image'), validateRecipeData, async (req, res) => {
  try {
    const recipeData = {
      ...req.validatedData,
      author: req.user.id,
    };

    // Add image URL if uploaded
    if (req.file) {
      recipeData.image = req.file.path;
    }

    const recipe = new Recipe(recipeData);
    await recipe.save();

    const populated = await Recipe.findById(recipe._id)
      .populate('author', 'username avatar')
      .lean();

    res.status(201).json({
      success: true,
      recipe: populated,
      message: 'Recipe created successfully!'
    });
  } catch (err) {
    console.error('Create recipe error:', err);
    
    // Handle Cloudinary errors
    if (req.file && cloudinary.uploader.destroy) {
      const publicId = req.file.filename;
      await cloudinary.uploader.destroy(publicId).catch(console.error);
    }
    
    res.status(500).json({ message: 'Failed to create recipe' });
  }
});

// PUT - Update recipe (protected)
router.put('/:id', auth, upload.single('image'), validateRecipeData, async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    if (recipe.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to edit this recipe' });
    }

    // Update with validated data
    Object.assign(recipe, req.validatedData);

    // Handle image update
    if (req.file) {
      // Delete old image if exists
      if (recipe.image && cloudinary.uploader.destroy) {
        const publicId = recipe.image.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(publicId).catch(console.error);
      }
      recipe.image = req.file.path;
    }

    await recipe.save();

    const populated = await Recipe.findById(recipe._id)
      .populate('author', 'username avatar')
      .lean();

    res.json({
      success: true,
      recipe: populated,
      message: 'Recipe updated successfully!'
    });
  } catch (err) {
    console.error('Update recipe error:', err);
    res.status(500).json({ message: 'Failed to update recipe' });
  }
});

// DELETE - Delete recipe (protected)
router.delete('/:id', auth, async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    if (recipe.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this recipe' });
    }

    // Delete image from Cloudinary
    if (recipe.image && cloudinary.uploader.destroy) {
      const publicId = recipe.image.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(publicId).catch(console.error);
    }

    await Recipe.findByIdAndDelete(req.params.id);

    res.json({ 
      success: true, 
      message: 'Recipe deleted successfully!' 
    });
  } catch (err) {
    console.error('Delete recipe error:', err);
    res.status(500).json({ message: 'Failed to delete recipe' });
  }
});

// LIKE / UNLIKE (enhanced)
router.post('/:id/like', auth, async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ success: false, message: 'Recipe not found' });
    }

    const userId = req.user.id.toString();
    const userIndex = recipe.likes.findIndex(like => like.toString() === userId);

    let liked;
    if (userIndex > -1) {
      recipe.likes.splice(userIndex, 1);
      liked = false;
    } else {
      recipe.likes.push(req.user.id);
      liked = true;
    }

    await recipe.save();

    res.json({
      success: true,
      likesCount: recipe.likes.length,
      liked,
    });
  } catch (err) {
    console.error('Like error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ADD COMMENT (enhanced)
router.post('/:id/comment', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim() || text.trim().length > 500) {
      return res.status(400).json({ success: false, message: 'Comment must be 1-500 characters' });
    }

    const recipe = await Recipe.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          comments: {
            user: req.user.id,
            text: text.trim(),
          }
        }
      },
      { new: true }
    );

    if (!recipe) {
      return res.status(404).json({ success: false, message: 'Recipe not found' });
    }

    const populated = await Recipe.findById(recipe._id)
      .select('comments')
      .populate('comments.user', 'username avatar')
      .lean();

    res.json({
      success: true,
      comments: populated.comments,
      commentsCount: recipe.comments.length
    });
  } catch (err) {
    console.error('Comment error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE COMMENT (protected)
router.delete('/:id/comment/:commentId', auth, async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const recipe = await Recipe.findById(id);
    
    if (!recipe) {
      return res.status(404).json({ success: false, message: 'Recipe not found' });
    }

    const comment = recipe.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    // Only author or comment owner can delete
    if (comment.user.toString() !== req.user.id && recipe.author.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    comment.remove();
    await recipe.save();

    res.json({ success: true, message: 'Comment deleted' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// RATE (enhanced)
router.post('/:id/rate', auth, async (req, res) => {
  try {
    const { value } = req.body;
    const ratingValue = parseInt(value);
    
    if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return res.status(400).json({ 
        success: false, 
        message: 'Rating must be a number between 1 and 5' 
      });
    }

    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ success: false, message: 'Recipe not found' });
    }

    const userId = req.user.id.toString();
    const existingRatingIndex = recipe.ratings.findIndex(r => r.user.toString() === userId);

    if (existingRatingIndex > -1) {
      recipe.ratings[existingRatingIndex].value = ratingValue;
    } else {
      recipe.ratings.push({ user: req.user.id, value: ratingValue });
    }

    await recipe.save();

    const avgRating = recipe.ratings.reduce((sum, r) => sum + r.value, 0) / 
                     (recipe.ratings.length || 1);

    res.json({
      success: true,
      avgRating: parseFloat(avgRating.toFixed(1)),
      ratingsCount: recipe.ratings.length,
      userRated: true
    });
  } catch (err) {
    console.error('Rating error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
