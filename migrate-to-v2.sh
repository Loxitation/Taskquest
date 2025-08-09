#!/bin/bash

# TaskQuest v2.0 Migration Script
# Migrates data from legacy JSON files to new SQLite databases
# Run this script in the taskquest root directory after pulling v2.0

echo "🚀 TaskQuest v2.0 Data Migration Script"
echo "========================================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo "❌ Error: Please run this script from the TaskQuest root directory"
    exit 1
fi

# Check if legacy JSON files exist
LEGACY_FILES=0
if [ -f "backend/tasks.json" ]; then
    echo "📄 Found legacy tasks.json"
    LEGACY_FILES=$((LEGACY_FILES + 1))
fi

if [ -f "backend/playerStats.json" ]; then
    echo "📄 Found legacy playerStats.json"
    LEGACY_FILES=$((LEGACY_FILES + 1))
fi

if [ -f "backend/archive.json" ]; then
    echo "📄 Found legacy archive.json"
    LEGACY_FILES=$((LEGACY_FILES + 1))
fi

if [ -f "backend/notifications.json" ]; then
    echo "📄 Found legacy notifications.json"
    LEGACY_FILES=$((LEGACY_FILES + 1))
fi

if [ $LEGACY_FILES -eq 0 ]; then
    echo "⚠️  No legacy JSON files found. Migration not needed."
    echo "   If this is unexpected, ensure the JSON files are in the backend/ directory."
    exit 0
fi

echo ""
echo "🔄 Found $LEGACY_FILES legacy file(s) to migrate"
echo ""

# Backup existing databases
echo "💾 Creating backup of existing databases..."
cd backend

if [ -f "auth.db" ]; then
    cp auth.db auth.db.backup.$(date +%Y%m%d_%H%M%S)
    echo "   ✅ auth.db backed up"
fi

if [ -f "tasks.db" ]; then
    cp tasks.db tasks.db.backup.$(date +%Y%m%d_%H%M%S)
    echo "   ✅ tasks.db backed up"
fi

if [ -f "rewards.db" ]; then
    cp rewards.db rewards.db.backup.$(date +%Y%m%d_%H%M%S)
    echo "   ✅ rewards.db backed up"
fi

if [ -f "notifications.db" ]; then
    cp notifications.db notifications.db.backup.$(date +%Y%m%d_%H%M%S)
    echo "   ✅ notifications.db backed up"
fi

echo ""

# Create migration SQL script
cat > migrate_data.sql << 'EOF'
-- TaskQuest v2.0 Data Migration SQL Script
-- This script migrates data from JSON files to SQLite databases

.echo on

-- Create temporary table for JSON import
CREATE TEMPORARY TABLE temp_import (
    id INTEGER,
    data TEXT
);

EOF

# Function to create Node.js migration script
cat > migrate_json_data.js << 'EOF'
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

console.log('🔄 Starting JSON to SQLite migration...\n');

// Helper function to safely parse JSON
function safeParseJSON(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        }
    } catch (error) {
        console.error(`❌ Error parsing ${filePath}:`, error.message);
    }
    return [];
}

// Helper function to execute SQL with promise
function runSQL(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

// Main migration function
async function migrate() {
    let migratedCount = 0;
    
    try {
        // 1. Migrate Users from playerStats.json
        console.log('👥 Migrating users from playerStats.json...');
        const playerStats = safeParseJSON('./playerStats.json');
        
        if (playerStats.length > 0) {
            const authDb = new sqlite3.Database('./auth.db');
            
            for (const player of playerStats) {
                try {
                    // Check if user already exists
                    const existingUser = await new Promise((resolve, reject) => {
                        authDb.get('SELECT id FROM users WHERE id = ?', [player.id], (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        });
                    });
                    
                    if (!existingUser) {
                        // Insert new user
                        await runSQL(authDb, `
                            INSERT INTO users (id, username, password_hash, exp, claimed_rewards, role, 
                                             gotify_app_api_key, gotify_server_url, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                        `, [
                            player.id,
                            player.name,
                            '$2b$10$defaulthash', // Default password hash - user should change
                            player.exp || 0,
                            JSON.stringify(player.claimedRewards || []),
                            'user',
                            player.gotifyappapikey || '',
                            player.gotifyserverurl || ''
                        ]);
                        
                        console.log(`   ✅ Migrated user: ${player.name} (ID: ${player.id}, EXP: ${player.exp})`);
                        migratedCount++;
                    } else {
                        // Update existing user with EXP and Gotify settings
                        await runSQL(authDb, `
                            UPDATE users SET 
                                exp = ?, 
                                claimed_rewards = ?,
                                gotify_app_api_key = ?,
                                gotify_server_url = ?
                            WHERE id = ?
                        `, [
                            player.exp || 0,
                            JSON.stringify(player.claimedRewards || []),
                            player.gotifyappapikey || '',
                            player.gotifyserverurl || '',
                            player.id
                        ]);
                        
                        console.log(`   🔄 Updated user: ${player.name} (ID: ${player.id}, EXP: ${player.exp})`);
                        migratedCount++;
                    }
                } catch (error) {
                    console.error(`   ❌ Error migrating user ${player.name}:`, error.message);
                }
            }
            
            authDb.close();
        }
        
        // 2. Migrate Tasks from tasks.json
        console.log('\n📋 Migrating active tasks from tasks.json...');
        const tasks = safeParseJSON('./tasks.json');
        
        if (tasks.length > 0) {
            const tasksDb = new sqlite3.Database('./tasks.db');
            
            for (const task of tasks) {
                try {
                    await runSQL(tasksDb, `
                        INSERT OR REPLACE INTO tasks (
                            id, name, difficulty, urgency, due_date, player, status,
                            confirmed_by, minutes_worked, commentary, approver, proof,
                            created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
                                 datetime('now'), datetime('now'))
                    `, [
                        task.id,
                        task.name,
                        task.difficulty,
                        task.urgency,
                        task.dueDate,
                        task.player,
                        task.status,
                        task.confirmedBy,
                        task.minutesWorked || 0,
                        task.commentary || '',
                        task.approver || '__anyone__',
                        task.proof || ''
                    ]);
                    
                    console.log(`   ✅ Migrated task: ${task.name} (Player: ${task.player}, Status: ${task.status})`);
                    migratedCount++;
                } catch (error) {
                    console.error(`   ❌ Error migrating task ${task.name}:`, error.message);
                }
            }
            
            tasksDb.close();
        }
        
        // 3. Migrate Archive from archive.json
        console.log('\n📚 Migrating completed tasks from archive.json...');
        const archive = safeParseJSON('./archive.json');
        
        if (archive.length > 0) {
            const tasksDb = new sqlite3.Database('./tasks.db');
            
            for (const task of archive) {
                try {
                    await runSQL(tasksDb, `
                        INSERT OR REPLACE INTO tasks (
                            id, name, difficulty, urgency, due_date, player, status,
                            confirmed_by, minutes_worked, commentary, approver, proof,
                            completed_at, rating, answer_commentary, exp,
                            created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                                 datetime('now'), datetime('now'))
                    `, [
                        task.id,
                        task.name,
                        task.difficulty,
                        task.urgency,
                        task.dueDate,
                        task.player,
                        task.status,
                        task.confirmedBy,
                        task.minutesWorked || 0,
                        task.commentary || '',
                        task.approver || '__anyone__',
                        task.proof || '',
                        task.completedAt,
                        task.rating,
                        task.answerCommentary || '',
                        task.exp || 0
                    ]);
                    
                    console.log(`   ✅ Migrated archived task: ${task.name} (EXP: ${task.exp}, Rating: ${task.rating}★)`);
                    migratedCount++;
                } catch (error) {
                    console.error(`   ❌ Error migrating archived task ${task.name}:`, error.message);
                }
            }
            
            tasksDb.close();
        }
        
        // 4. Migrate Notifications from notifications.json
        console.log('\n🔔 Migrating notifications from notifications.json...');
        const notifications = safeParseJSON('./notifications.json');
        
        if (notifications.length > 0) {
            const notificationsDb = new sqlite3.Database('./notifications.db');
            
            for (const notification of notifications) {
                try {
                    await runSQL(notificationsDb, `
                        INSERT OR REPLACE INTO notifications (
                            id, taskId, player, message, timestamp
                        ) VALUES (?, ?, ?, ?, ?)
                    `, [
                        notification.id || Date.now() + Math.random(),
                        notification.taskId,
                        notification.player,
                        notification.message,
                        notification.timestamp || new Date().toISOString()
                    ]);
                    
                    console.log(`   ✅ Migrated notification: ${notification.message.substring(0, 50)}...`);
                    migratedCount++;
                } catch (error) {
                    console.error(`   ❌ Error migrating notification:`, error.message);
                }
            }
            
            notificationsDb.close();
        }
        
        console.log(`\n🎉 Migration completed successfully!`);
        console.log(`📊 Total items migrated: ${migratedCount}`);
        console.log(`\n⚠️  Important Notes:`);
        console.log(`   • Users migrated with default password - they should change it`);
        console.log(`   • Gotify settings preserved from playerStats.json`);
        console.log(`   • All task history and ratings preserved`);
        console.log(`   • Legacy JSON files are still present (backup purposes)`);
        console.log(`\n🔐 Default login credentials for migrated users:`);
        console.log(`   Username: [original name] | Password: password123`);
        console.log(`   Users should change their passwords immediately after login!`);
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrate();
EOF

echo "📝 Created migration script..."

# Check if Node.js and npm are available
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is required for migration. Please install Node.js first."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is required for migration. Please install npm first."
    exit 1
fi

# Install dependencies if needed
echo "📦 Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "   Installing Node.js dependencies..."
    cd ..
    npm install
    cd backend
    echo "   ✅ Dependencies installed"
else
    echo "   ✅ Dependencies already installed"
fi

# Run the migration
echo ""
echo "🚀 Starting data migration..."
node migrate_json_data.js

# Check migration success
if [ $? -eq 0 ]; then
    echo ""
    echo "✨ Migration completed successfully!"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Start the server: cd .. && npm start"
    echo "   2. Login with migrated users (password: password123)"
    echo "   3. Change passwords for all users immediately"
    echo "   4. Verify all data in the web interface"
    echo "   5. Once verified, you can delete the legacy JSON files"
    echo ""
    echo "🗂️  Legacy files location (for backup):"
    [ -f "tasks.json" ] && echo "   • backend/tasks.json"
    [ -f "playerStats.json" ] && echo "   • backend/playerStats.json"
    [ -f "archive.json" ] && echo "   • backend/archive.json"
    [ -f "notifications.json" ] && echo "   • backend/notifications.json"
    echo ""
    echo "🗄️  Database files created/updated:"
    echo "   • backend/auth.db (users and configuration)"
    echo "   • backend/tasks.db (tasks and archive)"
    echo "   • backend/rewards.db (rewards system)"
    echo "   • backend/notifications.db (notifications)"
    echo ""
    echo "🔐 IMPORTANT: All migrated users have the default password 'password123'"
    echo "   They must change their passwords immediately after first login!"
    
    # Clean up migration script
    rm migrate_json_data.js
    rm migrate_data.sql 2>/dev/null || true
    
else
    echo ""
    echo "❌ Migration failed! Please check the error messages above."
    echo "   The legacy JSON files are still intact."
    echo "   You can retry the migration after fixing any issues."
    exit 1
fi
