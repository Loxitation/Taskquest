const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const http = require('http');
const session = require('express-session');
const { Server } = require('socket.io');
const { sendGotify, getGotifyTargetForUser } = require('./gotify');
const { tasksDb, createTasksTable } = require('./tasks.db.js');
const sqlite3 = require('sqlite3').verbose();

// Initialize notifications database
const notificationsDb = new sqlite3.Database(path.join(__dirname, 'notifications.db'), (err) => {
  if (err) throw err;
  console.log('Connected to notifications.db (SQLite)');
});

// Initialize rewards database
const rewardsDb = new sqlite3.Database(path.join(__dirname, 'rewards.db'), (err) => {
  if (err) throw err;
  console.log('Connected to rewards.db (SQLite)');
});

// Create notifications table
const createNotificationsTable = () => {
  notificationsDb.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId INTEGER,
    player TEXT,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
};

const { 
  authDb, 
  createUsersTable, 
  createAdminConfigTable, 
  initializeDefaults,
  verifyPassword,
  getUserByUsername,
  getUserById,
  updateUserProfile,
  updateUserPassword,
  getAdminConfig,
  updateAdminConfig,
  getAllUsers,
  createUser,
  deleteUser,
  updatePlayerStats,
  getPlayerStats,
  getAllPlayerStats,
  updateLastLogin,
  syncUserDatabases
} = require('./auth.db.js');
const { 
  sessionConfig, 
  requireAuth, 
  requireAdmin, 
  requireAdminOrSelf,
  getCurrentUser 
} = require('./auth-middleware.js');

const app = express();
const PORT = 3578;

app.use(cors({
  origin: 'http://localhost:3578',
  credentials: true
}));
app.use(bodyParser.json());
app.use(session(sessionConfig));
app.use(express.static(path.join(__dirname, '../frontend')));

// --- SOCKET.IO SETUP ---
const server = http.createServer(app);
const io = new Server(server);

// Initialize DB tables
createNotificationsTable();
createTasksTable();

// Initialize auth tables and defaults asynchronously
(async () => {
  try {
    console.log('Starting authentication system initialization...');
    await createUsersTable();
    console.log('Users table created successfully');
    await createAdminConfigTable();
    console.log('Admin config table created successfully');
    await initializeDefaults();
    console.log('Authentication system initialized successfully');
    
    // Sync user databases to ensure consistency
    setTimeout(() => {
      console.log('Starting user database sync...');
      syncUserDatabases();
      console.log('User database sync completed');
    }, 1000); // Wait a bit for database connections to be ready
  } catch (error) {
    console.error('Error initializing authentication system:', error);
  }
})();

function emitDataChanged() {
  io.emit('dataChanged');
}

// --- AUTHENTICATION ROUTES ---

// Login endpoint
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  getUserByUsername(username, async (err, user) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    try {
      const isValidPassword = await verifyPassword(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Update last login
      updateLastLogin(user.id, (err) => {
        if (err) console.error('Error updating last login:', err);
      });

      // Set session
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          profile_settings: user.profile_settings ? JSON.parse(user.profile_settings) : {}
        }
      });
    } catch (error) {
      console.error('Password verification error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.json({ success: true });
  });
});

// Get current user
app.get('/api/auth/me', requireAuth, (req, res) => {
  getUserById(req.session.userId, (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
      profile_settings: user.profile_settings ? JSON.parse(user.profile_settings) : {},
      gotify_url: user.gotify_url,
      gotify_token: user.gotify_token
    });
  });
});

// Update user profile
app.put('/api/auth/profile', requireAuth, (req, res) => {
  const { gotify_url, gotify_token, profile_settings } = req.body;
  
  updateUserProfile(req.session.userId, {
    gotify_url,
    gotify_token,
    profile_settings
  }, (err) => {
    if (err) {
      console.error('Profile update error:', err);
      return res.status(500).json({ error: 'Failed to update profile' });
    }
    res.json({ success: true });
  });
});

// Change password
app.put('/api/auth/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }

  getUserById(req.session.userId, async (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    try {
      const isValidPassword = await verifyPassword(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      updateUserPassword(req.session.userId, newPassword, (err) => {
        if (err) {
          console.error('Password update error:', err);
          return res.status(500).json({ error: 'Failed to update password' });
        }
        res.json({ success: true });
      });
    } catch (error) {
      console.error('Password verification error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// --- PUBLIC API ROUTES ---

// Get ranks (public)
app.get('/api/ranks', (req, res) => {
  // Default ranks structure
  const defaultRanks = [
    { level: 1, title: "Neuling", minExp: 0, color: "#8B4513" },
    { level: 2, title: "Lehrling", minExp: 50, color: "#A9A9A9" },
    { level: 3, title: "Handwerker", minExp: 150, color: "#CD7F32" },
    { level: 4, title: "Fachmann", minExp: 300, color: "#C0C0C0" },
    { level: 5, title: "Experte", minExp: 500, color: "#FFD700" },
    { level: 6, title: "Meister", minExp: 750, color: "#E6E6FA" },
    { level: 7, title: "Großmeister", minExp: 1100, color: "#F0E68C" },
    { level: 8, title: "Virtuose", minExp: 1500, color: "#DDA0DD" },
    { level: 9, title: "Legende", minExp: 2000, color: "#20B2AA" },
    { level: 10, title: "Mythisch", minExp: 2600, color: "#FF6347" }
  ];
  
  res.json(defaultRanks);
});

// Get rewards (public)
app.get('/api/rewards', (req, res) => {
  rewardsDb.all('SELECT * FROM rewards ORDER BY type, bonus_exp', [], (err, rewards) => {
    if (err) {
      console.error('Get rewards error:', err);
      return res.status(500).json({ error: 'Failed to fetch rewards' });
    }
    res.json(rewards);
  });
});

// --- ADMIN ROUTES ---

// Get all users (admin only)
app.get('/api/admin/users', requireAdmin, (req, res) => {
  getAllUsers((err, users) => {
    if (err) {
      console.error('Get users error:', err);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
    res.json(users);
  });
});

// Create new user (admin only)
app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { username, password, role, email } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  createUser({ username, password, role, email }, function(err, userId) {
    if (err) {
      if (err.code === 'SQLITE_CONSTRAINT') {
        return res.status(400).json({ error: 'Username already exists' });
      }
      console.error('Create user error:', err);
      return res.status(500).json({ error: 'Failed to create user' });
    }
    res.json({ success: true, userId: userId });
  });
});

// Delete user (admin only)
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  
  deleteUser(userId, function(err, changes) {
    if (err) {
      console.error('Delete user error:', err);
      return res.status(500).json({ error: err.message });
    }
    if (changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true });
  });
});

// Update user (admin only) - for role changes
app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  const { role, email, is_active } = req.body;
  
  // Build update query dynamically based on provided fields
  const updates = [];
  const values = [];
  
  if (role !== undefined) {
    updates.push('role = ?');
    values.push(role);
  }
  if (email !== undefined) {
    updates.push('email = ?');
    values.push(email);
  }
  if (is_active !== undefined) {
    updates.push('is_active = ?');
    values.push(is_active ? 1 : 0);
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }
  
  values.push(userId);
  const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
  
  authDb.run(sql, values, function(err) {
    if (err) {
      console.error('Update user error:', err);
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true });
  });
});

// Get admin configuration
app.get('/api/admin/config', requireAdmin, (req, res) => {
  getAdminConfig((err, configs) => {
    if (err) {
      console.error('Get config error:', err);
      return res.status(500).json({ error: 'Failed to fetch configuration' });
    }
    res.json(configs);
  });
});

// Update admin configuration (batch update)
app.post('/api/admin/config', requireAdmin, (req, res) => {
  const configUpdates = req.body;
  const userId = req.session.userId;
  
  const updatePromises = Object.entries(configUpdates).map(([key, value]) => {
    return new Promise((resolve, reject) => {
      updateAdminConfig(key, value, userId, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
  
  Promise.all(updatePromises)
    .then(() => {
      res.json({ success: true });
      emitDataChanged(); // Notify clients of config changes
    })
    .catch(err => {
      console.error('Batch config update error:', err);
      res.status(500).json({ error: 'Failed to update configuration' });
    });
});

// Update admin configuration (single key)
app.put('/api/admin/config/:key', requireAdmin, (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  
  updateAdminConfig(key, value, req.session.userId, (err) => {
    if (err) {
      console.error('Update config error:', err);
      return res.status(500).json({ error: 'Failed to update configuration' });
    }
    res.json({ success: true });
    emitDataChanged(); // Notify clients of config changes
  });
});

// REWARDS API ENDPOINTS

// Get all rewards
app.get('/api/admin/rewards', requireAdmin, (req, res) => {
  rewardsDb.all('SELECT * FROM rewards ORDER BY type, name', (err, rewards) => {
    if (err) {
      console.error('Get rewards error:', err);
      return res.status(500).json({ error: 'Failed to get rewards' });
    }
    res.json(rewards);
  });
});

// Create new reward
app.post('/api/admin/rewards', requireAdmin, (req, res) => {
  const { name, type, description, bonus_exp, requirement_count, is_repeatable, is_one_time, icon, color } = req.body;
  
  const sql = `INSERT INTO rewards (name, type, description, bonus_exp, requirement_count, is_repeatable, is_one_time, icon, color, created_by) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  
  rewardsDb.run(sql, [
    name, type, description, 
    bonus_exp || 0, 
    requirement_count || 1, 
    is_repeatable ? 1 : 0,
    is_one_time ? 1 : 0,
    icon || '🏆',
    color || '#FFD700',
    req.session.userId
  ], function(err) {
    if (err) {
      console.error('Create reward error:', err);
      return res.status(500).json({ error: 'Failed to create reward' });
    }
    res.json({ id: this.lastID, success: true });
  });
});

// Update reward
app.put('/api/admin/rewards/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, type, description, bonus_exp, requirement_count, is_repeatable, is_one_time, icon, color, active } = req.body;
  
  const sql = `UPDATE rewards SET 
               name = ?, type = ?, description = ?, bonus_exp = ?, requirement_count = ?, 
               is_repeatable = ?, is_one_time = ?, icon = ?, color = ?, active = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`;
  
  rewardsDb.run(sql, [
    name, type, description, 
    bonus_exp || 0, 
    requirement_count || 1,
    is_repeatable ? 1 : 0,
    is_one_time ? 1 : 0,
    icon || '🏆',
    color || '#FFD700',
    active ? 1 : 0,
    id
  ], function(err) {
    if (err) {
      console.error('Update reward error:', err);
      return res.status(500).json({ error: 'Failed to update reward' });
    }
    res.json({ success: true, changes: this.changes });
  });
});

// Delete reward
app.delete('/api/admin/rewards/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  
  rewardsDb.run('DELETE FROM rewards WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Delete reward error:', err);
      return res.status(500).json({ error: 'Failed to delete reward' });
    }
    res.json({ success: true, changes: this.changes });
  });
});

// Test route to verify system status
app.get('/api/system/status', requireAuth, (req, res) => {
  res.json({
    status: 'OK',
    user: {
      id: req.session.userId,
      username: req.session.username,
      role: req.session.role
    },
    timestamp: new Date().toISOString()
  });
});

// Helper
function ensureFileExists(file, defaultContent = []) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultContent, null, 2), 'utf8');
  }
}

function readJSON(file) {
  ensureFileExists(file, []);
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  ensureFileExists(file, []);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// Helper for notifications
function emitNotification(notification) {
  // Save notification to notifications.db
  const seenByJson = JSON.stringify(notification.seenBy || []);
  notificationsDb.run(
    `INSERT INTO notifications (type, playerId, playerName, level, reward, timestamp, seenBy) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [notification.type, notification.playerId, notification.playerName, notification.level, notification.reward, notification.timestamp, seenByJson],
    function (err) {
      if (err) console.error('DB notification error:', err);
    }
  );
  io.emit('notification', notification); // Real-time to all clients
}

// GET alle Tasks
app.get('/api/tasks', requireAuth, (req, res) => {
  tasksDb.all('SELECT * FROM tasks WHERE archived = 0', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST neuer Task
app.post('/api/tasks', requireAuth, (req, res) => {
  const t = req.body;
  tasksDb.run(
    `INSERT INTO tasks (name, difficulty, urgency, dueDate, player, status, added, confirmedBy, minutesWorked, note, hours, commentary, completedAt, approver, rating, answerCommentary, exp, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [t.name, t.difficulty, t.urgency, t.dueDate, t.player, 'open', t.added || new Date().toISOString(), null, t.minutesWorked, t.note, t.hours, t.commentary, t.completedAt, t.approver, t.rating, t.answerCommentary, t.exp],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      tasksDb.get('SELECT * FROM tasks WHERE id = ?', [this.lastID], (err2, row) => {
        if (err2) return res.status(500).json({ error: err2.message });
        emitDataChanged();
        res.json({ success: true, task: row });
      });
    }
  );
});

// POST: Aufgabe als erledigt markieren
app.post('/api/mark-done/:id', requireAuth, (req, res) => {
  const taskId = parseInt(req.params.id);
  const { player, note, hours } = req.body;
  tasksDb.get('SELECT * FROM tasks WHERE id = ? AND archived = 0', [taskId], (err, task) => {
    if (err || !task) return res.status(403).json({ error: 'Task nicht gefunden oder unberechtigt' });
    if (task.player !== player) return res.status(403).json({ error: 'Task nicht gefunden oder unberechtigt' });
    tasksDb.run('UPDATE tasks SET status = ?, note = ?, hours = ?, waitingForApproval = 0 WHERE id = ?',
      ['done', note || '', hours || 0, taskId],
      function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        emitDataChanged();
        res.json({ success: true });
      });
  });
});

// PATCH: Update a task by ID
app.patch('/api/tasks/:id', (req, res) => {
  const taskId = parseInt(req.params.id);
  const validTaskColumns = [
    'name', 'difficulty', 'urgency', 'dueDate', 'player', 'status', 'added', 'confirmedBy',
    'minutesWorked', 'note', 'hours', 'commentary', 'completedAt', 'approver', 'rating',
    'answerCommentary', 'exp', 'archived', 'waitingForApproval'
  ];
  const updates = {};
  for (const key in req.body) {
    if (validTaskColumns.includes(key)) updates[key] = req.body[key];
  }
  // If status is being set to 'submitted', set waitingForApproval = 1
  if (updates.status === 'submitted') {
    updates.waitingForApproval = 1;
  }
  // If status is being set to 'done' or task is being archived, set waitingForApproval = 0
  if (updates.status === 'done' || updates.archived === 1) {
    updates.waitingForApproval = 0;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update.' });
  }
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(taskId);
  // Debug log
  console.log('PATCH /api/tasks/:id', { updates, sql: `UPDATE tasks SET ${fields} WHERE id = ?`, values });
  tasksDb.run(`UPDATE tasks SET ${fields} WHERE id = ?`, values, function (err) {
    if (err) {
      console.error('SQL error:', err);
      return res.status(500).json({ error: err.message });
    }
    tasksDb.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err2, row) => {
      if (err2) return res.status(500).json({ error: err2.message });
      emitDataChanged();
      res.json({ success: true, task: row });
    });
  });
});

// POST: Aufgabe freigeben (BestÃ¤tigung durch Gegner)
app.post('/api/confirm/:id', requireAuth, (req, res) => {
  const taskId = parseInt(req.params.id);
  const player = req.body.player;
  const rating = typeof req.body.rating === 'number' ? req.body.rating : parseInt(req.body.rating);
  const answerCommentary = req.body.answerCommentary || "";
  tasksDb.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task) => {
    if (err || !task || task.status !== 'submitted') {
      return res.status(403).json({ error: 'Task nicht vorhanden oder nicht zur Freigabe bereit.' });
    }
    const ownerId = task.player || task.playerId;
    const isOwner = ownerId === player;
    const isApprover = task.approver === player;
    const isAnyone = task.approver === '__anyone__' && !isOwner;
    if (!(isApprover || isAnyone)) {
      return res.status(403).json({ error: 'Nicht berechtigt, diese Aufgabe zu bestÃ¤tigen.' });
    }
    let newApprover = task.approver;
    if (task.approver === '__anyone__') {
      newApprover = player;
    }
    
    // Calculate EXP and complete the task
    calculateTaskEXP(task).then(exp => {
      const completedAt = new Date().toISOString();
      tasksDb.run('UPDATE tasks SET status = ?, confirmedBy = ?, rating = ?, answerCommentary = ?, approver = ?, exp = ?, completedAt = ?, archived = 1 WHERE id = ?',
        ['done', player, rating, answerCommentary, newApprover, exp, completedAt, taskId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        // Add EXP to the task owner's stats
        const taskOwnerId = parseInt(task.player || task.playerId);
        authDb.get('SELECT exp, claimed_rewards FROM users WHERE id = ?', [taskOwnerId], (err, user) => {
          if (err) {
            console.error('Error getting user stats:', err);
            emitDataChanged();
            return res.json({ success: true });
          }
          
          if (!user) {
            console.error('User not found for ID:', taskOwnerId);
            emitDataChanged();
            return res.json({ success: true });
          }
          
          const currentExp = (user?.exp || 0) + exp;
          const claimedRewards = user?.claimed_rewards ? JSON.parse(user.claimed_rewards) : [];
          
          authDb.run('UPDATE users SET exp = ? WHERE id = ?', [currentExp, taskOwnerId], (err) => {
            if (err) console.error('Error updating user EXP:', err);
            else console.log(`Added ${exp} EXP to user ${taskOwnerId}, total now: ${currentExp}`);
            emitDataChanged();
            res.json({ success: true });
          });
        });
      });
    }).catch(err => {
      console.error('EXP calculation error:', err);
      res.status(500).json({ error: 'Failed to calculate EXP' });
    });
  });
});

// Calculate EXP based on admin configuration
async function calculateTaskEXP(task) {
  return new Promise((resolve, reject) => {
    getAdminConfig((err, configs) => {
      if (err) return reject(err);
      
      // Convert configs to object for easy access
      const configObj = {};
      configs.forEach(config => {
        configObj[config.config_key] = config.config_value;
      });
      
      // Base EXP calculation
      const baseFormula = parseFloat(configObj.exp_base_formula || '10');
      const urgencyFormula = parseFloat(configObj.exp_urgency_formula || '5');
      const timeBonus = parseFloat(configObj.exp_time_bonus || '1');
      const earlyBonus = parseFloat(configObj.exp_early_bonus || '20');
      
      // Get difficulty and urgency multipliers
      const diffMultiplier = parseFloat(configObj[`exp_multiplier_diff_${task.difficulty || 1}`] || '1.0');
      const urgMultiplier = parseFloat(configObj[`exp_multiplier_urg_${task.urgency || 1}`] || '1.0');
      
      // Calculate base EXP
      let exp = baseFormula * (task.difficulty || 1) * diffMultiplier;
      
      // Add urgency bonus
      if (task.urgency && task.urgency > 0) {
        exp += urgencyFormula * task.urgency * urgMultiplier;
      }
      
      // Add time bonus
      if (task.minutesWorked) {
        exp += parseInt(task.minutesWorked) * timeBonus;
      }
      
      // Early completion bonus
      if (task.dueDate && new Date() <= new Date(task.dueDate)) {
        exp += earlyBonus;
      }
      
      // Late penalty
      if (task.dueDate && new Date() > new Date(task.dueDate)) {
        const penaltyStartDays = parseInt(configObj.exp_penalty_start_days || '1');
        const penaltyMaxDays = parseInt(configObj.exp_penalty_max_days || '21');
        
        const daysLate = Math.ceil((new Date() - new Date(task.dueDate)) / (1000*3600*24));
        
        if (daysLate >= penaltyStartDays) {
          const penaltyFactor = Math.min(1, daysLate / penaltyMaxDays);
          exp = Math.floor(exp * (1 - penaltyFactor * 0.9)); // Up to 90% penalty
          
          if (daysLate >= penaltyMaxDays) {
            exp = Math.max(-10, exp);
          }
        }
      }
      
      // No urgency penalty
      if (task.urgency === 0) {
        exp = Math.floor(exp * 0.5);
      }
      
      exp = Math.max(1, exp);
      resolve(exp);
    });
  });
}

// DELETE: Remove a task by ID
app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  const taskId = parseInt(req.params.id);
  tasksDb.run('DELETE FROM tasks WHERE id = ?', [taskId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    emitDataChanged();
    res.json({ success: true });
  });
});

// POST: Clear all tasks
app.post('/api/tasks/clear', requireAdmin, (req, res) => {
  tasksDb.run('DELETE FROM tasks WHERE archived = 0', [], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    emitDataChanged();
    res.json({ success: true });
  });
});

// POST: Clear all archive
app.post('/api/archive/clear', requireAdmin, (req, res) => {
  tasksDb.run('DELETE FROM tasks WHERE archived = 1', [], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    emitDataChanged();
    res.json({ success: true });
  });
});

// GET Archiv
app.get('/api/archive', requireAuth, (req, res) => {
  tasksDb.all('SELECT * FROM tasks WHERE archived = 1', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET all players (id and name)
app.get('/api/players', requireAuth, (req, res) => {
  // Get user information from auth database with display names
  authDb.all('SELECT id, username, profile_settings FROM users WHERE is_active = 1', [], (err, users) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const players = users.map(user => {
      let displayName = user.username;
      try {
        const settings = JSON.parse(user.profile_settings || '{}');
        displayName = settings.displayName || user.username;
      } catch (e) {
        // Use username as fallback
      }
      
      return {
        id: user.id.toString(),
        name: displayName
      };
    });
    
    res.json(players);
  });
});

// GET all player stats
app.get('/api/player-stats', requireAuth, (req, res) => {
  // Use consolidated auth database for player stats
  console.log('Calling getAllPlayerStats...');
  getAllPlayerStats((err, stats) => {
    if (err) {
      console.error('getAllPlayerStats error:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log('getAllPlayerStats success, returning', stats.length, 'stats');
    res.json(stats);
  });
});

// POST/PUT player stats (upsert)
app.post('/api/player-stats', requireAuth, (req, res) => {
  const { id, name, exp, claimedRewards } = req.body;
  
  // Update player stats in auth database
  updatePlayerStats(id, exp || 0, claimedRewards || [], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// POST: Clear all player stats (reset exp and claimedRewards)
app.post('/api/player-stats/clear', requireAdmin, (req, res) => {
  // Clear player stats in auth database (consolidated)
  authDb.run('UPDATE users SET exp = 0, claimed_rewards = "[]"', [], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: 'All player stats cleared' });
  });
});

// GET all notifications
app.get('/api/notifications', requireAuth, (req, res) => {
  notificationsDb.all('SELECT * FROM notifications', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- DEBUG ROUTES ---
app.get('/api/debug/clear-all', requireAdmin, (req, res) => {
  // Clear player stats in auth database
  authDb.run('UPDATE users SET exp = 0, claimed_rewards = "[]"', [], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    notificationsDb.run('DELETE FROM notifications', [], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      tasksDb.run('DELETE FROM tasks', [], (err3) => {
        if (err3) return res.status(500).json({ error: err3.message });
        res.json({ success: true });
      });
    });
  });
});

// Standardroute - redirect to login if not authenticated
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  } else {
    res.redirect('/login.html');
  }
});

// Serve login page without authentication
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

// Serve admin panel with authentication check
app.get('/admin.html', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// Serve profile page with authentication check  
app.get('/profile.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/profile.html'));
});

// Start server with socket.io
server.listen(PORT, () => console.log(`Server läuft auf http://localhost:${PORT}`));