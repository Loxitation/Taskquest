const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const http = require('http');
const session = require('express-session');
const { Server } = require('socket.io');
const { sendGotify, getGotifyTargetForUser, getAllGotifyTargets } = require('./gotify');
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
  
  // Ensure rewards table exists
  rewardsDb.run(`CREATE TABLE IF NOT EXISTS rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('bonus', 'milestone', 'achievement')),
    description TEXT,
    bonus_exp INTEGER DEFAULT 0,
    requirement_count INTEGER DEFAULT 1,
    is_repeatable BOOLEAN DEFAULT FALSE,
    is_one_time BOOLEAN DEFAULT TRUE,
    level INTEGER DEFAULT 1,
    icon TEXT DEFAULT '🎯',
    color TEXT DEFAULT '#FFD700',
    active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    FOREIGN KEY (created_by) REFERENCES users (id)
  )`, (err) => {
    if (err) {
      console.error('Error creating rewards table:', err);
    } else {
      console.log('Rewards table ready');
      
      // Insert default rewards if table is empty
      rewardsDb.get('SELECT COUNT(*) as count FROM rewards', (err, result) => {
        if (!err && result.count === 0) {
          console.log('Inserting default rewards...');
          const defaultRewards = [
            ['Früher Vogel', 'bonus', 'Aufgabe vor Fälligkeit erledigt', 10, 1, 1, 1, '🌅'],
            ['Perfektionist', 'bonus', 'Aufgabe mit höchster Qualität abgeschlossen', 15, 1, 1, 3, '⭐'],
            ['Blitzschnell', 'bonus', 'Aufgabe in unter 30 Minuten erledigt', 20, 1, 1, 2, '⚡'],
            ['Fleißig', 'milestone', '10 Aufgaben abgeschlossen', 50, 10, 1, 1, '💪'],
            ['Produktiv', 'milestone', '25 Aufgaben abgeschlossen', 100, 25, 1, 3, '🔥'],
            ['Unaufhaltsam', 'milestone', '50 Aufgaben abgeschlossen', 200, 50, 1, 5, '🚀'],
            ['Erste Aufgabe', 'achievement', 'Deine allererste Aufgabe erledigt', 25, 1, 0, 1, '🎯'],
            ['Level 5 erreicht', 'achievement', 'Du hast Level 5 erreicht!', 100, 1, 0, 5, '🏅'],
            ['Eine Woche aktiv', 'achievement', '7 Tage in Folge Aufgaben erledigt', 150, 1, 0, 2, '📅']
          ];
          
          const stmt = rewardsDb.prepare('INSERT OR IGNORE INTO rewards (name, type, description, bonus_exp, requirement_count, is_repeatable, level, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
          defaultRewards.forEach(reward => {
            stmt.run(reward);
          });
          stmt.finalize();
          console.log('Default rewards inserted');
        }
      });
    }
  });
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
  origin: ['http://localhost:3578', 'http://192.168.177.50:3578'],
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

// Database migration and schema validation
async function validateAndMigrateDatabase() {
  console.log('Starting database schema validation and migration...');
  
  // Define expected schemas for all tables
  const expectedSchemas = {
    tasks: {
      id: 'INTEGER PRIMARY KEY',
      name: 'TEXT',
      difficulty: 'INTEGER',
      urgency: 'INTEGER',
      dueDate: 'TEXT',
      player: 'TEXT',
      status: 'TEXT',
      added: 'TEXT',
      confirmedBy: 'TEXT',
      minutesWorked: 'INTEGER',
      note: 'TEXT',
      hours: 'INTEGER',
      commentary: 'TEXT',
      completedAt: 'TEXT',
      approver: 'TEXT',
      rating: 'INTEGER',
      answerCommentary: 'TEXT',
      exp: 'INTEGER',
      archived: 'INTEGER DEFAULT 0',
      waitingForApproval: 'INTEGER DEFAULT 0'
    },
    users: {
      id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
      username: 'TEXT UNIQUE NOT NULL',
      password: 'TEXT NOT NULL',
      role: 'TEXT DEFAULT \'user\'',
      email: 'TEXT',
      created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      last_login: 'DATETIME',
      profile_settings: 'TEXT',
      gotify_url: 'TEXT',
      gotify_token: 'TEXT',
      is_active: 'INTEGER DEFAULT 1',
      exp: 'INTEGER DEFAULT 0',
      claimed_rewards: 'TEXT DEFAULT \'[]\'',
      player_settings: 'TEXT DEFAULT \'{}\'',
      notification_preferences: 'TEXT DEFAULT \'{"content": {"taskName": true, "timeWorked": true, "playerName": true, "difficulty": false, "urgency": false, "dueDate": false, "taskNote": false, "commentary": false, "rating": true, "expGained": true}, "types": {"taskSubmission": true, "taskApproval": true, "taskDecline": true, "levelUp": true, "rewardRedeemed": true, "newTask": false, "reminders": true}, "reminders": {"enabled": false, "dailyTime": "08:00", "dueDateWarning": true, "dueDateDays": 1, "frequency": "once", "weekdays": {"monday": true, "tuesday": true, "wednesday": true, "thursday": true, "friday": true, "saturday": false, "sunday": false}}, "privacy": {"showOtherPlayersTasks": false, "showPlayerStats": true, "showNotificationPreviews": true}}\''
    },
    admin_config: {
      id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
      config_key: 'TEXT UNIQUE NOT NULL',
      config_value: 'TEXT',
      description: 'TEXT',
      updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      updated_by: 'INTEGER'
    },
    rewards: {
      id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
      name: 'TEXT NOT NULL',
      type: 'TEXT NOT NULL CHECK (type IN (\'bonus\', \'milestone\', \'achievement\'))',
      description: 'TEXT',
      bonus_exp: 'INTEGER DEFAULT 0',
      requirement_count: 'INTEGER DEFAULT 1',
      is_repeatable: 'BOOLEAN DEFAULT FALSE',
      is_one_time: 'BOOLEAN DEFAULT TRUE',
      level: 'INTEGER DEFAULT 1',
      icon: 'TEXT DEFAULT \'🎯\'',
      color: 'TEXT DEFAULT \'#FFD700\'',
      active: 'BOOLEAN DEFAULT TRUE',
      created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      created_by: 'INTEGER'
    },
    notifications: {
      id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
      taskId: 'INTEGER',
      player: 'TEXT',
      message: 'TEXT',
      timestamp: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
    }
  };

  // Function to check and add missing columns
  const checkAndAddColumns = (db, tableName, expectedColumns) => {
    return new Promise((resolve, reject) => {
      db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
        if (err) {
          console.error(`Error getting table info for ${tableName}:`, err);
          return reject(err);
        }

        const existingColumns = columns.map(col => col.name);
        const missingColumns = Object.keys(expectedColumns).filter(col => !existingColumns.includes(col));

        if (missingColumns.length === 0) {
          console.log(`✅ Table ${tableName} schema is up to date`);
          return resolve();
        }

        console.log(`🔧 Adding missing columns to ${tableName}:`, missingColumns);
        
        const alterPromises = missingColumns.map(column => {
          return new Promise((resolveAlter, rejectAlter) => {
            const columnDef = expectedColumns[column];
            db.run(`ALTER TABLE ${tableName} ADD COLUMN ${column} ${columnDef}`, (err) => {
              if (err) {
                console.error(`Error adding column ${column} to ${tableName}:`, err);
                rejectAlter(err);
              } else {
                console.log(`✅ Added column ${column} to ${tableName}`);
                resolveAlter();
              }
            });
          });
        });

        Promise.all(alterPromises).then(resolve).catch(reject);
      });
    });
  };

  try {
    // Check all databases and tables
    await checkAndAddColumns(tasksDb, 'tasks', expectedSchemas.tasks);
    await checkAndAddColumns(authDb, 'users', expectedSchemas.users);
    await checkAndAddColumns(authDb, 'admin_config', expectedSchemas.admin_config);
    await checkAndAddColumns(rewardsDb, 'rewards', expectedSchemas.rewards);
    await checkAndAddColumns(notificationsDb, 'notifications', expectedSchemas.notifications);
    
    console.log('✅ Database schema validation and migration completed successfully');
  } catch (error) {
    console.error('❌ Database migration failed:', error);
  }
}

// Fix orphaned tasks with invalid approvers
async function fixInvalidApprovers() {
  console.log('Checking for tasks with invalid approvers...');
  
  return new Promise((resolve) => {
    // Get all users to check valid approver IDs
    authDb.all('SELECT id FROM users WHERE is_active = 1', (err, users) => {
      if (err) {
        console.error('Error getting users for approver validation:', err);
        return resolve();
      }
      
      const validUserIds = users.map(u => String(u.id));
      
      // Check tasks with approvers that are not '__anyone__' or valid user IDs
      tasksDb.all('SELECT id, approver FROM tasks WHERE status = ? AND archived = 0', ['submitted'], (err, tasks) => {
        if (err) {
          console.error('Error checking tasks for invalid approvers:', err);
          return resolve();
        }
        
        const tasksToFix = tasks.filter(task => {
          return task.approver && 
                 task.approver !== '__anyone__' && 
                 !validUserIds.includes(String(task.approver));
        });
        
        if (tasksToFix.length === 0) {
          console.log('✅ All task approvers are valid');
          return resolve();
        }
        
        console.log(`🔧 Fixing ${tasksToFix.length} tasks with invalid approvers...`);
        
        const fixPromises = tasksToFix.map(task => {
          return new Promise((resolveFix) => {
            tasksDb.run('UPDATE tasks SET approver = ? WHERE id = ?', ['__anyone__', task.id], (err) => {
              if (err) {
                console.error(`Error fixing approver for task ${task.id}:`, err);
              } else {
                console.log(`✅ Fixed approver for task ${task.id} (was: ${task.approver}, now: __anyone__)`);
              }
              resolveFix();
            });
          });
        });
        
        Promise.all(fixPromises).then(() => {
          console.log('✅ All invalid approvers have been fixed');
          resolve();
        });
      });
    });
  });
}

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
    
    // Run database migrations and fixes
    await validateAndMigrateDatabase();
    await fixInvalidApprovers();
    
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
      gotify_token: user.gotify_token,
      notification_preferences: user.notification_preferences ? JSON.parse(user.notification_preferences) : {
        includeTaskName: true,
        includeTimeWorked: true,
        includePlayerName: true,
        includeTaskDetails: false
      }
    });
  });
});

// Update user profile
app.put('/api/auth/profile', requireAuth, (req, res) => {
  const { gotify_url, gotify_token, profile_settings, notification_preferences } = req.body;
  
  updateUserProfile(req.session.userId, {
    gotify_url,
    gotify_token,
    profile_settings,
    notification_preferences
  }, (err) => {
    if (err) {
      console.error('Profile update error:', err);
      return res.status(500).json({ error: 'Failed to update profile' });
    }
    res.json({ success: true });
  });
});

// Test Gotify notification
app.post('/api/auth/test-notification', requireAuth, (req, res) => {
  const { message, contentPreferences } = req.body;
  
  getGotifyTargetForUser(req.session.userId, (target) => {
    if (!target) {
      return res.status(400).json({ error: 'Gotify settings not configured. Please set up your Gotify server URL and token first.' });
    }
    
    // Create a comprehensive test task that demonstrates all possible content
    const testTask = {
      id: 999,
      name: 'Test-Aufgabe für Benachrichtigungs-Demo',
      difficulty: 3,
      urgency: 2,
      minutesWorked: 42,
      dueDate: new Date(Date.now() + 24*60*60*1000).toISOString().split('T')[0], // Tomorrow
      note: 'Dies ist eine Beispiel-Notiz für die Test-Aufgabe.',
      answerCommentary: 'Sehr gute Arbeit! Diese Aufgabe wurde ausgezeichnet erledigt.',
      player: req.session.userId,
      status: 'done'
    };
    
    const testOwner = {
      id: req.session.userId,
      username: req.session.username
    };
    
    const testApprover = 'Test-Genehmiger';
    const testRating = 4;
    const testExpGained = 85;
    
    // Use the actual buildTaskNotificationMessage function to create test content
    let testMessage = 'Dies ist eine Test-Benachrichtigung von TaskQuest!';
    testMessage += '\n🧪 Vorschau Ihrer Benachrichtigungs-Einstellungen:';
    
    // Build message using the same logic as real notifications
    const notificationContent = buildTaskNotificationMessage(
      testTask, 
      testOwner, 
      contentPreferences, 
      testApprover, 
      testRating, 
      testExpGained
    );
    
    if (notificationContent.trim()) {
      testMessage += notificationContent;
    } else {
      testMessage += '\n\n❌ Keine Inhalte ausgewählt - Sie würden leere Benachrichtigungen erhalten!';
      testMessage += '\n💡 Tipp: Aktivieren Sie mindestens eine Inhalts-Option in Ihren Einstellungen.';
    }
    
    testMessage += '\n\n✅ Falls Sie diese Nachricht erhalten, funktioniert Ihr Gotify-Setup korrekt!';
    testMessage += '\n📋 Dies zeigt genau, was Sie in echten Benachrichtigungen sehen würden.';
    
    sendGotify('🧪 TaskQuest Test-Benachrichtigung', testMessage, [target], 5);
    res.json({ success: true, message: 'Test notification sent with your current preferences!' });
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
  
  // Only allow core admin (user ID 1) to remove admin rights
  if (role === 'user' && req.user.id !== 1) {
    // Check if target user is admin
    authDb.get('SELECT role FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (user && user.role === 'admin') {
        return res.status(403).json({ error: 'Nur der Core-Administrator (User ID 1) kann Admin-Rechte entziehen.' });
      }
      // Continue with normal update process
      performUpdate();
    });
    return;
  }
  
  // Continue with update if no restrictions apply
  performUpdate();
  
  function performUpdate() {
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
      
      // If role was updated, update any active sessions for this user
      if (role !== undefined) {
        // Note: In a production app, you'd want to track sessions in a database
        // For now, we'll let the user refresh their session by re-logging in
        console.log(`User ${userId} role updated to ${role}. User should refresh their session.`);
      }
      
      res.json({ success: true });
    });
  }
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
  console.log('Admin rewards endpoint accessed from:', req.ip);
  rewardsDb.all('SELECT * FROM rewards ORDER BY type, name', (err, rewards) => {
    if (err) {
      console.error('Get rewards error:', err);
      console.error('Database path:', rewardsDb.filename);
      return res.status(500).json({ error: 'Failed to get rewards', details: err.message });
    }
    console.log('Found', rewards.length, 'rewards');
    res.json(rewards);
  });
});

// Create new reward
app.post('/api/admin/rewards', requireAdmin, (req, res) => {
  console.log('Create reward endpoint accessed from:', req.ip);
  console.log('Request body:', req.body);
  
  const { name, type, description, bonus_exp, requirement_count, is_repeatable, is_one_time, level, icon, color } = req.body;
  
  const sql = `INSERT INTO rewards (name, type, description, bonus_exp, requirement_count, is_repeatable, is_one_time, level, icon, color, created_by) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  
  rewardsDb.run(sql, [
    name, type, description, 
    bonus_exp || 0, 
    requirement_count || 1, 
    is_repeatable ? 1 : 0,
    is_one_time ? 1 : 0,
    level || 1,
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
  const { name, type, description, bonus_exp, requirement_count, is_repeatable, is_one_time, level, icon, color, active } = req.body;
  
  const sql = `UPDATE rewards SET 
               name = ?, type = ?, description = ?, bonus_exp = ?, requirement_count = ?, 
               is_repeatable = ?, is_one_time = ?, level = ?, icon = ?, color = ?, active = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`;
  
  rewardsDb.run(sql, [
    name, type, description, 
    bonus_exp || 0, 
    requirement_count || 1,
    is_repeatable ? 1 : 0,
    is_one_time ? 1 : 0,
    level || 1,
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

// Reset entire application (DANGEROUS)
app.post('/api/reset', requireAdmin, (req, res) => {
  console.log('🚨 APPLICATION RESET INITIATED by admin:', req.session.username);
  
  try {
    // Clear all tasks (which will automatically reset XP and levels since they're calculated from tasks)
    tasksDb.run('DELETE FROM tasks', [], function(err) {
      if (err) {
        console.error('Error clearing tasks:', err);
        return res.status(500).json({ error: 'Failed to clear tasks' });
      }
      
      console.log(`✅ Cleared ${this.changes} tasks`);
      
      // Reset all user XP and stats (this might be redundant if calculated from tasks, but ensures clean state)
      authDb.run('UPDATE users SET exp = 0, claimed_rewards = "[]" WHERE id != 1', [], function(err) {
        if (err) {
          console.error('Error resetting user stats:', err);
          return res.status(500).json({ error: 'Failed to reset user stats' });
        }
        
        console.log(`✅ Reset stats for ${this.changes} users`);
        
        // Clear rewards database 
        rewardsDb.run('DELETE FROM rewards', [], function(err) {
          if (err) {
            console.error('Error clearing rewards:', err);
            return res.status(500).json({ error: 'Failed to clear rewards' });
          }
          
          console.log(`✅ Cleared ${this.changes} rewards`);
          
          // Emit data changed to refresh all connected clients
          emitDataChanged();
          
          console.log('🎯 APPLICATION RESET COMPLETED SUCCESSFULLY');
          res.json({ 
            success: true, 
            message: 'Application reset completed successfully. All tasks, user progress, and rewards have been cleared.',
            resetBy: req.session.username,
            timestamp: new Date().toISOString()
          });
        });
      });
    });
  } catch (error) {
    console.error('Critical error during application reset:', error);
    res.status(500).json({ error: 'Critical error during reset: ' + error.message });
  }
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

// Get player statistics including total time worked
app.get('/api/player-stats', requireAuth, (req, res) => {
  // Get all users with their stats
  authDb.all('SELECT id, username, exp, claimed_rewards FROM users', (err, users) => {
    if (err) {
      console.error('Get users error:', err);
      return res.status(500).json({ error: 'Failed to get users' });
    }
    
    // For each user, calculate total minutes worked from all approved tasks
    const userPromises = users.map(user => {
      return new Promise((resolve) => {
        tasksDb.get(
          'SELECT COALESCE(SUM(minutesWorked), 0) as totalMinutes FROM tasks WHERE player = ? AND archived = 1',
          [user.id],
          (err, result) => {
            if (err) {
              console.error('Get time worked error for user', user.id, ':', err);
              resolve({
                id: user.id,
                name: user.username,
                exp: user.exp || 0,
                claimedRewards: user.claimed_rewards ? JSON.parse(user.claimed_rewards) : [],
                minutesWorked: 0
              });
            } else {
              resolve({
                id: user.id,
                name: user.username,
                exp: user.exp || 0,
                claimedRewards: user.claimed_rewards ? JSON.parse(user.claimed_rewards) : [],
                minutesWorked: result.totalMinutes || 0
              });
            }
          }
        );
      });
    });
    
    Promise.all(userPromises).then(stats => {
      res.json(stats);
    }).catch(error => {
      console.error('Error calculating player stats:', error);
      res.status(500).json({ error: 'Failed to calculate player stats' });
    });
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

// Helper to build task notification message based on user preferences
function buildTaskNotificationMessage(task, owner, contentPrefs, approver, rating, expGained, actionType = null) {
  let message = '';
  
  if (contentPrefs?.taskName !== false && task.name) {
    message += `\n📋 Aufgabe: ${task.name}`;
  }
  
  if (contentPrefs?.playerName !== false && owner?.username) {
    message += `\n👤 ${approver ? 'Eingereicht von' : 'Spieler'}: ${owner.username}`;
  }
  
  if (approver && contentPrefs?.playerName !== false) {
    let approverLabel;
    if (actionType === 'decline') {
      approverLabel = 'Abgelehnt von';
    } else {
      approverLabel = rating ? 'Genehmigt von' : 'Bearbeitet von';
    }
    message += `\n👤 ${approverLabel}: ${approver}`;
  }
  
  if (contentPrefs?.timeWorked !== false && task.minutesWorked) {
    message += `\n⏱️ Zeit gearbeitet: ${task.minutesWorked} Minuten`;
  }
  
  if (contentPrefs?.difficulty !== false && task.difficulty) {
    message += `\n🎯 Schwierigkeit: ${task.difficulty}/5`;
  }
  
  if (contentPrefs?.urgency !== false && task.urgency) {
    message += `\n🔥 Dringlichkeit: ${task.urgency}/5`;
  }
  
  if (contentPrefs?.dueDate !== false && task.dueDate) {
    const dueDate = new Date(task.dueDate).toLocaleDateString('de-DE');
    message += `\n📅 Fällig: ${dueDate}`;
  }
  
  if (contentPrefs?.taskNote !== false && task.note && task.note.trim()) {
    message += `\n📝 Notiz: ${task.note}`;
  }
  
  if (contentPrefs?.rating !== false && rating) {
    message += `\n⭐ Bewertung: ${rating}/5`;
  }
  
  if (contentPrefs?.commentary !== false && task.answerCommentary && task.answerCommentary.trim()) {
    message += `\n💬 Kommentar: ${task.answerCommentary}`;
  }
  
  if (contentPrefs?.expGained !== false && expGained) {
    message += `\n🎮 EXP erhalten: ${expGained}`;
  }
  
  return message;
}

// Helper to check for level up and send notifications
function checkForLevelUp(userId, oldExp, newExp) {
  const ranks = [
    { level: 1, title: "Neuling", minExp: 0 },
    { level: 2, title: "Lehrling", minExp: 50 },
    { level: 3, title: "Handwerker", minExp: 150 },
    { level: 4, title: "Fachmann", minExp: 300 },
    { level: 5, title: "Experte", minExp: 500 },
    { level: 6, title: "Meister", minExp: 750 },
    { level: 7, title: "Großmeister", minExp: 1100 },
    { level: 8, title: "Virtuose", minExp: 1500 },
    { level: 9, title: "Legende", minExp: 2000 },
    { level: 10, title: "Mythisch", minExp: 2600 }
  ];
  
  const oldLevel = ranks.filter(r => r.minExp <= oldExp).pop()?.level || 1;
  const newLevel = ranks.filter(r => r.minExp <= newExp).pop()?.level || 1;
  
  if (newLevel > oldLevel) {
    const newRank = ranks.find(r => r.level === newLevel);
    sendLevelUpNotification(userId, newLevel, newRank?.title || 'Unbekannt');
  }
}

// Helper to send level up notifications
function sendLevelUpNotification(userId, newLevel, rankTitle) {
  // Get user details
  authDb.get('SELECT username FROM users WHERE id = ? AND is_active = 1', [userId], (err, user) => {
    if (err || !user) return;
    
    // Send to all users who want level up notifications
    authDb.all('SELECT id, username, gotify_url, gotify_token, notification_preferences FROM users WHERE is_active = 1', [], (err, users) => {
      if (err || !users) return;
      
      users.forEach(targetUser => {
        if (!targetUser.gotify_url || !targetUser.gotify_token) return;
        
        const prefs = targetUser.notification_preferences ? JSON.parse(targetUser.notification_preferences) : {
          types: { levelUp: true }
        };
        
        // Check if user wants level up notifications
        if (prefs.types?.levelUp === false) return;
        
        const target = { url: targetUser.gotify_url, token: targetUser.gotify_token };
        const title = targetUser.id === userId ? '🎉 Level aufgestiegen!' : '🎉 Jemand ist aufgestiegen!';
        let message = targetUser.id === userId 
          ? `Glückwunsch! Du hast Level ${newLevel} erreicht!`
          : `${user.username} hat Level ${newLevel} erreicht!`;
        
        message += `\n🏆 Neuer Rang: ${rankTitle}`;
        message += `\n🎮 Level: ${newLevel}`;
        
        sendGotify(title, message, [target], 6);
      });
    });
  });
}

// Helper to send reward redemption notifications
function sendRewardRedemptionNotification(userId, rewardName, rewardDescription) {
  // Get user details
  authDb.get('SELECT username FROM users WHERE id = ? AND is_active = 1', [userId], (err, user) => {
    if (err || !user) return;
    
    // Send to all users who want reward notifications
    authDb.all('SELECT id, username, gotify_url, gotify_token, notification_preferences FROM users WHERE is_active = 1', [], (err, users) => {
      if (err || !users) return;
      
      users.forEach(targetUser => {
        if (!targetUser.gotify_url || !targetUser.gotify_token) return;
        
        const prefs = targetUser.notification_preferences ? JSON.parse(targetUser.notification_preferences) : {
          types: { rewardRedeemed: true }
        };
        
        // Check if user wants reward redemption notifications
        if (prefs.types?.rewardRedeemed === false) return;
        
        const target = { url: targetUser.gotify_url, token: targetUser.gotify_token };
        const title = targetUser.id === userId ? '🏆 Belohnung eingelöst!' : '🏆 Belohnung eingelöst!';
        let message = targetUser.id === userId 
          ? `Du hast eine Belohnung eingelöst!`
          : `${user.username} hat eine Belohnung eingelöst!`;
        
        message += `\n🎁 Belohnung: ${rewardName}`;
        if (rewardDescription) {
          message += `\n📄 ${rewardDescription}`;
        }
        
        sendGotify(title, message, [target], 5);
      });
    });
  });
}

// Task reminder system
const taskReminderIntervals = new Map();

function startTaskReminderSystem() {
  console.log('🔔 Starting task reminder system...');
  
  // Check reminders every hour
  const reminderChecker = setInterval(() => {
    checkTaskReminders();
  }, 60 * 60 * 1000); // Every hour
  
  // Initial check
  setTimeout(checkTaskReminders, 5000);
}

function checkTaskReminders() {
  // Get all users with reminder preferences
  authDb.all('SELECT id, username, gotify_url, gotify_token, notification_preferences FROM users WHERE is_active = 1', [], (err, users) => {
    if (err || !users) return;
    
    users.forEach(user => {
      if (!user.gotify_url || !user.gotify_token) return;
      
      const prefs = user.notification_preferences ? JSON.parse(user.notification_preferences) : {};
      const reminderSettings = prefs.reminders || { enabled: false };
      
      if (!reminderSettings.enabled || prefs.types?.reminders === false) return;
      
      checkUserTaskReminders(user, reminderSettings, prefs.content || {});
    });
  });
}

function checkUserTaskReminders(user, reminderSettings, contentPrefs) {
  const now = new Date();
  const currentTime = now.toTimeString().substring(0, 5); // HH:MM format
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const target = { url: user.gotify_url, token: user.gotify_token };
  
  // Map day numbers to weekday names
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDayName = dayNames[currentDay];
  
  // Check if today is enabled for reminders
  const weekdays = reminderSettings.weekdays || {
    monday: true, tuesday: true, wednesday: true, thursday: true, friday: true,
    saturday: false, sunday: false
  };
  
  const isDayEnabled = weekdays[currentDayName] !== false;
  
  // Daily reminder check
  if (reminderSettings.dailyTime && currentTime === reminderSettings.dailyTime && isDayEnabled) {
    // Get user's open tasks
    tasksDb.all('SELECT * FROM tasks WHERE player = ? AND status = "open" AND archived = 0', [user.id], (err, tasks) => {
      if (err || !tasks || tasks.length === 0) return;
      
      const title = '📋 Tägliche Aufgaben-Erinnerung';
      let message = `Du hast ${tasks.length} offene Aufgabe(n):`;
      
      tasks.slice(0, 5).forEach(task => {
        message += `\n• ${task.name}`;
        if (contentPrefs.dueDate && task.dueDate) {
          const dueDate = new Date(task.dueDate).toLocaleDateString('de-DE');
          message += ` (fällig: ${dueDate})`;
        }
        if (contentPrefs.difficulty && task.difficulty) {
          message += ` [${task.difficulty}/5]`;
        }
      });
      
      if (tasks.length > 5) {
        message += `\n... und ${tasks.length - 5} weitere`;
      }
      
      sendGotify(title, message, [target], 4);
    });
  }
  
  // Due date warning check
  if (reminderSettings.dueDateWarning) {
    const warningDays = reminderSettings.dueDateDays || 1;
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + warningDays);
    
    tasksDb.all(
      'SELECT * FROM tasks WHERE player = ? AND status = "open" AND archived = 0 AND dueDate IS NOT NULL AND dueDate != ""', 
      [user.id], 
      (err, tasks) => {
        if (err || !tasks) return;
        
        const dueSoonTasks = tasks.filter(task => {
          const dueDate = new Date(task.dueDate);
          return dueDate <= warningDate && dueDate >= now;
        });
        
        if (dueSoonTasks.length === 0) return;
        
        const title = '⏰ Aufgaben werden bald fällig!';
        let message = `${dueSoonTasks.length} Aufgabe(n) werden in den nächsten ${warningDays} Tag(en) fällig:`;
        
        dueSoonTasks.forEach(task => {
          const dueDate = new Date(task.dueDate).toLocaleDateString('de-DE');
          message += `\n• ${task.name} (fällig: ${dueDate})`;
          if (contentPrefs.urgency && task.urgency) {
            message += ` [Dringlichkeit: ${task.urgency}/5]`;
          }
        });
        
        sendGotify(title, message, [target], 7);
      }
    );
  }
  
  // Overdue task reminders based on frequency
  if (reminderSettings.frequency && reminderSettings.frequency !== 'once') {
    tasksDb.all(
      'SELECT * FROM tasks WHERE player = ? AND status = "open" AND archived = 0 AND dueDate IS NOT NULL AND dueDate != ""', 
      [user.id], 
      (err, tasks) => {
        if (err || !tasks) return;
        
        const overdueTasks = tasks.filter(task => {
          const dueDate = new Date(task.dueDate);
          return dueDate < now;
        });
        
        if (overdueTasks.length === 0) return;
        
        // Check if we should send reminder based on frequency
        let shouldSend = false;
        const frequency = reminderSettings.frequency;
        
        if (frequency === 'daily') {
          shouldSend = isDayEnabled; // Send daily if today is enabled
        } else if (frequency === 'every-other-day') {
          // Send every other day (simple logic based on day of month)
          shouldSend = isDayEnabled && (now.getDate() % 2 === 0);
        }
        
        if (!shouldSend) return;
        
        const title = '🔴 Überfällige Aufgaben!';
        let message = `Sie haben ${overdueTasks.length} überfällige Aufgabe(n):`;
        
        overdueTasks.forEach(task => {
          const dueDate = new Date(task.dueDate);
          const daysOverdue = Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24));
          const dueDateStr = dueDate.toLocaleDateString('de-DE');
          
          message += `\n• ${task.name} (fällig: ${dueDateStr}, ${daysOverdue} Tag(e) überfällig)`;
          if (contentPrefs.urgency && task.urgency) {
            message += ` [Dringlichkeit: ${task.urgency}/5]`;
          }
        });
        
        sendGotify(title, message, [target], 9); // High priority for overdue
      }
    );
  }
}

// Helper to send Gotify notification for task submission
function sendTaskSubmissionNotification(task) {
  // Get task owner details
  authDb.get('SELECT username FROM users WHERE id = ? AND is_active = 1', [task.player || task.playerId], (err, owner) => {
    if (err || !owner) return;
    
    const approver = task.approver;
    
    if (approver === '__anyone__') {
      // Send to all active users except the task owner
      authDb.all('SELECT id, username, gotify_url, gotify_token, notification_preferences FROM users WHERE is_active = 1 AND id != ?', [task.player || task.playerId], (err, users) => {
        if (err || !users || users.length === 0) return;
        
        users.forEach(user => {
          if (!user.gotify_url || !user.gotify_token) return;
          
          const prefs = user.notification_preferences ? JSON.parse(user.notification_preferences) : {
            content: {}, types: { taskSubmission: true }
          };
          
          // Check if user wants task submission notifications
          if (prefs.types?.taskSubmission === false) return;
          
          const target = { url: user.gotify_url, token: user.gotify_token };
          const title = '📋 Neue Aufgabe zur Genehmigung';
          let message = `Eine neue Aufgabe wartet auf Genehmigung!`;
          
          // Build message based on user preferences
          message += buildTaskNotificationMessage(task, owner, prefs.content, null, null, null);
          
          sendGotify(title, message, [target], 7);
        });
      });
    } else {
      // Send to specific approver
      authDb.get('SELECT gotify_url, gotify_token, notification_preferences FROM users WHERE id = ? AND is_active = 1', [approver], (err, approverUser) => {
        if (err || !approverUser || !approverUser.gotify_url || !approverUser.gotify_token) return;
        
        const prefs = approverUser.notification_preferences ? JSON.parse(approverUser.notification_preferences) : {
          content: {}, types: { taskSubmission: true }
        };
        
        // Check if user wants task submission notifications
        if (prefs.types?.taskSubmission === false) return;
        
        const target = { url: approverUser.gotify_url, token: approverUser.gotify_token };
        const title = '📋 Aufgabe zur Genehmigung';
        let message = `Eine Aufgabe wartet auf Ihre Genehmigung!`;
        
        // Build message based on user preferences
        message += buildTaskNotificationMessage(task, owner, prefs.content, null, null, null);
        
        sendGotify(title, message, [target], 7);
      });
    }
  });
}

// Helper to send Gotify notification for task approval
function sendTaskApprovalNotification(task, approverId, rating, commentary, expGained) {
  const taskOwnerId = task.player || task.playerId;
  
  // Get task owner and approver details
  authDb.get('SELECT gotify_url, gotify_token, notification_preferences FROM users WHERE id = ? AND is_active = 1', [taskOwnerId], (err, owner) => {
    if (err || !owner || !owner.gotify_url || !owner.gotify_token) return;
    
    authDb.get('SELECT username FROM users WHERE id = ? AND is_active = 1', [taskOwnerId], (err, taskOwner) => {
      if (err || !taskOwner) return;
      
      authDb.get('SELECT username FROM users WHERE id = ? AND is_active = 1', [approverId], (err, approver) => {
        if (err || !approver) return;
        
        const prefs = owner.notification_preferences ? JSON.parse(owner.notification_preferences) : {
          content: {}, types: { taskApproval: true }
        };
        
        // Check if user wants task approval notifications
        if (prefs.types?.taskApproval === false) return;
        
        const target = { url: owner.gotify_url, token: owner.gotify_token };
        const title = '✅ Aufgabe genehmigt';
        let message = `Ihre Aufgabe wurde genehmigt!`;
        
        // Build message based on user preferences - use correct task owner username
        const ownerUser = { username: taskOwner.username };
        const updatedTask = { ...task, answerCommentary: commentary };
        message += buildTaskNotificationMessage(updatedTask, ownerUser, prefs.content, approver.username, rating, expGained);
        
        sendGotify(title, message, [target], 6);
      });
    });
  });
}

// Helper to send Gotify notification for task decline
function sendTaskDeclineNotification(task, declinerId) {
  const taskOwnerId = task.player || task.playerId;
  
  // Get task owner and decliner details
  authDb.get('SELECT gotify_url, gotify_token, notification_preferences FROM users WHERE id = ? AND is_active = 1', [taskOwnerId], (err, owner) => {
    if (err || !owner || !owner.gotify_url || !owner.gotify_token) return;
    
    authDb.get('SELECT username FROM users WHERE id = ? AND is_active = 1', [taskOwnerId], (err, taskOwner) => {
      if (err || !taskOwner) return;
      
      authDb.get('SELECT username FROM users WHERE id = ? AND is_active = 1', [declinerId], (err, decliner) => {
        if (err || !decliner) return;
        
        const prefs = owner.notification_preferences ? JSON.parse(owner.notification_preferences) : {
          content: {}, types: { taskDecline: true }
        };
        
        // Check if user wants task decline notifications
        if (prefs.types?.taskDecline === false) return;
        
        const target = { url: owner.gotify_url, token: owner.gotify_token };
        const title = '❌ Aufgabe abgelehnt';
        let message = `Ihre Aufgabe wurde abgelehnt und kann überarbeitet werden.`;
        
        // Build message for decline notification with correct labels
        const ownerUser = { username: taskOwner.username };
        message += buildTaskNotificationMessage(task, ownerUser, prefs.content, decliner.username, null, null, 'decline');
        
        sendGotify(title, message, [target], 5);
      });
    });
  });
}

// Helper to check for level up and send notifications
function checkForLevelUp(userId, oldExp, newExp) {
  const ranks = [
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
  
  const oldLevel = ranks.filter(r => r.minExp <= oldExp).pop()?.level || 1;
  const newLevel = ranks.filter(r => r.minExp <= newExp).pop()?.level || 1;
  
  if (newLevel > oldLevel) {
    const newRank = ranks.find(r => r.level === newLevel);
    sendLevelUpNotification(userId, newLevel, newRank?.title || 'Unbekannt');
  }
}

// Helper to send Gotify notification for level up
function sendLevelUpNotification(userId, newLevel, rankTitle) {
  // Get user details
  authDb.get('SELECT username FROM users WHERE id = ? AND is_active = 1', [userId], (err, user) => {
    if (err || !user) return;
    
    // Send to all active users (broadcast level up)
    authDb.all('SELECT id, username, gotify_url, gotify_token, notification_preferences FROM users WHERE is_active = 1', [], (err, users) => {
      if (err || !users || users.length === 0) return;
      
      users.forEach(targetUser => {
        if (!targetUser.gotify_url || !targetUser.gotify_token) return;
        
        const prefs = targetUser.notification_preferences ? JSON.parse(targetUser.notification_preferences) : {
          content: {}, types: { levelUp: true }
        };
        
        // Check if user wants level up notifications
        if (prefs.types?.levelUp === false) return;
        
        const target = { url: targetUser.gotify_url, token: targetUser.gotify_token };
        const isOwnLevelUp = targetUser.id === userId;
        
        const title = isOwnLevelUp ? '🎉 Level-Aufstieg!' : '🎉 Level-Aufstieg im Team!';
        let message = isOwnLevelUp 
          ? `Glückwunsch! Sie haben Level ${newLevel} erreicht!`
          : `${user.username} hat Level ${newLevel} erreicht!`;
        
        message += `\n🏆 Rang: ${rankTitle}`;
        
        if (prefs.content?.playerName !== false && !isOwnLevelUp) {
          // Player name already included in message for others
        }
        
        sendGotify(title, message, [target], 8);
      });
    });
  });
}

// Helper to send Gotify notification for reward redemption
function sendRewardRedemptionNotification(userId, rewardName, rewardDescription) {
  // Get user details
  authDb.get('SELECT username FROM users WHERE id = ? AND is_active = 1', [userId], (err, user) => {
    if (err || !user) return;
    
    // Send to all active users (broadcast reward redemption)
    authDb.all('SELECT id, username, gotify_url, gotify_token, notification_preferences FROM users WHERE is_active = 1', [], (err, users) => {
      if (err || !users || users.length === 0) return;
      
      users.forEach(targetUser => {
        if (!targetUser.gotify_url || !targetUser.gotify_token) return;
        
        const prefs = targetUser.notification_preferences ? JSON.parse(targetUser.notification_preferences) : {
          content: {}, types: { rewardRedeemed: true }
        };
        
        // Check if user wants reward redemption notifications
        if (prefs.types?.rewardRedeemed === false) return;
        
        const target = { url: targetUser.gotify_url, token: targetUser.gotify_token };
        const isOwnRedemption = targetUser.id === userId;
        
        const title = isOwnRedemption ? '🏆 Belohnung eingelöst!' : '🏆 Belohnung im Team eingelöst!';
        let message = isOwnRedemption 
          ? `Sie haben eine Belohnung eingelöst: ${rewardName}`
          : `${user.username} hat eine Belohnung eingelöst: ${rewardName}`;
        
        if (rewardDescription && rewardDescription.trim()) {
          message += `\n📝 ${rewardDescription}`;
        }
        
        sendGotify(title, message, [target], 6);
      });
    });
  });
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
      }
    );
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
  
  // Get original task state before update for decline detection
  tasksDb.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, originalTask) => {
    if (err) {
      console.error('Error getting original task:', err);
      return res.status(500).json({ error: err.message });
    }
    
    tasksDb.run(`UPDATE tasks SET ${fields} WHERE id = ?`, values, function (err) {
      if (err) {
        console.error('SQL error:', err);
        return res.status(500).json({ error: err.message });
      }
      tasksDb.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err2, row) => {
        if (err2) return res.status(500).json({ error: err2.message });
        
        // Send Gotify notification if task was submitted for approval
        if (updates.status === 'submitted') {
          sendTaskSubmissionNotification(row);
        }
        
        // Send notification if task was declined (reset from submitted to open)
        if (originalTask && originalTask.status === 'submitted' && updates.status === 'open') {
          sendTaskDeclineNotification(row, req.session.userId);
        }
        
        emitDataChanged();
        res.json({ success: true, task: row });
      });
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
            else {
              console.log(`Added ${exp} EXP to user ${taskOwnerId}, total now: ${currentExp}`);
              
              // Check for level up
              checkForLevelUp(taskOwnerId, user.exp || 0, currentExp);
            }
            
            // Send Gotify notification to task owner about approval
            sendTaskApprovalNotification(task, player, rating, answerCommentary, exp);
            
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

// Calculate XP based on admin configuration
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
server.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
  
  // Start task reminder system
  startTaskReminderSystem();
});