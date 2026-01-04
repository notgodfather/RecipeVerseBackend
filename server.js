// backend/server.js - Production-Ready RecipeVerse API v2.1
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const path = require('path');

// Graceful initialization
let app;

const initServer = async () => {
  try {
    app = express();

    // 🔥 TRUST PROXY (Render/Vercel/Production)
    app.set('trust proxy', 1);

    // 🛡️ SECURITY HEADERS (Enhanced)
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", process.env.FRONTEND_URL]
        }
      }
    }));

    // 📦 GZIP Compression
    app.use(compression());

    // 🔐 Cookie Parser
    app.use(cookieParser());

    // 🌐 CORS (Production + Development)
    const allowedOrigins = [
      'https://recipe-verse.vercel.app',
      'https://recipeverse.netlify.app',
      ...(process.env.NODE_ENV !== 'production' ? 
        ['http://localhost:5173', 'http://localhost:3000'] : [])
    ];

    app.use(cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // 🚦 RATE LIMITING (Tiered)
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 200, // 200 requests per IP
      message: { error: 'Too many requests from this IP' },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.ip === '127.0.0.1' // Skip localhost
    });

    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10, // Strict auth limits
      message: { error: 'Too many auth attempts' }
    });

    const recipeLimiter = rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5, // 5 recipes per hour
      message: { error: 'Too many recipe creations' }
    });

    // 🧹 BODY PARSING (Large files supported)
    app.use(express.json({ 
      limit: '10mb',
      verify: (req, res, buf) => {
        try { JSON.parse(buf); } catch { /* Pass */ }
      }
    }));
    app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb' 
    }));

    // 🛡️ SECURITY MIDDLEWARE
    app.use(mongoSanitize()); // NoSQL injection
    app.use(xss()); // XSS protection
    app.use(hpp()); // Parameter pollution

    // 📊 LOGGING
    if (process.env.NODE_ENV !== 'production') {
      app.use(morgan('dev', {
        skip: (req) => req.url === '/api/health'
      }));
    } else {
      app.use(morgan('combined', {
        stream: { write: msg => console.log(`[${new Date().toISOString()}] ${msg.trim()}`) }
      }));
    }

    // 🔌 MONGODB (Enhanced connection)
    mongoose.set('strictQuery', false); // Modern default
    mongoose.set('bufferCommands', false);

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI not set in environment');
    }

   const mongooseOptions = {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  w: 'majority',
  wtimeoutMS: 10000,
  bufferCommands: false,  // ✅ Modern
  family: 4  // IPv4 only
};


    await mongoose.connect(mongoUri, mongooseOptions);
    console.log('✅ MongoDB Connected');

    // 📂 STATIC FILES (Production)
    if (process.env.NODE_ENV === 'production') {
      app.use(express.static(path.join(__dirname, '../frontend/dist')));
      app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
      });
    }

    // 🚀 ROUTES (Protected with rate limits)
    app.use('/api/auth', authLimiter, require('./routes/auth'));
    app.use('/api/recipes', apiLimiter, recipeLimiter, require('./routes/recipes'));
    app.use('/api/users', apiLimiter, require('./routes/users'));

    // 🩺 COMPREHENSIVE HEALTH CHECK
    app.get('/api/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        uptime: Math.floor(process.uptime()),
        memory: {
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
          heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
        },
        version: '2.1.0',
        endpoints: {
          health: '/api/health',
          recipes: '/api/recipes',
          auth: '/api/auth/login'
        }
      });
    });

    // 📱 API ROOT
    app.get('/api', (req, res) => {
      res.json({
        message: '🍲 RecipeVerse API v2.1 - Production Ready',
        version: '2.1.0',
        documentation: 'https://recipeverse.docs',
        endpoints: {
          health: 'GET /api/health',
          recipes: 'GET/POST /api/recipes',
          auth: 'POST /api/auth/register, /api/auth/login',
          users: 'GET /api/users/:id'
        },
        status: '🟢 LIVE'
      });
    });

    // 🏠 PUBLIC ROOT
    app.get('/', (req, res) => {
      res.redirect('/api');
    });

    // 🚫 404 HANDLER
    app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method,
        suggestions: [
          '/api/recipes',
          '/api/auth/login',
          '/api/health'
        ]
      });
    });

    // 💥 GLOBAL ERROR HANDLER (Enhanced)
    app.use((err, req, res, next) => {
      console.error('🚨 GLOBAL ERROR:', {
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip
      });

      // Multer errors
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
          error: 'File too large', 
          maxSize: '5MB' 
        });
      }

      // Rate limit
      if (err.status === 429) {
        return res.status(429).json(err.message);
      }

      // MongoDB validation
      if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map(e => e.message);
        return res.status(400).json({ 
          error: 'Validation failed',
          details: errors 
        });
      }

      // Generic response
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'production' 
          ? 'Something went wrong. Please try again.' 
          : err.message
      });
    });

    // 🚀 START SERVER
    const PORT = process.env.PORT || 5000;
    const HOST = process.env.HOST || '0.0.0.0';

    const server = app.listen(PORT, HOST, () => {
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
        : `http://localhost:${PORT}`;
      
      console.log('\n🚀 RecipeVerse API v2.1 LIVE!');
      console.log(`📍 Port: ${PORT} | Host: ${HOST}`);
      console.log(`🌐 Base URL: ${baseUrl}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Frontend: ${process.env.FRONTEND_URL || 'localhost:5173'}`);
      console.log('\n🧪 Test endpoints:');
      console.log('   GET  /api/health');
      console.log('   GET  /api/recipes');
      console.log('   POST /api/auth/login');
      console.log('\n✅ Ready for production!');
    });

    return server;
  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
};

// 🛑 GRACEFUL SHUTDOWN (Production Ready)
const gracefulShutdown = async (signal) => {
  console.log(`🛑 Graceful shutdown initiated... (${signal})`);
  
  if (app) {
    const closePromises = [];
    
    // Close MongoDB
    if (mongoose.connection.readyState === 1) {
      closePromises.push(mongoose.connection.close());
    }
    
    // Wait for all connections to close
    await Promise.all(closePromises);
    console.log('✅ All connections closed');
  }
  
  process.exit(0);
};

// Handle all termination signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('SIGQUIT', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// 🔥 START SERVER
const server = initServer();

module.exports = server;
