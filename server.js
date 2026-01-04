// backend/server.js - ✅ FIXED mongoose + rate-limit warnings
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// 🔥 FIX 1: Rate limit proxy (Render)
app.set('trust proxy', 1);  // ✅ Fixes X-Forwarded-For warning

// 🛡️ Security
app.use(helmet());
app.use(cookieParser());

// 🌐 CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL || 'https://recipe-verse.vercel.app']
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 📊 Rate limiting (now proxy-safe)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', limiter);

// 🧹 Parsing
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// 📈 Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// 🔌 MongoDB
mongoose.set('strictQuery', true);
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
    console.error('❌ MongoDB Error:', err);
    process.exit(1);
  });

// 🚀 ROUTES
app.use('/api/auth', require('./routes/auth'));
app.use('/api/recipes', require('./routes/recipes'));
app.use('/api/users', require('./routes/users'));

// 🩺 Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// 📱 Root
app.get('/', (req, res) => {
  res.json({
    message: '🍲 RecipeVerse API v2.0 ✅',
    endpoints: {
      auth: 'POST /api/auth/register, /api/auth/login',
      recipes: 'GET/POST /api/recipes',
      users: 'GET /api/users/:id'
    },
    health: '/api/health'
  });
});

// 🚫 404
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    try: ['/api/recipes', '/api/auth/login']
  });
});

// 💥 Error Handler
app.use((err, req, res, next) => {
  console.error('🚨 ERROR:', err.stack);
  res.status(500).json({ 
    error: 'Server error',
    message: process.env.NODE_ENV === 'production' ? 'Try again later' : err.message
  });
});

// 🛑 Graceful Shutdown - FIX 2: Mongoose 8+ (no callback)
const gracefulShutdown = async (signal) => {
  console.log(`🛑 Shutting down... (${signal})`);
  await mongoose.connection.close();  // ✅ Promise - no callback
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);  // Local Ctrl+C

// 🚀 Launch
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 RecipeVerse LIVE on port ${PORT}`);
  console.log(`📍 ${process.env.NODE_ENV || 'dev'}`);
  console.log(`🌐 ${process.env.FRONTEND_URL || 'localhost:5173'}`);
  console.log(`🧪 Test: /api/health`);
  console.log(`🔐 Login: POST /api/auth/login`);
});

module.exports = app;
