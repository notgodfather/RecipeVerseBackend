// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || 'https://your-deployed-frontend.com'
    : 'http://localhost:5173', // Allow Vite dev server in development
  credentials: true, // If you use cookies/sessions later
}));

app.use(express.json());

// MongoDB connection with modern options & better error handling
mongoose.connect(process.env.MONGO_URI, {
  // These options are still useful in Mongoose 8.x for stability
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('MongoDB connected successfully');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    // In production, you might want to retry or exit gracefully
    // For dev, just log and continue
  });

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/recipes', require('./routes/recipes'));
app.use('/api/users', require('./routes/users')); // ← Added for profile support

// Root route for testing (JSON response)
app.get('/', (req, res) => {
  res.json({
    message: 'RecipeVerse Backend is running!',
    status: 'online',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler for unmatched routes (API-friendly)
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    message: 'Route not found',
    path: req.originalUrl 
  });
});

// Global error handler (catches all unhandled errors)
app.use((err, req, res, next) => {
  console.error('Global server error:', err.stack || err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: status === 500 ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`CORS allowed origin: ${process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : 'http://localhost:5173'}`);
});