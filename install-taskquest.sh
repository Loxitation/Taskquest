#!/bin/bash
# TaskQuest Installer for Debian/Ubuntu/OMV
set -e

# 1. Install Node.js if not present
if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "Node.js already installed."
fi

# 2. Install backend dependencies
cd "$(dirname "$0")/backend"
echo "Installing backend dependencies..."
npm install express body-parser cors socket.io

# 3. Install frontend dependencies (socket.io-client)
cd ../
echo "Installing frontend dependencies..."
npm install socket.io-client

# 4. (Optional) Install pm2 and offer to run as service
read -p "Do you want to install pm2 and run TaskQuest as a background service? (y/n): " pm2ans
if [[ "$pm2ans" =~ ^[Yy]$ ]]; then
  sudo npm install -g pm2
  pm2 start backend/index.js --name taskquest
  pm2 save
  pm2 startup
  echo "TaskQuest is running in the background with pm2."
else
  echo "You can start the server manually with:"
  echo "  cd backend && node index.js"
fi

echo "\nInstallation complete!"
echo "Open your browser and go to: http://<SERVER_IP>:3578"
echo "Replace <SERVER_IP> with your OMV server's IP address."
