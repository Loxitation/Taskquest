// Rewards logic for TaskQuest
import { getRewards } from './api.js';

export let rewards = [];

export async function loadRewards() {
  rewards = await getRewards();
}

export function getAvailableRewards(level) {
  return rewards.filter(r => level >= r.level);
}
