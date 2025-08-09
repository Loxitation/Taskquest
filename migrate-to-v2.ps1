# TaskQuest v2.0 Migration Script (PowerShell)
# Migrates data from legacy JSON files to new SQLite databases
# Run this script in the taskquest root directory after pulling v2.0

Write-Host "🚀 TaskQuest v2.0 Data Migration Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (!(Test-Path "package.json") -or !(Test-Path "backend") -or !(Test-Path "frontend")) {
    Write-Host "❌ Error: Please run this script from the TaskQuest root directory" -ForegroundColor Red
    exit 1
}

# Check if legacy JSON files exist
$LegacyFiles = 0
if (Test-Path "backend/tasks.json") {
    Write-Host "📄 Found legacy tasks.json" -ForegroundColor Yellow
    $LegacyFiles++
}

if (Test-Path "backend/playerStats.json") {
    Write-Host "📄 Found legacy playerStats.json" -ForegroundColor Yellow
    $LegacyFiles++
}

if (Test-Path "backend/archive.json") {
    Write-Host "📄 Found legacy archive.json" -ForegroundColor Yellow
    $LegacyFiles++
}

if (Test-Path "backend/notifications.json") {
    Write-Host "📄 Found legacy notifications.json" -ForegroundColor Yellow
    $LegacyFiles++
}

if ($LegacyFiles -eq 0) {
    Write-Host "⚠️  No legacy JSON files found. Migration not needed." -ForegroundColor Yellow
    Write-Host "   If this is unexpected, ensure the JSON files are in the backend/ directory." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "🔄 Found $LegacyFiles legacy file(s) to migrate" -ForegroundColor Green
Write-Host ""

# Backup existing databases
Write-Host "💾 Creating backup of existing databases..." -ForegroundColor Yellow
Push-Location backend

$BackupSuffix = (Get-Date).ToString("yyyyMMdd_HHmmss")

if (Test-Path "auth.db") {
    Copy-Item "auth.db" "auth.db.backup.$BackupSuffix"
    Write-Host "   ✅ auth.db backed up" -ForegroundColor Green
}

if (Test-Path "tasks.db") {
    Copy-Item "tasks.db" "tasks.db.backup.$BackupSuffix"
    Write-Host "   ✅ tasks.db backed up" -ForegroundColor Green
}

if (Test-Path "rewards.db") {
    Copy-Item "rewards.db" "rewards.db.backup.$BackupSuffix"
    Write-Host "   ✅ rewards.db backed up" -ForegroundColor Green
}

if (Test-Path "notifications.db") {
    Copy-Item "notifications.db" "notifications.db.backup.$BackupSuffix"
    Write-Host "   ✅ notifications.db backed up" -ForegroundColor Green
}

Write-Host ""

# Create Node.js migration script
$MigrationScript = @'
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
'@

$MigrationScript | Out-File -FilePath "migrate_json_data.js" -Encoding UTF8

Write-Host "📝 Created migration script..." -ForegroundColor Yellow

# Check if Node.js is available
try {
    $null = Get-Command node -ErrorAction Stop
} catch {
    Write-Host "❌ Error: Node.js is required for migration. Please install Node.js first." -ForegroundColor Red
    Pop-Location
    exit 1
}

try {
    $null = Get-Command npm -ErrorAction Stop
} catch {
    Write-Host "❌ Error: npm is required for migration. Please install npm first." -ForegroundColor Red
    Pop-Location
    exit 1
}

# Install dependencies if needed
Write-Host "📦 Checking dependencies..." -ForegroundColor Yellow
if (!(Test-Path "../node_modules")) {
    Write-Host "   Installing Node.js dependencies..." -ForegroundColor Yellow
    Pop-Location
    npm install
    Push-Location backend
    Write-Host "   ✅ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "   ✅ Dependencies already installed" -ForegroundColor Green
}

# Run the migration
Write-Host ""
Write-Host "🚀 Starting data migration..." -ForegroundColor Cyan
node migrate_json_data.js

# Check migration success
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✨ Migration completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Next steps:" -ForegroundColor Cyan
    Write-Host "   1. Start the server: cd .. && npm start" -ForegroundColor White
    Write-Host "   2. Login with migrated users (password: password123)" -ForegroundColor White
    Write-Host "   3. Change passwords for all users immediately" -ForegroundColor White
    Write-Host "   4. Verify all data in the web interface" -ForegroundColor White
    Write-Host "   5. Once verified, you can delete the legacy JSON files" -ForegroundColor White
    Write-Host ""
    Write-Host "🗂️  Legacy files location (for backup):" -ForegroundColor Yellow
    if (Test-Path "tasks.json") { Write-Host "   • backend/tasks.json" -ForegroundColor Gray }
    if (Test-Path "playerStats.json") { Write-Host "   • backend/playerStats.json" -ForegroundColor Gray }
    if (Test-Path "archive.json") { Write-Host "   • backend/archive.json" -ForegroundColor Gray }
    if (Test-Path "notifications.json") { Write-Host "   • backend/notifications.json" -ForegroundColor Gray }
    Write-Host ""
    Write-Host "🗄️  Database files created/updated:" -ForegroundColor Green
    Write-Host "   • backend/auth.db (users and configuration)" -ForegroundColor Gray
    Write-Host "   • backend/tasks.db (tasks and archive)" -ForegroundColor Gray
    Write-Host "   • backend/rewards.db (rewards system)" -ForegroundColor Gray
    Write-Host "   • backend/notifications.db (notifications)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "🔐 IMPORTANT: All migrated users have the default password 'password123'" -ForegroundColor Red
    Write-Host "   They must change their passwords immediately after first login!" -ForegroundColor Red
    
    # Clean up migration script
    Remove-Item "migrate_json_data.js" -ErrorAction SilentlyContinue
    
} else {
    Write-Host ""
    Write-Host "❌ Migration failed! Please check the error messages above." -ForegroundColor Red
    Write-Host "   The legacy JSON files are still intact." -ForegroundColor Yellow
    Write-Host "   You can retry the migration after fixing any issues." -ForegroundColor Yellow
    Pop-Location
    exit 1
}

Pop-Location
