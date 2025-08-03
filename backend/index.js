const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { sendGotify } = require('./gotify');

const app = express();
const PORT = 3578;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// JSON-Dateien
const TASKS_FILE = path.join(__dirname, 'tasks.json');
const ARCHIVE_FILE = path.join(__dirname, 'archive.json');
const PLAYER_STATS_FILE = path.join(__dirname, 'playerStats.json');
const NOTIFICATIONS_FILE = path.join(__dirname, 'notifications.json');

// --- SOCKET.IO SETUP ---
const server = http.createServer(app);
const io = new Server(server);

function emitDataChanged() {
  io.emit('dataChanged');
}

// Helper
function ensureFileExists(file, defaultContent = []) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultContent, null, 2), 'utf8');
  }
}

function readJSON(file) {
  ensureFileExists(file, []);
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  ensureFileExists(file, []);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function emitNotification(notification) {
  // Save notification to file
  let notifications = readJSON(NOTIFICATIONS_FILE);
  notifications.push(notification);
  writeJSON(NOTIFICATIONS_FILE, notifications);
  io.emit('notification', notification); // Real-time to all clients
}

// GET alle Tasks
app.get('/api/tasks', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const tasks = readJSON(TASKS_FILE);
  res.json(tasks);
});

// POST neuer Task
app.post('/api/tasks', (req, res) => {
  const tasks = readJSON(TASKS_FILE);
  const newTask = {
    ...req.body,
    id: Date.now(),
    status: 'open',
    confirmedBy: null
  };
  tasks.push(newTask);
  writeJSON(TASKS_FILE, tasks);
  emitDataChanged();
  res.json({ success: true, task: newTask });
});

// POST: Aufgabe als erledigt markieren
app.post('/api/mark-done/:id', (req, res) => {
  const tasks = readJSON(TASKS_FILE);
  const task = tasks.find(t => t.id === parseInt(req.params.id));
  if (task && task.player === req.body.player) {
    task.status = 'done';
    task.note = req.body.note || "";
    task.hours = req.body.hours || 0;
    writeJSON(TASKS_FILE, tasks);
    emitDataChanged();
    res.json({ success: true });
  } else {
    res.status(403).json({ error: 'Task nicht gefunden oder unberechtigt' });
  }
});

// PATCH: Update a task by ID
app.patch('/api/tasks/:id', (req, res) => {
  const taskId = parseInt(req.params.id);
  const tasks = readJSON(TASKS_FILE);
  const index = tasks.findIndex(t => t.id === taskId);
  if (index === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }
  const prevStatus = tasks[index].status;
  tasks[index] = { ...tasks[index], ...req.body };
  writeJSON(TASKS_FILE, tasks);
  emitDataChanged();
  // Push notification if status changed to 'submitted'
  if (prevStatus !== 'submitted' && tasks[index].status === 'submitted') {
    let stats = readJSON(PLAYER_STATS_FILE);
    const ownerId = tasks[index].player || tasks[index].playerId;
    const approverId = tasks[index].approver;
    const owner = stats.find(s => s.id === ownerId);
    if (approverId === '__anyone__') {
      // Notify all users except the owner
      const targets = stats.filter(s => s.id !== ownerId && s.gotifyappapikey && s.gotifyserverurl)
        .map(s => ({ url: s.gotifyserverurl, token: s.gotifyappapikey }));
      const task = tasks[index];
      const details = [
        `Aufgabe: ${task.name}`,
        owner ? `Von: ${owner.name}` : '',
        task.description ? `Beschreibung: ${task.description}` : '',
        task.difficulty ? `Schwierigkeit: ${task.difficulty}` : '',
        task.urgency ? `Dringlichkeit: ${task.urgency}` : ''
      ].filter(Boolean).join('\n');
      sendGotify(
        'Neue Aufgabe zur Freigabe',
        `Eine Aufgabe wurde zur Freigabe eingereicht.\n${details}`,
        targets
      );
    } else {
      // Notify only the selected approver
      const approver = stats.find(s => s.id === approverId);
      if (approver && approver.gotifyappapikey && approver.gotifyserverurl) {
        const task = tasks[index];
        const details = [
          `Aufgabe: ${task.name}`,
          owner ? `Von: ${owner.name}` : '',
          task.description ? `Beschreibung: ${task.description}` : '',
          task.difficulty ? `Schwierigkeit: ${task.difficulty}` : '',
          task.urgency ? `Dringlichkeit: ${task.urgency}` : ''
        ].filter(Boolean).join('\n');
        sendGotify(
          'Neue Aufgabe zur Freigabe',
          `Dir wurde eine Aufgabe zur Freigabe eingereicht.\n${details}`,
          [{ url: approver.gotifyserverurl, token: approver.gotifyappapikey }]
        );
      }
    }
  }
  res.json({ success: true, task: tasks[index] });
});

// POST: Aufgabe freigeben (Bestätigung durch Gegner)
app.post('/api/confirm/:id', (req, res) => {
  const taskId = parseInt(req.params.id);
  const player = req.body.player;
  const rating = typeof req.body.rating === 'number' ? req.body.rating : parseInt(req.body.rating);
  const answerCommentary = req.body.answerCommentary || "";
  const tasks = readJSON(TASKS_FILE);
  const index = tasks.findIndex(t => t.id === taskId);

  if (index !== -1 && tasks[index].status === 'submitted') {
    // Allow if player is the approver, or if approver is '__anyone__' and player is not the owner
    const ownerId = tasks[index].player || tasks[index].playerId;
    const isOwner = ownerId === player;
    const isApprover = tasks[index].approver === player;
    const isAnyone = tasks[index].approver === '__anyone__' && !isOwner;
    if (!(isApprover || isAnyone)) {
      return res.status(403).json({ error: 'Nicht berechtigt, diese Aufgabe zu bestätigen.' });
    }
    if (tasks[index].approver === '__anyone__') {
      tasks[index].approver = player; // Set actual approver
    }
    // Calculate EXP for the task
    const task = tasks[index];
    let exp = 10 * (task.difficulty || 1);
    if (task.urgency && task.urgency > 0) exp += 5 * task.urgency;
    if (task.minutesWorked) exp += parseInt(task.minutesWorked);
    if (task.urgency && task.urgency > 0 && task.dueDate && new Date() <= new Date(task.dueDate)) {
      exp += 20;
    }
    if (task.dueDate && new Date() > new Date(task.dueDate)) {
      const daysLate = Math.ceil((new Date() - new Date(task.dueDate)) / (1000*3600*24));
      exp = Math.floor(exp * Math.pow(0.8, daysLate));
      if (daysLate >= 21) exp = Math.max(-10, exp);
    }
    if (task.urgency === 0) {
      exp = Math.floor(exp * 0.5);
    }
    exp = Math.max(1, exp);
    // Award EXP to owner
    let stats = readJSON(PLAYER_STATS_FILE);
    let owner = stats.find(s => s.id === ownerId);
    if (owner) {
      const prevExp = owner.exp || 0;
      owner.exp = prevExp + exp;
      writeJSON(PLAYER_STATS_FILE, stats);
      // --- Level up notification logic (duplicate from /api/player-stats) ---
      const getLevel = (exp) => Math.floor(1 + Math.log2(1 + exp / 100));
      let oldLevel = getLevel(prevExp);
      let newLevel = getLevel(owner.exp);
      if (newLevel > oldLevel) {
        for (let l = oldLevel + 1; l <= newLevel; l++) {
          emitNotification({
            type: 'levelup',
            playerId: ownerId,
            playerName: owner.name,
            level: l,
            timestamp: Date.now(),
            seenBy: []
          });
        }
        // Gotify push for level-up: all users, special message for leveler
        const allPlayers = readJSON(PLAYER_STATS_FILE);
        allPlayers.forEach(p => {
          if (p.gotifyappapikey && p.gotifyserverurl) {
            if (p.id === ownerId) {
              sendGotify(
                'Level Up!',
                `Glückwunsch! Du hast Level ${newLevel} erreicht!`,
                [{ url: p.gotifyserverurl, token: p.gotifyappapikey }]
              );
            } else {
              sendGotify(
                'Level Up!',
                `Krieg deinen Arsch hoch! ${owner.name} hat Level ${newLevel} erreicht!`,
                [{ url: p.gotifyserverurl, token: p.gotifyappapikey }]
              );
            }
          }
        });
      }
    }
    const completed = {
      ...tasks[index],
      confirmedBy: player,
      completedAt: new Date(),
      status: 'done',
      rating: rating,
      answerCommentary,
      exp
    };
    const archived = readJSON(ARCHIVE_FILE);
    archived.push(completed);
    writeJSON(ARCHIVE_FILE, archived);
    tasks.splice(index, 1);
    writeJSON(TASKS_FILE, tasks);
    emitDataChanged();
    // Push notification for approval to the owner only, with details
    if (owner && owner.gotifyappapikey && owner.gotifyserverurl) {
      const approver = stats.find(s => s.id === player);
      // Show 5-star rating as stars
      let stars = '';
      if (typeof rating === 'number' && !isNaN(rating)) {
        stars = '★'.repeat(Math.max(1, Math.min(5, rating))) + '☆'.repeat(5 - Math.max(1, Math.min(5, rating)));
      }
      const details = [
        `Aufgabe: ${completed.name}`,
        approver ? `Bestätigt von: ${approver.name}` : '',
        `EXP erhalten: ${exp}`,
        stars ? `Bewertung: ${stars}` : '',
        completed.description ? `Beschreibung: ${completed.description}` : ''
      ].filter(Boolean).join('\n');
      sendGotify(
        'Aufgabe bestätigt',
        `Deine Aufgabe wurde genehmigt und abgeschlossen.\n${details}`,
        [{ url: owner.gotifyserverurl, token: owner.gotifyappapikey }]
      );
    }
    res.json({ success: true });
  } else {
    res.status(403).json({ error: 'Task nicht vorhanden oder nicht zur Freigabe bereit.' });
  }
});

// DELETE: Remove a task by ID
app.delete('/api/tasks/:id', (req, res) => {
  const taskId = parseInt(req.params.id);
  let tasks = readJSON(TASKS_FILE);
  const initialLength = tasks.length;
  tasks = tasks.filter(t => t.id !== taskId);
  writeJSON(TASKS_FILE, tasks);
  emitDataChanged();
  res.json({ success: tasks.length < initialLength });
});

// POST: Clear all tasks
app.post('/api/tasks/clear', (req, res) => {
  writeJSON(TASKS_FILE, []);
  emitDataChanged();
  res.json({ success: true });
});

// POST: Clear all archive
app.post('/api/archive/clear', (req, res) => {
  writeJSON(ARCHIVE_FILE, []);
  emitDataChanged();
  res.json({ success: true });
});

// GET Archiv
app.get('/api/archive', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const archive = readJSON(ARCHIVE_FILE);
  res.json(archive);
});

// GET all players (id and name)
app.get('/api/players', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  let stats = readJSON(PLAYER_STATS_FILE);
  if (!Array.isArray(stats)) stats = [];
  // Return array of { id, name }
  const players = stats.map(s => ({ id: s.id, name: s.name }));
  res.json(players);
});

// GET/POST Player Stats (EXP, rewards, etc.)
app.get('/api/player-stats', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  let stats = readJSON(PLAYER_STATS_FILE);
  if (!Array.isArray(stats)) stats = [];
  res.json(stats);
});

app.post('/api/player-stats', (req, res) => {
  // expects { id, name, exp, claimedRewards }
  const { id, name, exp, claimedRewards } = req.body;
  let stats = readJSON(PLAYER_STATS_FILE);
  if (!Array.isArray(stats)) stats = [];
  // Remove any entries without an id or name (invalid entries)
  stats = stats.filter(s => s && s.id && s.name);
  let entry = stats.find(s => s.id === id);
  let prevExp = entry ? entry.exp : 0;
  let prevClaimed = entry ? (entry.claimedRewards || []).slice() : [];
  if (!entry) {
    entry = { id, name, exp: 0, claimedRewards: [] };
    stats.push(entry);
  }
  if (typeof name === 'string') entry.name = name;
  if (typeof exp === 'number') entry.exp = exp;
  if (Array.isArray(claimedRewards)) entry.claimedRewards = claimedRewards;
  writeJSON(PLAYER_STATS_FILE, stats);
  // --- Notification logic ---
  // Level up notification
  const getLevel = (exp) => Math.floor(1 + Math.log2(1 + exp / 100));
  let oldLevel = getLevel(prevExp);
  let newLevel = getLevel(entry.exp);
  if (newLevel > oldLevel) {
    for (let l = oldLevel + 1; l <= newLevel; l++) {
      emitNotification({
        type: 'levelup',
        playerId: id,
        playerName: entry.name,
        level: l,
        timestamp: Date.now(),
        seenBy: []
      });
    }
    // Gotify push for level-up: all users, special message for leveler
    const allPlayers = readJSON(PLAYER_STATS_FILE);
    allPlayers.forEach(p => {
      if (p.gotifyappapikey && p.gotifyserverurl) {
        if (p.id === id) {
          sendGotify(
            'Level Up!',
            `Glückwunsch! Du hast Level ${newLevel} erreicht!`,
            [{ url: p.gotifyserverurl, token: p.gotifyappapikey }]
          );
        } else {
          sendGotify(
            'Level Up!',
            `Get your ass up! ${entry.name} hat Level ${newLevel} erreicht!`,
            [{ url: p.gotifyserverurl, token: p.gotifyappapikey }]
          );
        }
      }
    });
  }
  // Reward claim notification
  if (Array.isArray(claimedRewards)) {
    let newClaims = claimedRewards.filter(r => !prevClaimed.includes(r));
    newClaims.forEach(r => {
      emitNotification({
        type: 'reward',
        playerId: id,
        playerName: entry.name,
        reward: r,
        timestamp: Date.now(),
        seenBy: []
      });
    });
  }
  emitDataChanged();
  res.json({ success: true, stats });
});

// GET all notifications
app.get('/api/notifications', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  let notifications = readJSON(NOTIFICATIONS_FILE);
  res.json(notifications);
});

// PATCH: Mark notifications as seen by a player and clean up if all players have seen
app.patch('/api/notifications/seen', (req, res) => {
  const { playerId } = req.body;
  let notifications = readJSON(NOTIFICATIONS_FILE);
  let stats = readJSON(PLAYER_STATS_FILE);
  const allPlayerIds = stats.map(s => s.id);
  let changed = false;
  notifications.forEach(n => {
    if (!n.seenBy) n.seenBy = [];
    if (!n.seenBy.includes(playerId)) {
      n.seenBy.push(playerId);
      changed = true;
    }
  });
  // Remove notifications seen by all players
  const filtered = notifications.filter(n => {
    if (!n.seenBy) return true;
    return allPlayerIds.some(pid => !n.seenBy.includes(pid));
  });
  if (changed || filtered.length !== notifications.length) {
    writeJSON(NOTIFICATIONS_FILE, filtered);
  }
  res.json({ success: true });
});

// POST: Clear all player stats (reset exp and claimedRewards, keep id, name, gotifyappapikey, gotifyserverurl)
app.post('/api/player-stats/clear', (req, res) => {
  let stats = readJSON(PLAYER_STATS_FILE);
  if (!Array.isArray(stats)) stats = [];
  stats = stats.filter(s => s && s.id && s.name).map(s => ({
    id: s.id,
    name: s.name,
    exp: 0,
    claimedRewards: [],
    gotifyappapikey: typeof s.gotifyappapikey === 'string' ? '' : undefined,
    gotifyserverurl: typeof s.gotifyserverurl === 'string' ? '' : undefined
  }));
  writeJSON(PLAYER_STATS_FILE, stats);
  emitDataChanged();
  res.json({ success: true });
});

// POST: Clear all notifications
app.post('/api/notifications/clear', (req, res) => {
  writeJSON(NOTIFICATIONS_FILE, []);
  res.json({ success: true });
});

// Standardroute
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start server with socket.io
server.listen(PORT, () => console.log(`Server läuft auf http://localhost:${PORT}`));
