const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();

async function fixPasswords() {
    const authDb = new sqlite3.Database('./auth.db');
    
    console.log('🔧 Fixing plain text passwords...');
    
    // Get all users with plain text passwords
    const users = await new Promise((resolve, reject) => {
        authDb.all('SELECT id, username, password FROM users', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
    
    for (const user of users) {
        // Check if password is already hashed (bcrypt hashes start with $2b$)
        if (!user.password.startsWith('$2b$')) {
            console.log(`   🔄 Hashing password for user: ${user.username}`);
            const hashedPassword = await bcrypt.hash(user.password, 10);
            
            await new Promise((resolve, reject) => {
                authDb.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            console.log(`   ✅ Password hashed for user: ${user.username}`);
        } else {
            console.log(`   ✅ Password already hashed for user: ${user.username}`);
        }
    }
    
    console.log('🎉 Password fix completed!');
    authDb.close();
}

fixPasswords().catch(console.error);
