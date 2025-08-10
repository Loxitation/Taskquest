#!/bin/bash

# TaskQuest v2.0 Data Migration Script (Fixed Version)
# Migrates JSON data to SQLite databases
# Author: TaskQuest Team
# Version: 2.0.1

echo "🚀 TaskQuest v2.0 Data Migration Script (Fixed)"
echo "================================================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo "❌ Error: This script must be run from the TaskQuest root directory"
    echo "   Expected structure: package.json, backend/, frontend/"
    exit 1
fi

# Check for legacy files
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
    echo "✅ No legacy JSON files found. Migration not needed!"
    echo "   Your TaskQuest installation is already using the v2.0 database format."
    exit 0
fi

echo ""
echo "🔄 Found $LEGACY_FILES legacy file(s) to migrate"
echo ""

# Create backup of existing databases
echo "💾 Creating backup of existing databases..."
cd backend

if [ -f "auth.db" ]; then
    cp "auth.db" "auth.db.backup.$(date +%Y%m%d_%H%M%S)"
    echo "   ✅ auth.db backed up"
fi
if [ -f "tasks.db" ]; then
    cp "tasks.db" "tasks.db.backup.$(date +%Y%m%d_%H%M%S)"
    echo "   ✅ tasks.db backed up"
fi
if [ -f "rewards.db" ]; then
    cp "rewards.db" "rewards.db.backup.$(date +%Y%m%d_%H%M%S)"
    echo "   ✅ rewards.db backed up"
fi
if [ -f "notifications.db" ]; then
    cp "notifications.db" "notifications.db.backup.$(date +%Y%m%d_%H%M%S)"
    echo "   ✅ notifications.db backed up"
fi

echo ""

# Create fixed migration script
cat > migrate_json_data.js << 'EOF'
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

console.log('🔄 Starting JSON to SQLite migration...');

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

// Helper function to hash password
async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

// Main migration function
async function migrate() {
    let migratedCount = 0;
    
    try {
        // 1. Migrate Users from playerStats.json
        console.log('\n👥 Migrating users from playerStats.json...');
        const playerStats = safeParseJSON('./playerStats.json');
        
        if (playerStats.length > 0) {
            const authDb = new sqlite3.Database('./auth.db');
            
            // First, clear any existing users to avoid ID conflicts
            console.log('   🧹 Clearing existing users to preserve ID mapping...');
            await runSQL(authDb, 'DELETE FROM users');
            
            for (const player of playerStats) {
                try {
                    // Determine role: user with original ID 1 becomes admin
                    const role = (player.id === '1' || player.id === 1) ? 'admin' : 'user';
                    
                    // Hash the default password
                    const hashedPassword = await hashPassword('password123');
                    
                    // Insert user with original ID preserved
                    await runSQL(authDb, `
                        INSERT INTO users (id, username, password, exp, claimed_rewards, role, 
                                         gotify_token, gotify_url, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                    `, [
                        parseInt(player.id), // Preserve original ID
                        player.name,
                        hashedPassword, // Properly hashed password
                        player.exp || 0,
                        JSON.stringify(player.claimedRewards || []),
                        role,
                        player.gotifyappapikey || '',
                        player.gotifyserverurl || ''
                    ]);
                    
                    console.log(`   ✅ Migrated user: ${player.name} (ID: ${player.id}, Role: ${role}, EXP: ${player.exp})`);
                    migratedCount++;
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
                            id, name, difficulty, urgency, dueDate, player, status,
                            confirmedBy, minutesWorked, commentary, approver, note,
                            added, exp, archived
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        task.note || '',
                        task.added || new Date().toISOString(),
                        task.exp || 0,
                        0 // not archived
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
                            id, name, difficulty, urgency, dueDate, player, status,
                            confirmedBy, minutesWorked, commentary, approver, note,
                            completedAt, rating, answerCommentary, exp, archived, added
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        task.id,
                        task.name,
                        task.difficulty,
                        task.urgency,
                        task.dueDate,
                        task.player,
                        'completed',
                        task.confirmedBy,
                        task.minutesWorked || 0,
                        task.commentary || '',
                        task.approver || '__anyone__',
                        task.note || '',
                        task.completedAt || new Date().toISOString(),
                        task.rating || 0,
                        task.answerCommentary || '',
                        task.exp || 0,
                        1, // archived
                        task.added || new Date().toISOString()
                    ]);
                    
                    console.log(`   ✅ Migrated archived task: ${task.name} (Player: ${task.player}, EXP: ${task.exp})`);
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
            const notifDb = new sqlite3.Database('./notifications.db');
            
            for (const notif of notifications) {
                try {
                    await runSQL(notifDb, `
                        INSERT OR REPLACE INTO notifications (
                            id, user_id, title, message, type, is_read, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [
                        notif.id,
                        notif.userId || 'system',
                        notif.title || 'Notification',
                        notif.message || '',
                        notif.type || 'info',
                        notif.read ? 1 : 0,
                        notif.timestamp || new Date().toISOString()
                    ]);
                    
                    console.log(`   ✅ Migrated notification: ${notif.title}`);
                    migratedCount++;
                } catch (error) {
                    console.error(`   ❌ Error migrating notification ${notif.title}:`, error.message);
                }
            }
            
            notifDb.close();
        }
        
        console.log('\n🎉 Migration completed successfully!');
        console.log(`📊 Total items migrated: ${migratedCount}`);
        
        console.log('\n⚠️  Important Notes:');
        console.log('   • User with original ID 1 has been made admin');
        console.log('   • All user IDs preserved from original playerStats.json');
        console.log('   • Users migrated with default password - they should change it');
        console.log('   • Gotify settings preserved from playerStats.json');
        console.log('   • All task history and ratings preserved');
        console.log('   • Legacy JSON files are still present (backup purposes)');
        
        console.log('\n🔐 Default login credentials for migrated users:');
        console.log('   Username: [original name] | Password: password123');
        console.log('   Users should change their passwords immediately after login!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

// Run migration
migrate();
EOF

echo "📝 Created fixed migration script..."

# Check dependencies
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed. Please install Node.js first."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm is required but not installed. Please install npm first."
    exit 1
fi

echo "📦 Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "   Installing Node.js dependencies..."
    cd ..
    npm install
    cd backend
fi
echo "   ✅ Dependencies installed"
echo ""

# Run migration
echo "🚀 Starting data migration..."
node migrate_json_data.js

# Check if migration was successful
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
    if [ -f "tasks.json" ]; then
        echo "   • backend/tasks.json"
    fi
    if [ -f "playerStats.json" ]; then
        echo "   • backend/playerStats.json"
    fi
    if [ -f "archive.json" ]; then
        echo "   • backend/archive.json"
    fi
    if [ -f "notifications.json" ]; then
        echo "   • backend/notifications.json"
    fi
    echo ""
    echo "🗄️  Database files created/updated:"
    echo "   • backend/auth.db (users and configuration)"
    echo "   • backend/tasks.db (tasks and archive)"
    echo "   • backend/rewards.db (rewards system)"
    echo "   • backend/notifications.db (notifications)"
    echo ""
    echo "🔐 IMPORTANT: All migrated users have the default password 'password123'"
    echo "   They must change their passwords immediately after first login!"
    
    # Clean up temporary files
    rm migrate_json_data.js
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    echo "   The temporary migration script is left in place for debugging."
    exit 1
fi
