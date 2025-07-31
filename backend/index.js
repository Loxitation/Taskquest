const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3578;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// JSON-Dateien
const TASKS_FILE = './backend/tasks.json';
const ARCHIVE_FILE = './backend/archive.json';
const PLAYER_STATS_FILE = './backend/playerStats.json';

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

// GET alle Tasks
app.get('/api/tasks', (req, res) => {
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
  tasks[index] = { ...tasks[index], ...req.body };
  writeJSON(TASKS_FILE, tasks);
  res.json({ success: true, task: tasks[index] });
});

// POST: Aufgabe freigeben (Bestätigung durch Gegner)
app.post('/api/confirm/:id', (req, res) => {
  const taskId = parseInt(req.params.id);
  const player = req.body.player;
  const tasks = readJSON(TASKS_FILE);
  const index = tasks.findIndex(t => t.id === taskId);

  if (index !== -1 && tasks[index].player !== player && tasks[index].status === 'submitted') {
    const completed = {
      ...tasks[index],
      confirmedBy: player,
      completedAt: new Date(),
      status: 'done'
    };
    const archived = readJSON(ARCHIVE_FILE);
    archived.push(completed);
    writeJSON(ARCHIVE_FILE, archived);
    tasks.splice(index, 1);
    writeJSON(TASKS_FILE, tasks);
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
  res.json({ success: tasks.length < initialLength });
});

// POST: Clear all tasks
app.post('/api/tasks/clear', (req, res) => {
  writeJSON(TASKS_FILE, []);
  res.json({ success: true });
});

// POST: Clear all archive
app.post('/api/archive/clear', (req, res) => {
  writeJSON(ARCHIVE_FILE, []);
  res.json({ success: true });
});

// GET Archiv
app.get('/api/archive', (req, res) => {
  const archive = readJSON(ARCHIVE_FILE);
  res.json(archive);
});

// GET/POST Player Stats (EXP, rewards, etc.)
app.get('/api/player-stats', (req, res) => {
  let stats = readJSON(PLAYER_STATS_FILE);
  if (!Array.isArray(stats)) stats = [];
  res.json(stats);
});

app.post('/api/player-stats', (req, res) => {
  // expects { player, exp, claimedRewards }
  const { player, exp, claimedRewards } = req.body;
  let stats = readJSON(PLAYER_STATS_FILE);
  if (!Array.isArray(stats)) stats = [];
  let entry = stats.find(s => s.player === player);
  if (!entry) {
    entry = { player, exp: 0, claimedRewards: [] };
    stats.push(entry);
  }
  if (typeof exp === 'number') entry.exp = exp;
  if (Array.isArray(claimedRewards)) entry.claimedRewards = claimedRewards;
  writeJSON(PLAYER_STATS_FILE, stats);
  res.json({ success: true, stats });
});

// Standardroute
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => console.log(`Server läuft auf http://localhost:${PORT}`));
