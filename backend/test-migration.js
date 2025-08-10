const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

console.log('🧪 Testing ID preservation migration...');

// Helper function to execute SQL with promise
function runSQL(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

async function testMigration() {
    const authDb = new sqlite3.Database('./auth.db');
    
    // Show current users
    console.log('\n📋 Current users:');
    const currentUsers = await new Promise((resolve, reject) => {
        authDb.all('SELECT id, username, role, exp FROM users ORDER BY id', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
    currentUsers.forEach(user => {
        console.log(`   ID: ${user.id}, Username: ${user.username}, Role: ${user.role}, EXP: ${user.exp}`);
    });
    
    // Load playerStats.json
    const playerStats = JSON.parse(fs.readFileSync('./playerStats.json', 'utf8'));
    console.log('\n📄 Users from playerStats.json:');
    playerStats.forEach(player => {
        console.log(`   ID: ${player.id}, Name: ${player.name}, EXP: ${player.exp}`);
    });
    
    // Clear existing users and migrate with preserved IDs
    console.log('\n🧹 Clearing existing users and migrating with preserved IDs...');
    await runSQL(authDb, 'DELETE FROM users');
    
    for (const player of playerStats) {
        const role = (player.id === '1' || player.id === 1) ? 'admin' : 'user';
        
        await runSQL(authDb, `
            INSERT INTO users (id, username, password, exp, claimed_rewards, role, 
                             gotify_token, gotify_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `, [
            parseInt(player.id), // Preserve original ID
            player.name,
            'password123',
            player.exp || 0,
            JSON.stringify(player.claimedRewards || []),
            role,
            player.gotifyappapikey || '',
            player.gotifyserverurl || ''
        ]);
        
        console.log(`   ✅ Migrated: ${player.name} (ID: ${player.id}, Role: ${role})`);
    }
    
    // Show final result
    console.log('\n✨ Final users after migration:');
    const finalUsers = await new Promise((resolve, reject) => {
        authDb.all('SELECT id, username, role, exp FROM users ORDER BY id', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
    finalUsers.forEach(user => {
        console.log(`   ID: ${user.id}, Username: ${user.username}, Role: ${user.role}, EXP: ${user.exp}`);
    });
    
    authDb.close();
    console.log('\n🎉 Test completed!');
}

testMigration().catch(console.error);
