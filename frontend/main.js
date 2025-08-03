// Main entry point for TaskQuest (modular refactor)
import { loadPlayersAndStats, players, playerStats, getPlayerById, getPlayerStatsById } from './modules/players.js';
import { loadTasksAndArchive, tasks, archive } from './modules/tasks.js';
import { loadRanks } from './modules/ranks.js';
import { loadRewards, rewards } from './modules/rewards.js';
import { renderScoreboard } from './modules/ui.js';
import { renderTasksUI } from './modules/tasks-ui.js';
import { renderFilterBar } from './modules/filter.js';
import { setupAddTaskForm } from './modules/form.js';
import { setupSocket, setupNotificationSocket } from './modules/socket.js';
import { showNotificationBanner, showMissedNotifications } from './modules/notifications.js';
import { getLevel } from './modules/exp.js';
import { getRank } from './modules/ranks.js';
import { updateClaimedRewards } from './modules/api.js';

let currentPlayerId = null;
let currentFilter = 'all';

function populatePlayerSelector() {
  const select = document.getElementById('player-select');
  if (!select) return;
  select.innerHTML = players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  // Try to restore from localStorage
  let savedId = localStorage.getItem('taskquest_player_id');
  if (!savedId || !players.some(p => p.id === savedId)) {
    currentPlayerId = players[0]?.id || null;
  } else {
    currentPlayerId = savedId;
  }
  select.value = currentPlayerId;
  select.onchange = () => {
    currentPlayerId = select.value;
    localStorage.setItem('taskquest_player_id', currentPlayerId);
    updatePlayerInfo();
    renderFilterBar(currentFilter, onFilterChange);
    renderTasksUI(currentPlayerId, currentFilter);
    renderScoreboard(currentPlayerId);
  };
}

async function loadAllData() {
  await Promise.all([
    loadPlayersAndStats(),
    loadTasksAndArchive(),
    loadRanks(),
    loadRewards()
  ]);
}

function updatePlayerInfo() {
  const stats = getPlayerStatsById(currentPlayerId);
  const player = getPlayerById(currentPlayerId);
  const level = getLevel(stats.exp||0);
  // Correct next/prev level EXP for new formula
  const nextLevelExp = 100 * (Math.pow(2, level) - 1);
  const prevLevelExp = level > 1 ? 100 * (Math.pow(2, level-1) - 1) : 0;
  const rank = getRank(level);
  const info = document.getElementById('current-player-info');
  if (info && player) {
    const expThisLevel = (stats.exp||0) - prevLevelExp;
    const expNeeded = nextLevelExp - prevLevelExp;
    const expPercent = expNeeded > 0 ? Math.min(100, Math.max(0, (expThisLevel / expNeeded) * 100)) : 0;
    info.innerHTML = `
      <span style="font-weight:bold;">Aktueller Spieler: ${player.name}</span>
      | <span style="font-weight:bold;">Level: ${level}</span>
      <span style="color:#b97a56;font-size:1.1em;">&#x1F416; ${rank}</span>
      | <span style="font-weight:bold;">EXP: ${stats.exp||0}</span>
      <div class="exp-bar-outer" style="height:14px;margin:6px 0 2px 0;width:100%;">
        <div class="exp-bar-inner" style="width:${expPercent}%;height:100%;"></div>
      </div>
      <span style="font-size:0.95em;">${expThisLevel} / ${expNeeded} EXP bis Level ${level+1}</span>
    `;
  }
  renderScoreboard(currentPlayerId);
}

function onFilterChange(newFilter) {
  currentFilter = newFilter;
  renderFilterBar(currentFilter, onFilterChange);
  renderTasksUI(currentPlayerId, currentFilter);
}

function renderRewardsUI() {
  const box = document.getElementById('rewards-box');
  if (!box) return;
  const stats = getPlayerStatsById(currentPlayerId);
  const level = getLevel(stats.exp||0);
  let claimed = Array.isArray(stats.claimedRewards) ? stats.claimedRewards.slice() : [];
  box.innerHTML = rewards.map(r => {
    const isClaimed = claimed.includes(r.id);
    const canClaim = level >= r.level && !isClaimed;
    return `<div class="reward-card" style="border:2px solid ${isClaimed ? '#7ed957' : '#ffb347'};border-radius:10px;padding:0.7em 1em;margin-bottom:0.7em;background:${isClaimed ? '#232f23' : '#232526'};color:${isClaimed ? '#7ed957' : '#ffb347'};">
      <div style="font-weight:bold;font-size:1.1em;">${r.name}</div>
      <div style="font-size:0.98em;">${r.description}</div>
      <div style="font-size:0.95em;">Level: ${r.level}</div>
      ${isClaimed ? '<span style="color:#7ed957;font-weight:bold;">Bereits erhalten</span>' :
        canClaim ? `<button class="claim-reward" data-rewardid="${r.id}">Belohnung einlösen</button>` :
        `<span style="color:#888;">Noch nicht verfügbar</span>`}
    </div>`;
  }).join('');
  // Add event listeners for claim buttons
  box.querySelectorAll('.claim-reward').forEach(btn => {
    btn.addEventListener('click', async e => {
      const rewardId = Number(btn.dataset.rewardid);
      if (!claimed.includes(rewardId)) {
        claimed.push(rewardId);
        // Sync with backend
        const player = getPlayerById(currentPlayerId);
        await updateClaimedRewards(currentPlayerId, player?.name || '', stats.exp || 0, claimed);
        await loadPlayersAndStats(); // reload stats to update UI
        renderRewardsUI();
      }
    });
  });
}

function setupResetButton() {
  const resetBtn = document.getElementById('reset-app');
  if (resetBtn) {
    resetBtn.onclick = async () => {
      const val = prompt('Gib "reset" ein, um alle Daten zurückzusetzen.');
      if (val && val.trim().toLowerCase() === 'reset') {
        await fetch('/api/tasks/clear', { method: 'POST' });
        await fetch('/api/archive/clear', { method: 'POST' });
        await fetch('/api/player-stats/clear', { method: 'POST' });
        await fetch('/api/notifications/clear', { method: 'POST' });
        localStorage.clear();
        location.reload();
      }
    };
  }
}

function setupTaskFilterBar() {
  const filterIds = ['all', 'offen', 'eingereicht', 'erledigt'];
  filterIds.forEach(id => {
    const btn = document.getElementById(`filter-${id}`);
    if (btn) {
      btn.onclick = () => {
        currentFilter = id;
        renderFilterBar(currentFilter, onFilterChange);
        renderTasksUI(currentPlayerId, currentFilter);
      };
    }
  });
}

function setupInfocenterToggle() {
  const btn = document.getElementById('toggle-exp-rewards');
  const content = document.getElementById('exp-rewards-content');
  if (btn && content) {
    btn.onclick = () => {
      content.style.display = (content.style.display === 'none') ? '' : 'none';
    };
  }
}

async function main() {
  await loadAllData();
  populatePlayerSelector();
  updatePlayerInfo();
  renderFilterBar(currentFilter, onFilterChange);
  renderTasksUI(currentPlayerId, currentFilter);
  renderScoreboard(currentPlayerId);
  renderRewardsUI();
  await showMissedNotifications(rewards, currentPlayerId);
  setupResetButton();
  setupInfocenterToggle();
  setupTaskFilterBar();
  // Setup sockets
  setupSocket(async () => {
    await loadAllData();
    renderTasksUI(currentPlayerId, currentFilter);
    updatePlayerInfo();
    renderRewardsUI();
  });
  setupNotificationSocket(n => {
    showNotificationBanner(n, rewards, currentPlayerId);
  });
  // Setup add-task form
  setupAddTaskForm(async () => {
    await loadAllData();
    renderTasksUI(currentPlayerId, currentFilter);
    renderRewardsUI();
  }, () => currentPlayerId);
}

document.addEventListener('DOMContentLoaded', main);
