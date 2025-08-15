// UI rendering and DOM logic for TaskQuest
import { players, playerStats, getPlayerById, getPlayerStatsById } from './players.js';
import { tasks, archive, getTasksByPlayer, getArchiveByPlayer } from './tasks.js';
import { rewards, getAvailableRewards } from './rewards.js';
import { getRank } from './ranks.js';
import { getLevel } from './exp.js';

function formatMinutes(mins) {
  const h = Math.floor((mins||0)/60);
  const m = (mins||0)%60;
  return `${h}h ${m}min`;
}

export function renderScoreboard(currentPlayerId) {
  const el = document.getElementById('scoreboard-box');
  if (!el) return;
  // Sort players by exp descending
  const sorted = players.slice().sort((a, b) => {
    const sa = getPlayerStatsById(a.id);
    const sb = getPlayerStatsById(b.id);
    return (sb.exp||0) - (sa.exp||0);
  });
  el.innerHTML = `<div style="font-size:1.3em;font-weight:bold;color:#ffb347;margin-bottom:0.7em;display:flex;align-items:center;gap:0.5em;">
    <span>🏆</span> Scoreboard
  </div>` +
    sorted.map(p => {
      const stats = getPlayerStatsById(p.id);
      const level = getLevel(stats.exp||0);
      const invested = formatMinutes(stats.minutesWorked||0);
      const isCurrent = p.id === currentPlayerId;
      // EXP bar calculation
      const prevLevelExp = level > 1 ? 100 * (Math.pow(2, level-1) - 1) : 0;
      const nextLevelExp = 100 * (Math.pow(2, level) - 1);
      const expThisLevel = (stats.exp||0) - prevLevelExp;
      const expNeeded = nextLevelExp - prevLevelExp;
      const expPercent = expNeeded > 0 ? Math.min(100, Math.max(0, (expThisLevel / expNeeded) * 100)) : 0;
      return `<div style="background:${isCurrent?'#18191c':'#232526'};color:${isCurrent?'#7ed957':'#ffb347'};border:${isCurrent?'2px solid #7ed957':'none'};border-radius:12px;padding:1em;margin-bottom:1em;box-shadow:${isCurrent?'0 0 12px #7ed95744':''};">
        <div style="font-size:1.2em;font-weight:bold;">${p.name}</div>
        <div style="font-size:1em;">Level: ${level} | EXP: ${stats.exp||0}</div>
        <div class="exp-bar-label">EXP to next level</div>
        <div class="exp-bar-outer">
          <div class="exp-bar-inner" style="width:${expPercent}%;"></div>
        </div>
        <div style="font-size:0.95em;color:#aaa;margin-bottom:0.2em;">${expThisLevel} / ${expNeeded} EXP</div>
        <div style="font-size:1em;">Zeit investiert: <b>${invested}</b></div>
      </div>`;
    }).join('');
}

// More UI rendering functions (renderTasks, renderRewards, etc.) can be added here
