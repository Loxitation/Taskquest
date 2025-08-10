// Player-related logic for TaskQuest
import { getPlayers, getPlayerStats } from './api.js';

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
  const stats = playerStats.find(s => String(s.id) === String(id));
  if (stats) {
    return stats;
  }
  
  // Fallback for players without stats
  return { 
    id, 
    name: '', 
    exp: 0, 
    claimedRewards: [], 
    minutesWorked: 0 
  };
}
