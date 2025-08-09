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

let currentUser = null;
let currentPlayerId = null;
let currentFilter = 'all';
let adminConfig = {};
let rewardsEnabled = true;

// Check authentication status
async function checkAuth() {
  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      // Not authenticated, redirect to login
      window.location.href = '/login.html';
      return false;
    }
    
    currentUser = await response.json();
    currentPlayerId = currentUser.id; // Use user ID as player ID
    
    // Update navigation with user info
    updateNavigation();
    
    return true;
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.href = '/login.html';
    return false;
  }
}

// Update navigation with current user info
function updateNavigation() {
  // Remove player selector if it exists
  const playerSelect = document.getElementById('player-select');
  if (playerSelect) {
    playerSelect.style.display = 'none';
  }
  
  // Add user info to navigation
  const navElement = document.querySelector('.nav-section') || document.body;
  let userNav = document.getElementById('user-navigation');
  
  if (!userNav) {
    userNav = document.createElement('div');
    userNav.id = 'user-navigation';
    userNav.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #1f2937;
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 5px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      z-index: 1000;
    `;
    document.body.appendChild(userNav);
  }
  
  userNav.innerHTML = `
    <span style="font-weight: 600;">${currentUser.username}</span>
    ${currentUser.role === 'admin' ? '<span style="color: #ef4444; font-size: 0.8rem; margin-left: 0.5rem;">ADMIN</span>' : ''}
    <div style="margin-top: 0.25rem; font-size: 0.8rem;">
      <a href="/profile.html" style="color: #93c5fd; text-decoration: none; margin-right: 0.5rem;">Profile</a>
      ${currentUser.role === 'admin' ? '<a href="/admin.html" style="color: #fbbf24; text-decoration: none; margin-right: 0.5rem;">Admin</a>' : ''}
      <a href="#" onclick="logout()" style="color: #f87171; text-decoration: none;">Logout</a>
    </div>
  `;
}

async function loadAllData() {
  await Promise.all([
    loadPlayersAndStats(),
    loadTasksAndArchive(),
    loadRanks(),
    loadRewards(),
    loadAdminConfig()
  ]);
}

// Load admin configuration for dynamic features
async function loadAdminConfig() {
  try {
    const response = await fetch('/api/admin/config', {
      credentials: 'include'
    });
    
    if (response.ok) {
      const configs = await response.json();
      adminConfig = {};
      configs.forEach(config => {
        adminConfig[config.config_key] = config.config_value;
      });
      
      // Update rewards enabled status
      rewardsEnabled = adminConfig.rewards_enabled === 'true';
      
      // Update infobox with current EXP configuration
      updateExpInfobox();
      
      // Load dynamic rewards
      if (adminConfig.rewards_config) {
        try {
          const dynamicRewards = JSON.parse(adminConfig.rewards_config);
          // Update rewards module if possible
          if (window.rewards) {
            window.rewards.length = 0;
            window.rewards.push(...dynamicRewards);
          }
        } catch (e) {
          console.error('Error parsing dynamic rewards:', e);
        }
      }
    }
  } catch (error) {
    console.error('Error loading admin config:', error);
  }
}

// Get level title from admin configuration
function getLevelTitle(level) {
  if (!adminConfig.level_titles) return '';
  
  try {
    const levelTitles = JSON.parse(adminConfig.level_titles);
    // Level titles are 0-indexed in array, but levels start at 1
    const titleIndex = level - 1;
    
    if (titleIndex < levelTitles.length) {
      // Use configured title
      return levelTitles[titleIndex] || '';
    } else {
      // For levels beyond configured titles, use the last title with a suffix
      const lastTitle = levelTitles[levelTitles.length - 1] || 'Master';
      const extraLevels = level - levelTitles.length;
      return `${lastTitle} +${extraLevels}`;
    }
  } catch (e) {
    console.error('Error parsing level titles:', e);
    return '';
  }
}

// Update EXP infobox with current configuration
function updateExpInfobox() {
  const expContent = document.getElementById('exp-explanation-content');
  if (!expContent) return;
  
  const baseFormula = adminConfig.exp_base_formula || '10';
  const urgencyFormula = adminConfig.exp_urgency_formula || '5';
  const timeBonus = adminConfig.exp_time_bonus || '1';
  const earlyBonus = adminConfig.exp_early_bonus || '20';
  
  expContent.innerHTML = `
    <table>
      <tr><th>Faktor</th><th>Wert</th></tr>
      <tr><td>Basis</td><td>${baseFormula} × Schwierigkeit × Multiplier</td></tr>
      <tr><td>Dringlichkeit</td><td>${urgencyFormula} × Dringlichkeit × Multiplier</td></tr>
      <tr><td>Zeitaufwand</td><td>+ ${timeBonus} EXP pro Minute</td></tr>
      <tr><td>Bonus</td><td>+ ${earlyBonus} EXP, wenn vor Fälligkeitsdatum erledigt</td></tr>
      <tr><td>Strafe</td><td>EXP werden reduziert, wenn überfällig</td></tr>
    </table>
    <b>Multipliers (Schwierigkeit):</b><br>
    Level 1: ${adminConfig.exp_multiplier_diff_1 || '0.8'}x, 
    Level 2: ${adminConfig.exp_multiplier_diff_2 || '1.0'}x, 
    Level 3: ${adminConfig.exp_multiplier_diff_3 || '1.3'}x, 
    Level 4: ${adminConfig.exp_multiplier_diff_4 || '1.7'}x, 
    Level 5: ${adminConfig.exp_multiplier_diff_5 || '2.2'}x<br>
    <b>Multipliers (Dringlichkeit):</b><br>
    Level 1: ${adminConfig.exp_multiplier_urg_1 || '1.0'}x, 
    Level 2: ${adminConfig.exp_multiplier_urg_2 || '1.1'}x, 
    Level 3: ${adminConfig.exp_multiplier_urg_3 || '1.2'}x, 
    Level 4: ${adminConfig.exp_multiplier_urg_4 || '1.4'}x, 
    Level 5: ${adminConfig.exp_multiplier_urg_5 || '1.6'}x<br>
    <br>
    <span style="color:#7ed957;">Je dringender, desto kürzer darf das Fälligkeitsdatum in der Zukunft liegen!</span>
  `;
}

function updatePlayerInfo() {
  const stats = getPlayerStatsById(currentPlayerId);
  const player = getPlayerById(currentPlayerId) || { name: currentUser?.username || 'Unknown' };
  const level = getLevel(stats.exp||0);
  // Correct next/prev level EXP for new formula
  const nextLevelExp = 100 * (Math.pow(2, level) - 1);
  const prevLevelExp = level > 1 ? 100 * (Math.pow(2, level-1) - 1) : 0;
  const rank = getRank(level);
  const levelTitle = getLevelTitle(level);
  const info = document.getElementById('current-player-info');
  if (info) {
    const expThisLevel = (stats.exp||0) - prevLevelExp;
    const expNeeded = nextLevelExp - prevLevelExp;
    const expPercent = expNeeded > 0 ? Math.min(100, Math.max(0, (expThisLevel / expNeeded) * 100)) : 0;
    
    // Use level title if available, otherwise fall back to rank
    const displayTitle = levelTitle || rank;
    
    info.innerHTML = `
      <span style="font-weight:bold;">Current Player: ${player.name}</span>
      | <span style="font-weight:bold;">Level: ${level}</span>
      ${displayTitle ? `<span style="color:#b97a56;font-size:1.1em;">&#x1F416; ${displayTitle}</span>` : ''}
      | <span style="font-weight:bold;">EXP: ${stats.exp||0}</span>
      <div class="exp-bar-outer" style="height:14px;margin:6px 0 2px 0;width:100%;">
        <div class="exp-bar-inner" style="width:${expPercent}%;height:100%;"></div>
      </div>
      <span style="font-size:0.95em;">${expThisLevel} / ${expNeeded} EXP to Level ${level+1}</span>
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
  
  // Hide rewards if disabled
  if (!rewardsEnabled) {
    box.style.display = 'none';
    return;
  } else {
    box.style.display = 'block';
  }
  
  const stats = getPlayerStatsById(currentPlayerId);
  const level = getLevel(stats.exp||0);
  let claimed = Array.isArray(stats.claimedRewards) ? stats.claimedRewards.slice() : [];
  
  // Use dynamic rewards from admin config if available
  let currentRewards = rewards;
  if (adminConfig.rewards_config) {
    try {
      currentRewards = JSON.parse(adminConfig.rewards_config);
    } catch (e) {
      console.error('Error parsing rewards config:', e);
    }
  }
  
  box.innerHTML = currentRewards.map(r => {
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
  // Check authentication first
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) return;
  
  // Show loading state
  const playerInfo = document.getElementById('current-player-info');
  if (playerInfo) {
    playerInfo.innerHTML = '<span style="color: #ffb347;">🔄 Lade Daten...</span>';
  }
  
  // Load critical data first and show basic UI
  await Promise.all([
    loadPlayersAndStats(),
    loadTasksAndArchive()
  ]);
  
  // Update UI with basic data immediately
  updatePlayerInfo();
  renderTasksUI(currentPlayerId, currentFilter);
  
  // Setup basic functionality
  setupInfocenterToggle();
  setupTaskFilterBar();
  renderFilterBar(currentFilter, onFilterChange);
  
  // Load remaining data in background
  Promise.all([
    loadRanks(),
    loadRewards(),
    loadAdminConfig()
  ]).then(() => {
    // Update UI with complete data
    updatePlayerInfo(); // Refresh with level titles
    renderScoreboard(currentPlayerId);
    renderRewardsUI();
    showMissedNotifications(rewards, currentPlayerId);
  });
  
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
  
  // Initialize personal notes (low priority)
  setTimeout(() => {
    initPersonalNotes();
  }, 100);
}

// Personal Notes functionality
function initPersonalNotes() {
  const notesTextarea = document.getElementById('personal-notes');
  if (!notesTextarea || !currentPlayerId) return;
  
  const notesKey = `personal_notes_${currentPlayerId}`;
  
  // Load saved notes
  const savedNotes = localStorage.getItem(notesKey);
  if (savedNotes) {
    notesTextarea.value = savedNotes;
  }
  
  // Save notes on input with debouncing
  let saveTimeout;
  notesTextarea.addEventListener('input', () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      localStorage.setItem(notesKey, notesTextarea.value);
    }, 500); // Save 500ms after user stops typing
  });
  
  // Also save on blur
  notesTextarea.addEventListener('blur', () => {
    localStorage.setItem(notesKey, notesTextarea.value);
  });
}

// Logout function
async function logout() {
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
    
    if (response.ok) {
      localStorage.removeItem('taskquest_user');
      window.location.href = '/login.html';
    } else {
      alert('Logout failed');
    }
  } catch (error) {
    console.error('Logout error:', error);
    alert('Logout error');
  }
}

// Make logout function globally available
window.logout = logout;

document.addEventListener('DOMContentLoaded', main);
