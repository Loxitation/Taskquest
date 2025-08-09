#!/bin/bash
# TaskQuest Enhanced Installer for Debian/Ubuntu/OMV
set -e

echo "🧙‍♂️ TaskQuest Installation Starting..."

# 1. Install Node.js if not present
if ! command -v node >/dev/null 2>&1; then
  echo "📦 Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "✅ Node.js already installed: $(node --version)"
fi

# 2. Install SQLite3 if not present
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "📦 Installing SQLite3..."
  sudo apt-get update
  sudo apt-get install -y sqlite3
else
  echo "✅ SQLite3 already installed: $(sqlite3 --version)"
fi

# 3. Install backend dependencies
cd "$(dirname "$0")/backend"
echo "📦 Installing backend dependencies..."
npm install express body-parser cors socket.io sqlite3 bcrypt express-session

# 4. Install frontend dependencies
cd ../
echo "📦 Installing frontend dependencies..."
npm install socket.io-client

# 5. Initialize databases and create admin user
echo "🗄️ Initializing databases..."
cd backend
node -e "
const { createUsersTable, createAdminConfigTable, initializeDefaults } = require('./auth.db.js');
(async () => {
  try {
    await createUsersTable();
    await createAdminConfigTable();
    await initializeDefaults();
    console.log('✅ Database initialization completed');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
})();
"

# 6. (Optional) Install pm2 and offer to run as service
read -p "🔧 Do you want to install pm2 and run TaskQuest as a background service? (y/n): " pm2ans
if [[ "$pm2ans" =~ ^[Yy]$ ]]; then
  echo "📦 Installing PM2..."
  sudo npm install -g pm2
  pm2 start index.js --name taskquest
  pm2 save
  pm2 startup
  echo "🚀 TaskQuest is now running as a background service"
  echo "📊 Use 'pm2 status' to check status"
  echo "📋 Use 'pm2 logs taskquest' to view logs"
else
  echo "🚀 To start TaskQuest manually:"
  echo "   cd $(pwd)"
  echo "   node index.js"
fi

echo ""
echo "🎉 TaskQuest installation completed!"
echo "🌐 Access TaskQuest at: http://localhost:3578"
echo "👤 Default admin credentials: admin/admin"
echo "🔧 Admin panel: http://localhost:3578/admin.html"
  echo "TaskQuest is running in the background with pm2."
else
  echo "You can start the server manually with:"
  echo "  cd backend && node index.js"
fi

echo "\nInstallation complete!"
echo "Open your browser and go to: http://<SERVER_IP>:3578"
echo "Replace <SERVER_IP> with your OMV server's IP address."
