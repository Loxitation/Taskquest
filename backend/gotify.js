// Gotify push notification helper for TaskQuest backend (updated for auth system)
// Usage: sendGotify('Title', 'Message body')
const https = require('https');
const http = require('http');
const path = require('path');
const { authDb } = require('./auth.db.js');

function sendGotify(title, message, targets = [], priority = 5) {
  if (!Array.isArray(targets) || targets.length === 0) return;
  targets.forEach(({ url, token }) => {
    if (!url || !token) return;
    const gotifyUrl = new URL(url);
    const data = JSON.stringify({
      title,
      message,
      priority
    });
    const options = {
      hostname: gotifyUrl.hostname,
      port: gotifyUrl.port || (gotifyUrl.protocol === 'https:' ? 443 : 80),
      path: gotifyUrl.pathname.endsWith('/') ? gotifyUrl.pathname + 'message' : gotifyUrl.pathname + '/message',
      method: 'POST',
      headers: {
        'X-Gotify-Key': token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = (gotifyUrl.protocol === 'https:' ? https : http).request(options, res => {
      // Optionally handle response
      if (res.statusCode !== 200) {
        console.warn(`Gotify notification failed: ${res.statusCode}`);
      }
    });
    req.on('error', error => {
      console.error('Gotify notification error:', error.message);
    });
    req.write(data);
    req.end();
  });
}

function getGotifyTargetForUser(userId, callback) {
  authDb.get('SELECT gotify_url, gotify_token FROM users WHERE id = ? AND is_active = 1', [userId], (err, row) => {
    if (err || !row || !row.gotify_token || !row.gotify_url) return callback(null);
    callback({ url: row.gotify_url, token: row.gotify_token });
  });
}

// Get all active users with Gotify settings for broadcast notifications
function getAllGotifyTargets(callback) {
  authDb.all('SELECT gotify_url, gotify_token FROM users WHERE is_active = 1 AND gotify_url IS NOT NULL AND gotify_token IS NOT NULL', [], (err, rows) => {
    if (err) return callback([]);
    const targets = rows
      .filter(row => row.gotify_url && row.gotify_token)
      .map(row => ({ url: row.gotify_url, token: row.gotify_token }));
    callback(targets);
  });
}

module.exports = { sendGotify, getGotifyTargetForUser, getAllGotifyTargets };
