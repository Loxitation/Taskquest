# TaskQuest v2.0 Data Migration Script (Fixed Version)
# Migrates JSON data to SQLite databases
# Author: TaskQuest Team
# Version: 2.0.1

Write-Host "🚀 TaskQuest v2.0 Data Migration Script (Fixed)" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

# Check if we're in the right directory
if (!(Test-Path "package.json") -or !(Test-Path "backend") -or !(Test-Path "frontend")) {
    Write-Host "❌ Error: This script must be run from the TaskQuest root directory" -ForegroundColor Red
    Write-Host "   Expected structure: package.json, backend/, frontend/" -ForegroundColor Red
    exit 1
}

# Check for legacy files
$LEGACY_FILES = 0
if (Test-Path "backend/tasks.json") {
    Write-Host "📄 Found legacy tasks.json" -ForegroundColor Yellow
    $LEGACY_FILES++
}
if (Test-Path "backend/playerStats.json") {
    Write-Host "📄 Found legacy playerStats.json" -ForegroundColor Yellow
    $LEGACY_FILES++
}
if (Test-Path "backend/archive.json") {
    Write-Host "📄 Found legacy archive.json" -ForegroundColor Yellow
    $LEGACY_FILES++
}
if (Test-Path "backend/notifications.json") {
    Write-Host "📄 Found legacy notifications.json" -ForegroundColor Yellow
    $LEGACY_FILES++
}

if ($LEGACY_FILES -eq 0) {
    Write-Host "✅ No legacy JSON files found. Migration not needed!" -ForegroundColor Green
    Write-Host "   Your TaskQuest installation is already using the v2.0 database format." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "🔄 Found $LEGACY_FILES legacy file(s) to migrate" -ForegroundColor Cyan
Write-Host ""

# Create backup of existing databases
Write-Host "💾 Creating backup of existing databases..." -ForegroundColor Cyan
Set-Location backend

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

if (Test-Path "auth.db") {
    Copy-Item "auth.db" "auth.db.backup.$timestamp"
    Write-Host "   ✅ auth.db backed up" -ForegroundColor Green
}
if (Test-Path "tasks.db") {
    Copy-Item "tasks.db" "tasks.db.backup.$timestamp"
    Write-Host "   ✅ tasks.db backed up" -ForegroundColor Green
}
if (Test-Path "rewards.db") {
    Copy-Item "rewards.db" "rewards.db.backup.$timestamp"
    Write-Host "   ✅ rewards.db backed up" -ForegroundColor Green
}
if (Test-Path "notifications.db") {
    Copy-Item "notifications.db" "notifications.db.backup.$timestamp"
    Write-Host "   ✅ notifications.db backed up" -ForegroundColor Green
}

Write-Host ""

# Create fixed migration script
$migrationScript = @'
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
                    
                    console.log(`   ✅ Migrated task: ${task.name} (Player: ${task.player})`);
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
                    
                    console.log(`   ✅ Migrated archived task: ${task.name} (EXP: ${task.exp})`);
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
'@

$migrationScript | Out-File -FilePath "migrate_json_data.js" -Encoding utf8

Write-Host "📝 Created fixed migration script..." -ForegroundColor Cyan

# Check dependencies
$nodeExists = Get-Command node -ErrorAction SilentlyContinue
$npmExists = Get-Command npm -ErrorAction SilentlyContinue

if (!$nodeExists) {
    Write-Host "❌ Node.js is required but not installed. Please install Node.js first." -ForegroundColor Red
    exit 1
}

if (!$npmExists) {
    Write-Host "❌ npm is required but not installed. Please install npm first." -ForegroundColor Red
    exit 1
}

Write-Host "📦 Checking dependencies..." -ForegroundColor Cyan
if (!(Test-Path "../node_modules")) {
    Write-Host "   Installing Node.js dependencies..." -ForegroundColor Yellow
    Set-Location ..
    npm install
    Set-Location backend
}
Write-Host "   ✅ Dependencies installed" -ForegroundColor Green
Write-Host ""

# Run migration
Write-Host "🚀 Starting data migration..." -ForegroundColor Cyan
$result = node migrate_json_data.js

# Check if migration was successful
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✨ Migration completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Next steps:" -ForegroundColor Cyan
    Write-Host "   1. Start the server: cd .. ; npm start" -ForegroundColor White
    Write-Host "   2. Login with migrated users (password: password123)" -ForegroundColor White
    Write-Host "   3. Change passwords for all users immediately" -ForegroundColor White
    Write-Host "   4. Verify all data in the web interface" -ForegroundColor White
    Write-Host "   5. Once verified, you can delete the legacy JSON files" -ForegroundColor White
    Write-Host ""
    Write-Host "🗂️  Legacy files location (for backup):" -ForegroundColor Cyan
    if (Test-Path "tasks.json") {
        Write-Host "   • backend/tasks.json" -ForegroundColor White
    }
    if (Test-Path "playerStats.json") {
        Write-Host "   • backend/playerStats.json" -ForegroundColor White
    }
    if (Test-Path "archive.json") {
        Write-Host "   • backend/archive.json" -ForegroundColor White
    }
    if (Test-Path "notifications.json") {
        Write-Host "   • backend/notifications.json" -ForegroundColor White
    }
    Write-Host ""
    Write-Host "🗄️  Database files created/updated:" -ForegroundColor Cyan
    Write-Host "   • backend/auth.db (users and configuration)" -ForegroundColor White
    Write-Host "   • backend/tasks.db (tasks and archive)" -ForegroundColor White
    Write-Host "   • backend/rewards.db (rewards system)" -ForegroundColor White
    Write-Host "   • backend/notifications.db (notifications)" -ForegroundColor White
    Write-Host ""
    Write-Host "🔐 IMPORTANT: All migrated users have the default password ``password123``" -ForegroundColor Yellow
    Write-Host "   They must change their passwords immediately after first login!" -ForegroundColor Yellow
    
    # Clean up temporary files
    Remove-Item "migrate_json_data.js" -ErrorAction SilentlyContinue
} else {
    Write-Host ""
    Write-Host "❌ Migration failed. Please check the error messages above." -ForegroundColor Red
    Write-Host "   The temporary migration script is left in place for debugging." -ForegroundColor Red
    exit 1
}
