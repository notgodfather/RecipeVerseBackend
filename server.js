// backend/server.js - FULLY PRODUCTION-READY + PERFECT ROUTING
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan'); // Logging
const helmet = require('helmet');  // Security
const rateLimit = require('express-rate-limit'); // DDoS protection

const app = express();

// 🔥 SECURITY MIDDLEWARE (Production Essential)
app.use(helmet()); // Headers security

// 🌐 CORS - Dynamic for dev/prod
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL || 'https://recipe-versemongodb.vercel.app']
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 📊 Rate limiting - Prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per IP
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', limiter);

// 🧹 Body parsing - Images + JSON
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// 📈 Logging (dev only)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// 🔌 MongoDB - Production optimized
mongoose.set('strictQuery', true);
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// 🚀 ROUTES - PERFECT MOUNTING ORDER
app.use('/api/auth', require('./routes/auth'));      // POST /api/auth/login ✅
app.use('/api/recipes', require('./routes/recipes')); // GET /api/recipes
app.use('/api/users', require('./routes/users'));     // GET /api/users/:id

// 🩺 Health check - Render monitoring
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    routes: ['/api/auth/login', '/api/recipes', '/api/users']
  });
});

// 📱 Root - API docs
app.get('/', (req, res) => {
  res.json({
    message: '🍲 RecipeVerse Backend API v2.0',
    status: '🚀 Live & Ready',
    endpoints: {
      auth: ['POST /api/auth/register', 'POST /api/auth/login'],
      recipes: ['GET /api/recipes', 'POST /api/recipes'],
      users: ['GET /api/users/:id']
    },
    frontend: process.env.FRONTEND_URL || 'https://recipe-versemongodb.vercel.app',
    docs: 'All routes working - check /api/health'
  });
});

// 🚫 404 Handler - Clear error messages
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found 😅',
    path: req.originalUrl,
    suggestion: 'Try /api/recipes or /api/auth/login',
    available: ['/api/recipes', '/api/auth/register', '/api/auth/login']
  });
});

// 💥 Global Error Handler
app.use((err, req, res, next) => {
  console.error('🚨 SERVER ERROR:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    url: req.originalUrl,
    method: req.method
  });

  res.status(err.status || 500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong. Please try again.' 
      : err.message
  });
});

// 🎯 Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  mongoose.connection.close(() => {
    console.log('MongoDB disconnected');
    process.exit(0);
  });
});

// 🚀 Start Server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 RecipeVerse Backend v2.0 LIVE on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 CORS: ${process.env.FRONTEND_URL || 'localhost:5173'}`);
  console.log(`🗄️ MongoDB: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Connecting...'}`);
  console.log(`🔗 Test: https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:' + PORT}/api/health`);
  console.log(`📱 Login: POST /api/auth/login`);
});

// Export for testing
module.exports = server;
