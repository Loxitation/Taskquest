// Player-related logic for TaskQuest
import { getPlayers, getPlayerStats } from './api.js';
import { archive } from './tasks.js';

export let players = [];
export let playerStats = [];

export async function loadPlayersAndStats() {
  [players, playerStats] = await Promise.all([
    getPlayers(),
    getPlayerStats()
  ]);
}

export function getPlayerById(id) {
  return players.find(p => p.id === id);
}

export function getPlayerStatsById(id) {
  const base = playerStats.find(s => s.id === id) || { id, name: '', exp: 0, claimedRewards: [] };
  // Sum minutesWorked from all archived tasks for this player
  let totalMinutes = 0;
  if (Array.isArray(archive)) {
    totalMinutes = archive.filter(t => (t.player === id || t.playerId === id) && t.status === 'done' && t.minutesWorked)
      .reduce((sum, t) => sum + (parseInt(t.minutesWorked) || 0), 0);
  }
  return { ...base, minutesWorked: totalMinutes };
}
