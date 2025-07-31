let currentPlayer = "Leon";
const players = ["Leon", "Daniel"];
let tasks = [];
let archive = [];
let playerStats = [];
let currentFilter = "all"; // all, open, submitted, done

const rewards = [
  { level: 2, desc: "🧃 1h Wunschaktivität (Zocken, Binge watchen, doom scrollen etc)" },
  { level: 4, desc: "🧹 'Ich helf dir beim nächsten Projekt'-Joker" },
  { level: 6, desc: "🛠️ Kleinwerkzeug aus Fernost (Aliexpress etc.)" },
  { level: 9, desc: "🧩 1 Spiel nach deiner Wahl (max. 30 €)" },
  { level: 12, desc: "🍔 Du wirst bekocht oder darfst liefern lassen (max. 40€)" },
  { level: 15, desc: "🎁 Projektbudget: 50 € für Material deiner Wahl" },
  { level: 18, desc: "🛌 1 Abend voll nichts tun – Projektpause mit zocken oder quatschen" },
  { level: 20, desc: "🧠 Du delegierst eine Aufgabe komplett an den anderen" }
];

async function loadAllData() {
  tasks = await fetch('/api/tasks').then(r => r.json());
  archive = await fetch('/api/archive').then(r => r.json());
  playerStats = await fetch('/api/player-stats').then(r => r.json());
}

function getOtherPlayer() {
  return players.find(p => p !== currentPlayer);
}

function getLevel(exp) {
  return Math.floor(1 + exp / 100);
}

function getExpForTask(task) {
  // EXP: base 10 * difficulty, bonus for urgency, plus 1 EXP per minute
  let exp = 10 * (task.difficulty || 1);
  if (task.urgency && task.urgency > 0) exp += 5 * task.urgency;
  if (task.completionTime) exp += parseInt(task.completionTime);
  // Bonus for early completion (not for not urgent)
  if (task.urgency && task.urgency > 0 && task.dueDate && task.completedAt && new Date(task.completedAt) <= new Date(task.dueDate)) {
    exp += 20;
  }
  // Penalty for overdue
  if (task.dueDate && task.completedAt && new Date(task.completedAt) > new Date(task.dueDate)) {
    const daysLate = Math.ceil((new Date(task.completedAt) - new Date(task.dueDate)) / (1000*3600*24));
    exp = Math.floor(exp * Math.pow(0.8, daysLate));
    if (daysLate >= 21) exp = Math.max(-10, exp);
  }
  // Not urgent: less EXP, no bonus
  if (task.urgency === 0) {
    exp = Math.floor(exp * 0.5);
  }
  return Math.max(1, exp);
}

function getPlayerStats(player) {
  let entry = Array.isArray(playerStats) ? playerStats.find(s => s.player === player) : undefined;
  if (!entry) entry = { player, exp: 0, claimedRewards: [] };
  return entry;
}

function getRank(level) {
  if (level < 3) return "🪑 Faule Sau";
  if (level < 5) return "🍺 Nichtsnutz mit Ambitionen";
  if (level < 8) return "🔩 Hobbybastler";
  if (level < 12) return "🔨 Möchtegern-Heimwerker";
  if (level < 16) return "🔧 Solider Heimwerker";
  if (level < 20) return "🛠️ Systematischer Projektkiller";
  if (level === 20) return "⚡ Meister der Provisorien";
  return "👑 Aufgaben-Gott";
}

function updatePlayerInfo() {
  const stats = getPlayerStats(currentPlayer);
  const level = getLevel(stats.exp||0);
  const rank = getRank(level);
  document.getElementById("current-player-info").innerHTML = `Aktueller Spieler: <b>${currentPlayer}</b> | Level: <b>${level}</b> <span style="margin-left:0.5em;">${rank}</span> | EXP: <b>${stats.exp||0}</b>`;
  renderRewards();
}

function buildScale(containerId, maxValue) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (containerId === "urgency-scale") {
    const notUrgentBtn = document.createElement("button");
    notUrgentBtn.textContent = "Nicht dringend";
    notUrgentBtn.classList.add("not-urgent");
    notUrgentBtn.addEventListener("click", () => {
      container.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
      notUrgentBtn.classList.add("selected");
    });
    container.appendChild(notUrgentBtn);
  }
  for (let i = 1; i <= maxValue; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.addEventListener("click", () => {
      container.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
    container.appendChild(btn);
  }
}

function renderTasks() {
  if (!Array.isArray(tasks)) tasks = [];
  const list = document.getElementById("task-list");
  list.innerHTML = "";
  const playersToShow = [currentPlayer, getOtherPlayer()];
  playersToShow.forEach(player => {
    // Section header
    const header = document.createElement("li");
    header.style.background = "#18191c";
    header.style.color = "#ffb347";
    header.style.fontWeight = "bold";
    header.style.fontSize = "1.1rem";
    header.style.borderBottom = "1px solid #333";
    header.style.marginTop = "1.2rem";
    header.textContent = player === currentPlayer ? "Deine Aufgaben" : `Aufgaben von ${player}`;
    list.appendChild(header);
    // Filtered tasks for this player (only by creator)
    let filtered = tasks.filter(t => t.player === player);
    if (currentFilter === "open") filtered = filtered.filter(t => t.status === "open");
    if (currentFilter === "submitted") filtered = filtered.filter(t => t.status === "submitted");
    if (currentFilter === "done") filtered = [];
    filtered.forEach((task, idx) => {
      const li = document.createElement("li");
      if (task.status === "done") li.classList.add("done");
      let info = `${task.title} (S${task.difficulty} / D${task.urgency})`;
      if (task.status === "submitted" && task.approver === currentPlayer) {
        info += `<br><b>Kommentar:</b> ${task.commentary || "-"}`;
        info += `<br><b>Zeit:</b> ${task.completionTime ? task.completionTime + " min" : "-"}`;
      }
      li.innerHTML = `
        <span>${info}</span>
        <div class="task-actions"></div>
      `;
      const actions = li.querySelector(".task-actions");
      if (task.status === "open" && task.player === currentPlayer) {
        actions.innerHTML = `<button class="submit-task">Abschließen</button><button class="delete-task">🗑️</button>`;
        actions.querySelector(".submit-task").addEventListener("click", () => submitTask(task));
        actions.querySelector(".delete-task").addEventListener("click", () => deleteTask(task));
      } else if (task.status === "submitted" && task.approver === currentPlayer) {
        actions.innerHTML = `<button class="approve-task">Bestätigen</button><button class="reject-task">Ablehnen</button>`;
        actions.querySelector(".approve-task").addEventListener("click", () => approveTask(task));
        actions.querySelector(".reject-task").addEventListener("click", () => rejectTask(task));
      } else if (task.status === "submitted" && task.player === currentPlayer) {
        actions.innerHTML = `<span>Warte auf Bestätigung...</span>`;
      } else if (task.status === "done") {
        actions.innerHTML = `<span>Abgeschlossen</span>`;
      } else if (task.player === currentPlayer) {
        actions.innerHTML = `<button class="delete-task">🗑️</button>`;
        actions.querySelector(".delete-task").addEventListener("click", () => deleteTask(task));
      }
      list.appendChild(li);
    });
    // Show done tasks from archive if filter is 'done' or 'all'
    if (currentFilter === "done" || currentFilter === "all") {
      let doneTasks = archive.filter(t => t.player === player);
      doneTasks.forEach((task, idx) => {
        const li = document.createElement("li");
        li.classList.add("done");
        let info = `${task.title} (S${task.difficulty} / D${task.urgency})`;
        li.innerHTML = `<span>${info}</span><div class="task-actions"><span>Abgeschlossen</span></div>`;
        list.appendChild(li);
      });
    }
  });
}

function renderFilterBar() {
  let bar = document.querySelector(".filter-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "filter-bar";
    document.querySelector("section:last-of-type").prepend(bar);
  }
  bar.innerHTML = `
    <button data-filter="all" class="${currentFilter === "all" ? "active" : ""}">Alle</button>
    <button data-filter="open" class="${currentFilter === "open" ? "active" : ""}">Offen</button>
    <button data-filter="submitted" class="${currentFilter === "submitted" ? "active" : ""}">Eingereicht</button>
    <button data-filter="done" class="${currentFilter === "done" ? "active" : ""}">Erledigt</button>
  `;
  bar.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.filter;
      renderFilterBar();
      renderTasks();
    });
  });
}

function renderRewards() {
  const box = document.getElementById("rewards-box");
  if (!box) return;
  const stats = getPlayerStats(currentPlayer);
  const level = getLevel(stats.exp||0);
  let html = '<h4>Belohnungen</h4><ul style="padding-left:0;list-style:none;">';
  rewards.forEach(r => {
    const claimed = (stats.claimedRewards||[]).includes(r.level);
    if (level >= r.level) {
      html += `<li class="reward-unlocked" style="margin-bottom:1rem;">${r.desc} <br>`;
      if (claimed) {
        html += '<span style="color:#7ed957;font-weight:bold;">Eingelöst</span>';
      } else {
        html += `<button class="claim-reward" data-level="${r.level}" style="margin-top:0.3rem;">Einlösen</button>`;
      }
      html += '</li>';
    } else {
      html += `<li class="reward-locked" style="margin-bottom:1rem;opacity:0.5;filter:grayscale(1);">🔒 ${r.desc} <br><span style="font-size:0.95em;">Ab Level ${r.level}</span></li>`;
    }
  });
  html += '</ul>';
  box.innerHTML = html;
  box.querySelectorAll('.claim-reward').forEach(btn => {
    btn.addEventListener('click', async () => {
      await claimReward(parseInt(btn.dataset.level));
    });
  });
}

async function claimReward(level) {
  let stats = getPlayerStats(currentPlayer);
  if (!stats.claimedRewards) stats.claimedRewards = [];
  if (!stats.claimedRewards.includes(level)) {
    stats.claimedRewards.push(level);
    await savePlayerStats(currentPlayer, stats.exp, stats.claimedRewards);
    await loadAllData();
    renderRewards();
    updatePlayerInfo();
  }
}

async function savePlayerStats(player, exp, claimedRewards) {
  await fetch('/api/player-stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player, exp, claimedRewards })
  });
}

// When submitting a task, show prompts for commentary and completion time
function submitTask(task) {
  // Show prompt for commentary and completion time
  const commentary = prompt("Kommentar/Beweis (optional):", task.commentary || "");
  let completionTime = prompt("Benötigte Zeit in Minuten:", task.completionTime || "");
  completionTime = parseInt(completionTime);
  if (isNaN(completionTime) || completionTime < 1) {
    alert("Ungültige Zeitangabe.");
    return;
  }
  // Update task on backend
  fetch(`/api/tasks/${task.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commentary,
      completionTime,
      completedAt: new Date().toISOString(),
      status: "submitted",
      approver: getOtherPlayer()
    })
  }).then(async () => {
    await loadAllData();
    renderTasks();
  });
}

async function saveTasksToBackend() {
  await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tasks)
  });
  await loadAllData();
  renderTasks();
}

// Approve a task and update player stats
async function approveTask(task) {
  // Mark as done and update player stats only if task is actually moved
  const response = await fetch(`/api/confirm/${task.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player: currentPlayer })
  });
  const result = await response.json();
  await loadAllData();
  // Only award XP if the task is now in the archive and not in tasks
  const stillInTasks = tasks.find(t => t.id === task.id);
  const nowInArchive = archive.find(t => t.id === task.id);
  if (!stillInTasks && nowInArchive) {
    const exp = getExpForTask(nowInArchive);
    let stats = getPlayerStats(nowInArchive.player);
    stats.exp = (stats.exp || 0) + exp;
    await savePlayerStats(nowInArchive.player, stats.exp, stats.claimedRewards || []);
  }
  await loadAllData();
  updatePlayerInfo();
  renderTasks();
}

function rejectTask(task) {
  // Reset task to open on backend
  fetch(`/api/tasks/${task.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'open',
      commentary: '',
      completionTime: null,
      approver: null
    })
  }).then(async () => {
    await loadAllData();
    renderTasks();
  });
}

function deleteTask(task) {
  fetch(`/api/tasks/${task.id}`, {
    method: 'DELETE'
  }).then(async () => {
    await loadAllData();
    renderTasks();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const playerSelect = document.getElementById("player-select");
  if (playerSelect) {
    playerSelect.value = currentPlayer;
    playerSelect.addEventListener("change", async () => {
      currentPlayer = playerSelect.value;
      await loadAllData();
      updatePlayerInfo();
      renderFilterBar();
      renderTasks();
    });
  }

  await loadAllData();
  updatePlayerInfo();
  buildScale("difficulty-scale", 4);
  buildScale("urgency-scale", 4);
  renderFilterBar();
  renderTasks();

  // No due date button logic
  const dueDateInput = document.getElementById("due-date");
  const noDueDateBtn = document.getElementById("no-due-date");
  let noDueDate = false;
  if (noDueDateBtn) {
    noDueDateBtn.addEventListener("click", () => {
      noDueDate = !noDueDate;
      if (noDueDate) {
        dueDateInput.value = "";
        dueDateInput.disabled = true;
        noDueDateBtn.style.background = "#ffb347";
        noDueDateBtn.style.color = "#232526";
        noDueDateBtn.textContent = "Fälligkeitsdatum aktivieren";
      } else {
        dueDateInput.disabled = false;
        noDueDateBtn.style.background = "#232526";
        noDueDateBtn.style.color = "#ffb347";
        noDueDateBtn.textContent = "Kein Fälligkeitsdatum nötig";
      }
    });
  }

  // Reset button logic
  const resetBtn = document.getElementById("reset-app");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (confirm("Bist du sicher, dass du die App zurücksetzen möchtest? Alle Aufgaben, das Archiv und Punkte werden gelöscht!")) {
        // Clear backend files using new clear endpoints
        await fetch('/api/tasks/clear', { method: 'POST' });
        await fetch('/api/archive/clear', { method: 'POST' });
        await fetch('/api/player-stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player: 'Leon', exp: 0, claimedRewards: [] }) });
        await fetch('/api/player-stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player: 'Daniel', exp: 0, claimedRewards: [] }) });
        await loadAllData();
        renderTasks();
        location.reload();
      }
    });
  }

  document.getElementById("add-task").addEventListener("click", async () => {
    const title = document.getElementById("title").value.trim();
    const difficulty = parseInt(document.querySelector("#difficulty-scale .selected")?.textContent);
    let urgency = 0;
    const urgencySelected = document.querySelector("#urgency-scale .selected");
    if (urgencySelected) {
      if (!urgencySelected.classList.contains("not-urgent")) urgency = parseInt(urgencySelected.textContent);
    }
    let dueDate = dueDateInput.value;
    if (noDueDate) dueDate = null;
    if (!title || !difficulty || (!urgencySelected) || (!dueDate && !noDueDate)) {
      alert("Bitte Titel, Schwierigkeit, Dringlichkeit und ggf. Fälligkeitsdatum angeben.");
      return;
    }
    // Enforce due date: max days in future = 2 + (5-urgency)*2 (urgency 0: max 21 days)
    if (!noDueDate) {
      let maxDays = 2 + (5 - urgency) * 2;
      if (urgency === 0) maxDays = 21;
      const today = new Date();
      const due = new Date(dueDate);
      const diffDays = Math.ceil((due - today) / (1000*3600*24));
      if (diffDays < 0) {
        alert("Das Fälligkeitsdatum muss in der Zukunft liegen.");
        return;
      }
      if (diffDays > maxDays) {
        alert(`Bei Dringlichkeit ${urgency === 0 ? 'Nicht dringend' : urgency} darf das Fälligkeitsdatum maximal ${maxDays} Tage in der Zukunft liegen.`);
        return;
      }
    }
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, difficulty, urgency, dueDate, player: currentPlayer, status: "open", added: new Date().toISOString() })
    });
    await loadAllData();
    document.getElementById("title").value = "";
    dueDateInput.value = "";
    dueDateInput.disabled = false;
    noDueDate = false;
    noDueDateBtn.style.background = "#232526";
    noDueDateBtn.style.color = "#ffb347";
    noDueDateBtn.textContent = "Kein Fälligkeitsdatum nötig";
    document.querySelectorAll(".scale button").forEach(b => b.classList.remove("selected"));
    renderTasks();
  });
});
