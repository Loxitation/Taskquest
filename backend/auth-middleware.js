// Authentication middleware
const session = require('express-session');
const { getUserById } = require('./auth.db.js');

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'taskquest-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  } else {
    return res.status(401).json({ error: 'Authentication required' });
  }
};

// Middleware to check if user is admin (checks database for current role)
const requireAdmin = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Check database for current role to handle role changes
  getUserById(req.session.userId, (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    if (user.role === 'admin') {
      // Update session with current role for consistency
      req.session.role = user.role;
      return next();
    } else {
      return res.status(403).json({ error: 'Admin access required' });
    }
  });
};

// Middleware to check if user is admin or the user themselves
const requireAdminOrSelf = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const targetUserId = parseInt(req.params.userId) || parseInt(req.body.userId);
  
  // Check database for current role to handle role changes
  getUserById(req.session.userId, (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Update session with current role for consistency
    req.session.role = user.role;
    
    if (user.role === 'admin' || req.session.userId === targetUserId) {
      return next();
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }
  });
};

// Get current user info from session
const getCurrentUser = (req) => {
  if (req.session && req.session.userId) {
    return {
      id: req.session.userId,
      username: req.session.username,
      role: req.session.role
    };
  }
  return null;
};

module.exports = {
  sessionConfig,
  requireAuth,
  requireAdmin,
  requireAdminOrSelf,
  getCurrentUser
};
