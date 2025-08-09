// Authentication middleware
const session = require('express-session');

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

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.userId && req.session.role === 'admin') {
    return next();
  } else {
    return res.status(403).json({ error: 'Admin access required' });
  }
};

// Middleware to check if user is admin or the user themselves
const requireAdminOrSelf = (req, res, next) => {
  if (req.session && req.session.userId) {
    const targetUserId = parseInt(req.params.userId) || parseInt(req.body.userId);
    if (req.session.role === 'admin' || req.session.userId === targetUserId) {
      return next();
    }
  }
  return res.status(403).json({ error: 'Access denied' });
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
