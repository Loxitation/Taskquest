// Task-related logic for TaskQuest
import { getTasks, getArchive } from './api.js';

export let tasks = [];
export let archive = [];

export async function loadTasksAndArchive() {
  [tasks, archive] = await Promise.all([
    getTasks(),
    getArchive()
  ]);
}

export function getTasksByPlayer(playerId) {
  return tasks.filter(t => t.player === playerId);
}

export function getArchiveByPlayer(playerId) {
  return archive.filter(t => t.player === playerId);
}

export function getTasksByPlayerAndFilter(playerId, filter) {
  if (filter === 'erledigt') {
    // Only archived tasks for this player
    return archive.filter(t => (t.player === playerId || t.playerId === playerId));
  }
  let filtered = tasks.filter(t => (t.player === playerId || t.playerId === playerId));
  if (filter === 'offen') {
    filtered = filtered.filter(t => t.status === 'open');
  } else if (filter === 'eingereicht') {
    filtered = filtered.filter(t => t.status === 'submitted');
  }
  return filtered;
}
