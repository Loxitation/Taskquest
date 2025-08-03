// Ranks logic for TaskQuest
import { getRanks } from './api.js';

export let ranks = [];

export async function loadRanks() {
  ranks = await getRanks();
}

export function getRank(level) {
  if (!ranks.length) return '';
  // Assumes ranks is sorted by minLevel ascending
  let found = ranks.slice().reverse().find(r => level >= r.minLevel);
  return found ? found.name : '';
}
