// Gotify push notification helper for TaskQuest backend
// Usage: sendGotify('Title', 'Message body')
const https = require('https');
const http = require('http');

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
      path: gotifyUrl.pathname,
      method: 'POST',
      headers: {
        'X-Gotify-Key': token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = (gotifyUrl.protocol === 'https:' ? https : http).request(options, res => {
      // Optionally handle response
    });
    req.on('error', error => {
      // Optionally log error
    });
    req.write(data);
    req.end();
  });
}

module.exports = { sendGotify };
