// backend/middleware/auth.js - FULL PRODUCTION-READY VERSION
const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  try {
    // 🔍 Extract token from Authorization header OR cookie
    let token = req.header('Authorization')?.replace('Bearer ', '');
    
    // Fallback: Check cookie (if using httpOnly cookies)
    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }

    // 🚫 No token → 401
    if (!token) {
      return res.status(401).json({ 
        message: 'No token provided, authorization denied' 
      });
    }

    // 🔓 Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 👤 Fetch fresh user (not just token data)
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ 
        message: 'User not found - token invalid' 
      });
    }

    // ✅ Attach user to request
    req.user = {
      id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    
    // 📄 Specific error messages
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token format' });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired - please login again' });
    }
    
    res.status(401).json({ message: 'Token invalid or expired' });
  }
};
