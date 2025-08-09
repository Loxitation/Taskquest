// Modular DB setup for tasks and archive (SQLite, future-proof)
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_TYPE = process.env.DB_TYPE || 'sqlite';

let tasksDb;
if (DB_TYPE === 'sqlite') {
  tasksDb = new sqlite3.Database(path.join(__dirname, 'tasks.db'), (err) => {
    if (err) throw err;
    console.log('Connected to tasks.db (SQLite)');
  });
} else {
  // Placeholder for MySQL connection logic
}

const createTasksTable = () => {
  if (DB_TYPE === 'sqlite') {
    tasksDb.run(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY,
      name TEXT,
      difficulty INTEGER,
      urgency INTEGER,
      dueDate TEXT,
      player TEXT,
      status TEXT,
      added TEXT,
      confirmedBy TEXT,
      minutesWorked INTEGER,
      note TEXT,
      hours INTEGER,
      commentary TEXT,
      completedAt TEXT,
      approver TEXT,
      rating INTEGER,
      answerCommentary TEXT,
      exp INTEGER,
      archived INTEGER DEFAULT 0,
      waitingForApproval INTEGER DEFAULT 0
    )`);
  }
};

module.exports = {
  tasksDb,
  createTasksTable,
  DB_TYPE
};
