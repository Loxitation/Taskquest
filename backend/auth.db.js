// Authentication and user management database
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const authDb = new sqlite3.Database(path.join(__dirname, 'auth.db'), (err) => {
  if (err) throw err;
  console.log('Connected to auth.db (SQLite)');
});

// Create users table with player stats integrated
const createUsersTable = () => {
  return new Promise((resolve, reject) => {
    authDb.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      profile_settings TEXT,
      gotify_url TEXT,
      gotify_token TEXT,
      is_active INTEGER DEFAULT 1,
      exp INTEGER DEFAULT 0,
      claimed_rewards TEXT DEFAULT '[]',
      player_settings TEXT DEFAULT '{}'
    )`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// Create admin config table for system settings
const createAdminConfigTable = () => {
  return new Promise((resolve, reject) => {
    authDb.run(`CREATE TABLE IF NOT EXISTS admin_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT UNIQUE NOT NULL,
      config_value TEXT,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER,
      FOREIGN KEY (updated_by) REFERENCES users (id)
    )`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// Initialize default admin user and system config
const initializeDefaults = async () => {
  // Check if any admin user exists (particularly ID 1)
  authDb.get('SELECT id FROM users WHERE id = 1 OR role = ?', ['admin'], async (err, row) => {
    if (err) {
      console.error('Error checking for admin user:', err);
      return;
    }
    
    if (!row) {
      // Create default admin user only if no admin exists
      const hashedPassword = await bcrypt.hash('admin', 10);
      authDb.run(
        'INSERT INTO users (id, username, password, role, profile_settings) VALUES (?, ?, ?, ?, ?)',
        [1, 'admin', hashedPassword, 'admin', JSON.stringify({
          displayName: 'Administrator',
          theme: 'default',
          notifications: true
        })],
        function(err) {
          if (err) {
            console.error('Error creating admin user:', err);
          } else {
            console.log('Default admin user created (username: admin, password: admin)');
          }
        }
      );
    }
  });

  // Initialize default system configuration
  const defaultConfigs = [
    // XP Base System
    { key: 'exp_base_formula', value: '10', description: 'Basis-XP Berechnungsformel: multipliziert mit Schwierigkeit' },
    { key: 'exp_urgency_formula', value: '5', description: 'Dringlichkeits-XP Berechnungsformel: multipliziert mit Dringlichkeit' },
    { key: 'exp_time_bonus', value: '1', description: 'XP-Bonus pro gearbeitete Minute' },
    { key: 'exp_early_bonus', value: '20', description: 'Bonus-XP für rechtzeitige Aufgabenerledigung' },
    { key: 'exp_penalty_start_days', value: '1', description: 'Tage nach Fälligkeitsdatum, ab denen Strafe beginnt' },
    { key: 'exp_penalty_max_days', value: '21', description: 'Tage, nach denen maximale Strafe erreicht wird (-10 XP)' },
    
    // XP Multiplikatoren nach Schwierigkeit
    { key: 'exp_multiplier_diff_1', value: '0.8', description: 'XP-Multiplikator für Schwierigkeitsstufe 1 (sehr einfach)' },
    { key: 'exp_multiplier_diff_2', value: '1.0', description: 'XP-Multiplikator für Schwierigkeitsstufe 2 (einfach)' },
    { key: 'exp_multiplier_diff_3', value: '1.3', description: 'XP-Multiplikator für Schwierigkeitsstufe 3 (mittel)' },
    { key: 'exp_multiplier_diff_4', value: '1.7', description: 'XP-Multiplikator für Schwierigkeitsstufe 4 (schwer)' },
    { key: 'exp_multiplier_diff_5', value: '2.2', description: 'XP-Multiplikator für Schwierigkeitsstufe 5 (sehr schwer)' },
    
    // XP Multiplikatoren nach Dringlichkeit
    { key: 'exp_multiplier_urg_1', value: '1.0', description: 'XP-Multiplikator für Dringlichkeitsstufe 1 (niedrig)' },
    { key: 'exp_multiplier_urg_2', value: '1.1', description: 'XP-Multiplikator für Dringlichkeitsstufe 2 (mittel-niedrig)' },
    { key: 'exp_multiplier_urg_3', value: '1.2', description: 'XP-Multiplikator für Dringlichkeitsstufe 3 (mittel)' },
    { key: 'exp_multiplier_urg_4', value: '1.4', description: 'XP-Multiplikator für Dringlichkeitsstufe 4 (hoch)' },
    { key: 'exp_multiplier_urg_5', value: '1.6', description: 'XP-Multiplikator für Dringlichkeitsstufe 5 (kritisch)' },
    
    // Level System
    { key: 'level_exp_base', value: '100', description: 'Basis-XP erforderlich für erstes Level' },
    { key: 'level_exp_multiplier', value: '2', description: 'Multiplikator für exponentielle Progression' },
    { key: 'level_titles', value: JSON.stringify([
      'Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master', 'Grandmaster', 'Legend'
    ]), description: 'Level titles for player progression' },
    { key: 'level_emoji', value: '🐷', description: 'Emoji das neben dem Level-Titel angezeigt wird' },
    
    // Rewards System
    { key: 'rewards_enabled', value: 'true', description: 'Enable or disable reward system' },
    { key: 'rewards_config', value: JSON.stringify([
      { id: 1, name: 'First Steps', description: 'Complete your first task', level: 1, type: 'achievement' },
      { id: 2, name: 'Task Master', description: 'Reach level 5', level: 5, type: 'milestone' },
      { id: 3, name: 'Expert Achiever', description: 'Reach level 10', level: 10, type: 'milestone' }
    ]), description: 'Rewards configuration as JSON array' },
    
    // System Settings
    { key: 'max_daily_tasks', value: '10', description: 'Maximum tasks per player per day' },
    { key: 'auto_approve_tasks', value: 'false', description: 'Automatically approve completed tasks' },
    { key: 'notification_system', value: 'true', description: 'Enable notification system' }
  ];

  defaultConfigs.forEach(config => {
    authDb.run(
      'INSERT OR IGNORE INTO admin_config (config_key, config_value, description) VALUES (?, ?, ?)',
      [config.key, config.value, config.description],
      (err) => {
        if (err) console.error(`Error inserting config ${config.key}:`, err);
      }
    );
  });
};

// Hash password helper
const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

// Verify password helper
const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Get user by username
const getUserByUsername = (username, callback) => {
  authDb.get('SELECT * FROM users WHERE username = ? AND is_active = 1', [username], callback);
};

// Get user by ID
const getUserById = (id, callback) => {
  authDb.get('SELECT * FROM users WHERE id = ? AND is_active = 1', [id], callback);
};

// Update user profile
const updateUserProfile = (userId, profileData, callback) => {
  const { gotify_url, gotify_token, profile_settings, notification_preferences } = profileData;
  
  let sql = 'UPDATE users SET gotify_url = ?, gotify_token = ?, profile_settings = ?';
  let params = [gotify_url, gotify_token, JSON.stringify(profile_settings)];
  
  if (notification_preferences !== undefined) {
    sql += ', notification_preferences = ?';
    params.push(JSON.stringify(notification_preferences));
  }
  
  sql += ' WHERE id = ?';
  params.push(userId);
  
  authDb.run(sql, params, callback);
};

// Update user password
const updateUserPassword = async (userId, newPassword, callback) => {
  const hashedPassword = await hashPassword(newPassword);
  authDb.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId], callback);
};

// Get admin configuration
const getAdminConfig = (callback) => {
  authDb.all('SELECT * FROM admin_config ORDER BY config_key', [], callback);
};

// Update admin configuration
const updateAdminConfig = (configKey, configValue, updatedBy, callback) => {
  authDb.run(
    'UPDATE admin_config SET config_value = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE config_key = ?',
    [configValue, updatedBy, configKey],
    callback
  );
};

// Get all users (admin only)
const getAllUsers = (callback) => {
  authDb.all('SELECT id, username, role, email, created_at, last_login, is_active FROM users ORDER BY created_at', [], callback);
};

// Create user (admin only)
const createUser = ({ username, password, role = 'user', email }, callback) => {
  if (!username || !password) {
    return callback(new Error('Username and password are required'));
  }

  hashPassword(password).then(hashedPassword => {
    authDb.run(
      'INSERT INTO users (username, password, role, email, exp, claimed_rewards, profile_settings) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [username, hashedPassword, role, email, 0, JSON.stringify([]), JSON.stringify({})],
      function(err) {
        if (err) return callback(err);
        callback(null, this.lastID);
      }
    );
  }).catch(callback);
};

// Delete user (admin only)
const deleteUser = (userId, callback) => {
  // First check if user exists and is not the last admin
  authDb.get('SELECT role FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) return callback(err);
    if (!user) return callback(new Error('User not found'));
    
    if (user.role === 'admin') {
      // Check if this is the last admin
      authDb.get('SELECT COUNT(*) as adminCount FROM users WHERE role = ? AND is_active = 1', ['admin'], (err, result) => {
        if (err) return callback(err);
        
        if (result.adminCount <= 1) {
          return callback(new Error('Cannot delete the last admin user'));
        }
        
        // Safe to delete admin - actually delete from database
        authDb.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
          if (err) return callback(err);
          callback(null, this.changes);
        });
      });
    } else {
      // Safe to delete regular user - actually delete from database
      authDb.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
        if (err) return callback(err);
        callback(null, this.changes);
      });
    }
  });
};

// Update player stats
const updatePlayerStats = (userId, exp, claimedRewards, callback) => {
  authDb.run(
    'UPDATE users SET exp = ?, claimed_rewards = ? WHERE id = ?',
    [exp, JSON.stringify(claimedRewards), userId],
    callback
  );
};

// Get player stats
const getPlayerStats = (userId, callback) => {
  authDb.get(
    'SELECT id, username, exp, claimed_rewards FROM users WHERE id = ? AND is_active = 1',
    [userId],
    (err, row) => {
      if (err) return callback(err);
      if (!row) return callback(new Error('User not found'));
      
      callback(null, {
        id: row.id,
        name: row.username,
        exp: row.exp || 0,
        claimedRewards: JSON.parse(row.claimed_rewards || '[]')
      });
    }
  );
};

// Get all player stats
const getAllPlayerStats = (callback) => {
  authDb.all(
    'SELECT id, username, exp, claimed_rewards FROM users WHERE is_active = 1 ORDER BY exp DESC',
    [],
    (err, rows) => {
      if (err) return callback(err);
      
      const stats = rows.map(row => ({
        id: row.id,
        name: row.username,
        exp: row.exp || 0,
        claimedRewards: JSON.parse(row.claimed_rewards || '[]')
      }));
      
      callback(null, stats);
    }
  );
};

// Update user login timestamp
const updateLastLogin = (userId, callback) => {
  authDb.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [userId], callback);
};

// Simplified user database sync (no longer needed but kept for compatibility)
const syncUserDatabases = () => {
  console.log('User database sync completed');
};

module.exports = {
  authDb,
  createUsersTable,
  createAdminConfigTable,
  initializeDefaults,
  hashPassword,
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
};
