let currentPlayerId = null;
let players = [];
let tasks = [];
let archive = [];
let playerStats = [];
let currentFilter = "all"; // all, open, submitted, done

const rewards = [
  { level: 5, desc: "🧃 1h Wunschaktivität (Zocken, Binge watchen, doom scrollen etc)" },
  { level: 10, desc: "🧹 'Ich helf dir beim nächsten Projekt'-Joker" },
  { level: 15, desc: "🛠️ Kleinwerkzeug aus Fernost (Aliexpress etc.)" },
  { level: 20, desc: "🧩 1 Spiel nach deiner Wahl (max. 30 €)" },
  { level: 30, desc: "🍔 Du wirst bekocht oder darfst liefern lassen (max. 40€)" },
  { level: 40, desc: "🎁 Projektbudget: 50 € für Material deiner Wahl" },
  { level: 50, desc: "🛌 1 Abend voll nichts tun – Projektpause mit zocken oder quatschen" },
  { level: 60, desc: "🧠 Du delegierst eine Aufgabe komplett an den anderen" }
];

async function loadAllData() {
  [tasks, archive, playerStats, players] = await Promise.all([
    fetch('/api/tasks').then(r => r.json()),
    fetch('/api/archive').then(r => r.json()),
    fetch('/api/player-stats').then(r => r.json()),
    fetch('/api/players').then(r => r.json())
  ]);
}

function getPlayerById(id) {
  return players.find(p => p.id === id);
}
function getOtherPlayerId() {
  if (!currentPlayerId || players.length < 2) return null;
  return players.find(p => p.id !== currentPlayerId)?.id;
}
function getPlayerStatsById(id) {
  return playerStats.find(s => s.id === id) || { id, name: '', exp: 0, claimedRewards: [] };
}

function getLevel(exp) {
  // Make levels harder to reach: exponential growth
  return Math.floor(1 + Math.log2(1 + exp / 100));
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
  const stats = getPlayerStatsById(currentPlayerId);
  const level = getLevel(stats.exp||0);
  const rank = getRank(level);
  // Only trigger confetti if level up and not just on data update
  let prevLevel = parseInt(localStorage.getItem("taskquest_prev_level"));
  if (isNaN(prevLevel)) prevLevel = level;
  let confettiShownFor = localStorage.getItem("taskquest_confetti_shown_for") || "";
  const playerName = getPlayerById(currentPlayerId)?.name || '';
  document.getElementById("current-player-info").innerHTML = `Aktueller Spieler: <b>${playerName}</b> | Level: <b>${level}</b> <span style="margin-left:0.5em;">${rank}</span> | EXP: <b>${stats.exp||0}</b>`;
  // EXP progress bar (always visible, styled)
  let nextLevelExp = Math.ceil(100 * (Math.pow(2, level) - 1));
  let prevLevelExp = level > 1 ? Math.ceil(100 * (Math.pow(2, level-1) - 1)) : 0;
  let expInLevel = (stats.exp||0) - prevLevelExp;
  let expForLevel = nextLevelExp - prevLevelExp;
  let percent = Math.min(100, Math.round((expInLevel/expForLevel)*100));
  let bar = document.getElementById("exp-progress-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "exp-progress-bar";
    document.getElementById("current-player-info").appendChild(bar);
  }
  bar.innerHTML = `<div class='exp-bar-outer'><div class='exp-bar-inner' style='width:${percent}%;'></div></div><div class='exp-bar-label'>${expInLevel} / ${expForLevel} EXP bis Level ${level+1}</div>`;
  bar.style.display = "block";
  renderRewards();
  renderScoreboard(); // Add scoreboard update here
  // Confetti effect for every level gained (not just one)
  if (level > prevLevel) {
    for (let l = prevLevel + 1; l <= level; l++) {
      if (confettiShownFor !== `${currentPlayerId}_${l}`) {
        showConfetti();
        localStorage.setItem("taskquest_confetti_shown_for", `${currentPlayerId}_${l}`);
      }
    }
  }
  localStorage.setItem("taskquest_prev_level", level);
}

function showConfetti() {
  // Simple confetti effect
  for (let i = 0; i < 80; i++) {
    let conf = document.createElement("div");
    conf.className = "confetti";
    conf.style.left = Math.random()*100 + "vw";
    conf.style.top = "-10px";
    conf.style.background = `hsl(${Math.random()*360},90%,60%)`;
    conf.style.animationDelay = (Math.random()*2) + "s";
    document.body.appendChild(conf);
    setTimeout(() => conf.remove(), 3500);
  }
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
  if (!Array.isArray(archive)) archive = [];
  const list = document.getElementById("task-list");
  list.innerHTML = "";
  // Sort players so current user is first, then others by id
  const sortedPlayers = [
    ...players.filter(p => p.id === currentPlayerId),
    ...players.filter(p => p.id !== currentPlayerId)
  ];
  sortedPlayers.forEach((player, idx) => {
    const playerId = player.id;
    const playerName = player.name || '';
    // Section header
    const header = document.createElement("li");
    header.className = "task-section-header" + (playerId !== currentPlayerId ? " opponent-header" : "");
    header.textContent = playerId === currentPlayerId ? "Deine Aufgaben" : `Aufgaben von ${playerName}`;
    list.appendChild(header);
    // Filtered tasks for this player (only by creator)
    let filtered = tasks.filter(t => t.player === playerId);
    if (currentFilter === "open") filtered = filtered.filter(t => t.status === "open");
    if (currentFilter === "submitted") filtered = filtered.filter(t => t.status === "submitted");
    if (currentFilter === "done") filtered = [];
    filtered.forEach((task, idx) => {
      const li = document.createElement("li");
      if (task.status === "done") li.classList.add("done");
      if (playerId !== currentPlayerId) li.classList.add("opponent-task");
      // Title on top line
      let info = `<div class='task-title'>${task.title}</div>`;
      // Details below
      let details = `S${task.difficulty} / D${task.urgency}`;
      if (typeof task.completionTime !== 'undefined') {
        details += ` | Zeit gearbeitet: ${task.completionTime} min`;
      }
      if (task.dueDate) {
        const due = new Date(task.dueDate);
        const now = new Date();
        const diffDays = Math.ceil((due - now) / (1000*3600*24));
        let countdown = '';
        if (!isNaN(diffDays)) {
          if (diffDays > 0) countdown = ` | Fällig: ${due.toLocaleDateString()} (<span class='due-soon'>${diffDays} Tage übrig</span>)`;
          else if (diffDays === 0) countdown = ` | Fällig: ${due.toLocaleDateString()} (<span class='due-today'>Heute fällig!</span>)`;
          else countdown = ` | Fällig: ${due.toLocaleDateString()} (<span class='due-overdue'>Überfällig!</span>)`;
        }
        details += countdown;
      }
      // Show approver if more than 2 players and approver is set
      if (players.length > 2 && task.approver) {
        let approverName = '';
        if (task.approver === '__anyone__') {
          // If task is done and confirmedBy is set, show real approver
          if (task.status === 'done' && task.confirmedBy) {
            approverName = getPlayerById(task.confirmedBy)?.name || task.confirmedBy;
          } else {
            approverName = 'Jeder';
          }
        } else {
          approverName = getPlayerById(task.approver)?.name || task.approver;
        }
        details += ` | Prüfer: <b>${approverName}</b>`;
      }
      // Always show commentary for submitted tasks
      if (task.status === "submitted" && task.commentary) {
        details += `<br><b>Kommentar:</b> ${task.commentary}`;
      }
      if (task.status === "submitted" && task.approver === currentPlayerId) {
        details += `<br><b>Zeit:</b> ${task.completionTime ? task.completionTime + " min" : "-"}`;
      }
      li.innerHTML = `
        <span>${info}<div class='task-details'>${details}</div></span>
        <div class="task-actions"></div>
      `;
      const actions = li.querySelector(".task-actions");
      if (task.status === "open" && task.player === currentPlayerId) {
        let approverSelectHtml = '';
        if (players.length > 2) {
          approverSelectHtml = `<select class="approver-select" style="background:#232526;color:#ffb347;border:1.5px solid #ffb347;border-radius:8px;padding:0.3em 1em;margin-left:0.7em;font-size:1em;">`+
            `<option value="__anyone__">Jeder darf prüfen</option>` +
            players.filter(p => p.id !== currentPlayerId).map(p => `<option value="${p.id}">${p.name}</option>`).join('') +
            `</select>`;
        }
        actions.innerHTML = `<button class="submit-task">Abschließen</button>${approverSelectHtml}<input type="date" class="edit-due-date" value="${task.dueDate ? task.dueDate : ''}"><button class="delete-task">🗑️</button>`;
        const submitBtn = actions.querySelector(".submit-task");
        const approverSelect = actions.querySelector(".approver-select");
        submitBtn.addEventListener("click", async () => {
          let approverId = null;
          if (players.length > 2 && approverSelect) {
            approverId = approverSelect.value;
          } else {
            approverId = getOtherPlayerId();
          }
          await submitTask(task, approverId);
        });
        actions.querySelector(".delete-task").addEventListener("click", () => deleteTask(task));
        const dateInput = actions.querySelector(".edit-due-date");
        let lastDueDate = task.dueDate ? new Date(task.dueDate) : null;
        dateInput.addEventListener("change", async () => {
          let newDueDate = new Date(dateInput.value);
          if (isNaN(newDueDate.getTime())) {
            alert("Ungültiges Datum.");
            dateInput.value = lastDueDate ? lastDueDate.toISOString().slice(0,10) : '';
            return;
          }
          if (lastDueDate && newDueDate > lastDueDate) {
            // Penalty for extending
            let stats = getPlayerStatsById(currentPlayerId);
            stats.exp = Math.max(0, (stats.exp || 0) - 10);
            await savePlayerStats(currentPlayerId, stats.exp, stats.claimedRewards || []);
            alert("Fälligkeitsdatum verlängert. -10 EXP als kleine Strafe.");
          }
          // Update task on backend
          await fetch(`/api/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dueDate: newDueDate.toISOString().slice(0,10) })
          });
          await loadAllData();
          renderTasks();
        });
      } else if (task.status === "submitted" && (task.approver === currentPlayerId || (task.approver === "__anyone__" && players.some(p => p.id === currentPlayerId)))) {
        // Only allow approval if current user is the approver, or if 'anyone' is allowed
        actions.innerHTML = `<button class="approve-task">Bestätigen</button><button class="reject-task">Ablehnen</button>`;
        actions.querySelector(".approve-task").addEventListener("click", () => approveTask(task));
        actions.querySelector(".reject-task").addEventListener("click", () => rejectTask(task));
      } else if (task.status === "submitted" && task.player === currentPlayerId) {
        actions.innerHTML = `<span>Warte auf Bestätigung...</span>`;
      } else if (task.status === "submitted" && task.approver === "__anyone__") {
        actions.innerHTML = `<span>Warte auf Prüfer-Auswahl...</span>`;
      } else if (task.status === "done") {
        actions.innerHTML = `<span>Status: Abgeschlossen</span>`;
      } else if (task.player === currentPlayerId) {
        actions.innerHTML = `<button class="delete-task">🗑️</button>`;
        actions.querySelector(".delete-task").addEventListener("click", () => deleteTask(task));
      }
      // Only show difficulty/urgency dropdowns and time tracking if not submitted/done AND only for the task creator
      if ((task.status === "open" || (task.status !== "submitted" && task.status !== "done")) && task.player === currentPlayerId) {
        // Add controls to change difficulty and urgency for every task
        const difficultySelect = document.createElement('select');
        for (let i = 1; i <= 4; i++) {
          let opt = document.createElement('option');
          opt.value = i;
          opt.textContent = `S${i}`;
          if (task.difficulty == i) opt.selected = true;
          difficultySelect.appendChild(opt);
        }
        difficultySelect.className = 'difficulty-select';
        difficultySelect.title = 'Schwierigkeit ändern';
        difficultySelect.addEventListener('change', async () => {
          await fetch(`/api/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ difficulty: parseInt(difficultySelect.value) })
          });
          await loadAllData();
          renderTasks();
        });
        const urgencySelect = document.createElement('select');
        for (let i = 0; i <= 4; i++) {
          let opt = document.createElement('option');
          opt.value = i;
          opt.textContent = i === 0 ? 'Nicht dringend' : `D${i}`;
          if (task.urgency == i) opt.selected = true;
          urgencySelect.appendChild(opt);
        }
        urgencySelect.className = 'urgency-select';
        urgencySelect.title = 'Dringlichkeit ändern';
        urgencySelect.addEventListener('change', async () => {
          await fetch(`/api/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urgency: parseInt(urgencySelect.value) })
          });
          await loadAllData();
          renderTasks();
        });
        // Insert after the title
        li.querySelector('span').appendChild(difficultySelect);
        li.querySelector('span').appendChild(urgencySelect);
        // --- Notes field for task creator (visible in all states, but only for creator) ---
        // Place below dropdowns, above time tracking
        const notesDiv = document.createElement('div');
        notesDiv.className = 'task-notes-row';
        notesDiv.style.margin = '0.5em 0 0.5em 0';
        const notesLabel = document.createElement('label');
        notesLabel.textContent = 'Notizen:';
        notesLabel.style.display = 'block';
        notesLabel.style.fontWeight = 'bold';
        notesLabel.style.marginBottom = '0.2em';
        const notesArea = document.createElement('textarea');
        notesArea.className = 'task-notes-area';
        notesArea.value = task.notes || '';
        notesArea.rows = 3;
        notesArea.style.width = '100%';
        notesArea.style.maxHeight = '4.5em';
        notesArea.style.overflowY = 'auto';
        notesArea.style.resize = 'vertical';
        notesArea.style.background = '#232526';
        notesArea.style.color = '#ffb347';
        notesArea.style.border = '1.5px solid #ffb347';
        notesArea.style.borderRadius = '8px';
        notesArea.style.fontSize = '1em';
        notesArea.style.marginBottom = '0.2em';
        notesArea.placeholder = 'Fortschritt, Ideen, ToDos...';
        // Save notes on blur
        notesArea.addEventListener('change', async () => {
          await fetch(`/api/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: notesArea.value })
          });
        });
        notesDiv.appendChild(notesLabel);
        notesDiv.appendChild(notesArea);
        li.querySelector('span').appendChild(notesDiv);
        // --- End notes field ---
        // Add time tracking input for open tasks (only for creator)
        const timeDiv = document.createElement('div');
        timeDiv.className = 'time-track-row';
        let currentTime = parseInt(task.completionTime) || 0;
        timeDiv.innerHTML = `<label class='time-track-label'>Zeit gearbeitet (min):</label><input type='number' min='1' class='add-time-input' value=''><button class='add-time-btn'>Hinzufügen</button> <span class='current-time'>Gesamt: ${currentTime} min</span>`;
        const input = timeDiv.querySelector('.add-time-input');
        const btn = timeDiv.querySelector('.add-time-btn');
        btn.addEventListener('click', async () => {
          let addTime = parseInt(input.value);
          if (isNaN(addTime) || addTime < 1) {
            alert('Bitte gültige Minutenanzahl eingeben.');
            return;
          }
          let newTime = currentTime + addTime;
          await fetch(`/api/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completionTime: newTime })
          });
          await loadAllData();
          renderTasks();
        });
        li.querySelector('span').appendChild(timeDiv);
      }
      // Show notes field for creator in all other states (submitted, done, etc)
      else if (task.player === currentPlayerId) {
        // Place below dropdowns, above any other controls
        const notesDiv = document.createElement('div');
        notesDiv.className = 'task-notes-row';
        notesDiv.style.margin = '0.5em 0 0.5em 0';
        const notesLabel = document.createElement('label');
        notesLabel.textContent = 'Notizen:';
        notesLabel.style.display = 'block';
        notesLabel.style.fontWeight = 'bold';
        notesLabel.style.marginBottom = '0.2em';
        const notesArea = document.createElement('textarea');
        notesArea.className = 'task-notes-area';
        notesArea.value = task.notes || '';
        notesArea.rows = 3;
        notesArea.style.width = '100%';
        notesArea.style.maxHeight = '4.5em';
        notesArea.style.overflowY = 'auto';
        notesArea.style.resize = 'vertical';
        notesArea.style.background = '#232526';
        notesArea.style.color = '#ffb347';
        notesArea.style.border = '1.5px solid #ffb347';
        notesArea.style.borderRadius = '8px';
        notesArea.style.fontSize = '1em';
        notesArea.style.marginBottom = '0.2em';
        notesArea.placeholder = 'Fortschritt, Ideen, ToDos...';
        notesArea.addEventListener('change', async () => {
          await fetch(`/api/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: notesArea.value })
          });
        });
        notesDiv.appendChild(notesLabel);
        notesDiv.appendChild(notesArea);
        // Insert after the title and dropdowns
        li.querySelector('span').appendChild(notesDiv);
      }
      list.appendChild(li);
    });
    // Show done tasks from archive if filter is 'done' or 'all'
    if (currentFilter === "done" || currentFilter === "all") {
      let doneTasks = archive.filter(t => t.player === playerId);
      doneTasks.forEach((task, idx) => {
        const li = document.createElement("li");
        li.classList.add("done");
        // Title on top line
        let info = `<div class='task-title'>${task.title}</div>`;
        // Details below: S/D, due date, finished date, rating, exp, time taken
        let details = `S${task.difficulty} / D${task.urgency}`;
        if (task.dueDate) {
          const due = new Date(task.dueDate);
          details += ` | Fällig: ${due.toLocaleDateString()}`;
        }
        if (task.completedAt) {
          const finished = new Date(task.completedAt);
          details += ` | Abgeschlossen am: ${finished.toLocaleDateString()} ${finished.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
        }
        if (task.completionTime) {
          details += ` | Zeit: ${task.completionTime} min`;
        }
        // Show approver if more than 2 players and approver is set
        if (players.length > 2 && task.approver) {
          let approverName = '';
          if (task.approver === '__anyone__') {
            if (task.status === 'done' && task.confirmedBy) {
              approverName = getPlayerById(task.confirmedBy)?.name || task.confirmedBy;
            } else {
              approverName = 'Jeder';
            }
          } else {
            approverName = getPlayerById(task.approver)?.name || task.approver;
          }
          details += ` | Prüfer: <b>${approverName}</b>`;
        }
        // Show rating if present (always show 5 stars, filled or empty)
        let ratingStars = '';
        let ratingValue = typeof task.rating === 'number' ? task.rating : 0;
        ratingStars = `<span class='task-rating'>${'★'.repeat(ratingValue)}${'☆'.repeat(5-ratingValue)}</span>`;
        // Calculate earned EXP (base + bonus)
        let expEarned = getExpForTask(task) + (ratingValue * 2);
        details += ` | Bewertung: ${ratingStars} <span class='exp-earned'>(+${expEarned} EXP)</span>`;
        // Commentary and answer
        let commentaryBlock = '';
        if (task.commentary) {
          commentaryBlock += `<div class='commentary-block'><b>Kommentar:</b><div class='commentary-text'>${task.commentary}</div></div>`;
        }
        if (task.answerCommentary) {
          commentaryBlock += `<div class='commentary-block'><b>Antwort:</b><div class='commentary-text'>${task.answerCommentary}</div></div>`;
        }
        // If current user is creator, show notes field below answer/commentary
        let notesBlock = '';
        if (task.player === currentPlayerId) {
          notesBlock += `<div class='task-notes-row' style='margin:0.5em 0 0.5em 0;'>`;
          notesBlock += `<label style='display:block;font-weight:bold;margin-bottom:0.2em;'>Notizen:</label>`;
          notesBlock += `<textarea class='task-notes-area' rows='3' style='width:100%;max-height:4.5em;overflow-y:auto;resize:vertical;background:#232526;color:#ffb347;border:1.5px solid #ffb347;border-radius:8px;font-size:1em;margin-bottom:0.2em;' placeholder='Fortschritt, Ideen, ToDos...'>${task.notes || ''}</textarea>`;
          notesBlock += `</div>`;
        }
        li.innerHTML = `<span>${info}<div class='task-details'>${details}</div>${commentaryBlock}${notesBlock}</span><div class="task-actions"><span>Abgeschlossen</span></div>`;
        // Add event listener for notes textarea if present
        if (task.player === currentPlayerId) {
          const notesArea = li.querySelector('.task-notes-area');
          notesArea.addEventListener('change', async () => {
            await fetch(`/api/archive/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ notes: notesArea.value })
            });
          });
        }
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
  const stats = getPlayerStatsById(currentPlayerId);
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
  let stats = getPlayerStatsById(currentPlayerId);
  if (!stats.claimedRewards) stats.claimedRewards = [];
  if (!stats.claimedRewards.includes(level)) {
    stats.claimedRewards.push(level);
    await savePlayerStats(currentPlayerId, stats.exp, stats.claimedRewards);
    await loadAllData();
    renderRewards();
    updatePlayerInfo();
  }
}

async function savePlayerStats(playerId, exp, claimedRewards) {
  // Only send if playerId is defined and not empty
  if (!playerId) return;
  await fetch('/api/player-stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: playerId, exp, claimedRewards })
  });
}

// When submitting a task, show prompts for commentary and completion time
async function submitTask(task, approverId = null) {
  const commentary = prompt("Kommentar/Beweis (optional):", task.commentary || "");
  let completionTime = prompt("Benötigte Zeit in Minuten:", task.completionTime || "");
  completionTime = parseInt(completionTime);
  if (isNaN(completionTime) || completionTime < 1) {
    alert("Ungültige Zeitangabe.");
    return;
  }
  if (!approverId) {
    if (players.length > 2) {
      approverId = "__anyone__";
    } else {
      approverId = getOtherPlayerId();
    }
  }
  fetch(`/api/tasks/${task.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commentary,
      completionTime,
      completedAt: new Date().toISOString(),
      status: "submitted",
      approver: approverId
    })
  }).then(async () => {
    await loadAllData();
    renderTasks();
  });
}

function showApproverSelectModal() {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class='modal-content'>
      <h3>Prüfer auswählen</h3>
      <div id='approver-btn-list'></div>
      <div style='margin-top:1em;'>
        <button id='approver-cancel'>Abbrechen</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const btnList = modal.querySelector('#approver-btn-list');
  // Add 'anyone' option as a button
  const anyoneBtn = document.createElement('button');
  anyoneBtn.textContent = 'Jeder darf prüfen';
  anyoneBtn.style.display = 'block';
  anyoneBtn.style.margin = '0.5em auto';
  anyoneBtn.onclick = () => {
    modal.remove();
    resolve('__anyone__');
  };
  // We'll resolve the promise when a button is clicked
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  btnList.appendChild(anyoneBtn);
  // Add a button for each player except current
  players.filter(p => p.id !== currentPlayerId).forEach(p => {
    const btn = document.createElement('button');
    btn.textContent = p.name;
    btn.style.display = 'block';
    btn.style.margin = '0.5em auto';
    btn.onclick = () => {
      modal.remove();
      resolve(p.id);
    };
    btnList.appendChild(btn);
  });
  modal.querySelector('#approver-cancel').onclick = () => {
    modal.remove();
    resolve(null);
  };
  return promise;
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

// Helper to show a star rating modal and return a Promise with the rating
function showStarRatingModal() {
  return new Promise((resolve) => {
    // Create modal
    let modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.5)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '9999';
    let box = document.createElement('div');
    box.style.background = '#232526';
    box.style.padding = '2em 2em 1em 2em';
    box.style.borderRadius = '12px';
    box.style.textAlign = 'center';
    box.innerHTML = '<h3>Wie viele Sterne für die Ausführung?</h3>';
    let stars = [];
    let starsDiv = document.createElement('div');
    starsDiv.style.fontSize = '2.2em';
    starsDiv.style.margin = '0.5em 0 1em 0';
    for (let i = 1; i <= 5; i++) {
      let star = document.createElement('span');
      star.textContent = '★';
      star.style.cursor = 'pointer';
      star.style.color = '#FFD700'; // Always gold
      star.addEventListener('mouseenter', () => {
        stars.forEach((s, idx) => s.style.color = idx < i ? '#FFD700' : '#bbb');
      });
      star.addEventListener('mouseleave', () => {
        stars.forEach((s, idx) => s.style.color = s.selected ? '#FFD700' : '#bbb');
      });
      star.addEventListener('click', () => {
        stars.forEach((s, idx) => {
          s.selected = idx < i;
          s.style.color = s.selected ? '#FFD700' : '#bbb';
        });
        setTimeout(() => {
          document.body.removeChild(modal);
          resolve(i);
        }, 200);
      });
      stars.push(star);
      starsDiv.appendChild(star);
    }
    box.appendChild(starsDiv);
    let cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Abbrechen';
    cancelBtn.style.marginTop = '1em';
    cancelBtn.onclick = () => {
      document.body.removeChild(modal);
      resolve(null);
    };
    box.appendChild(cancelBtn);
    modal.appendChild(box);
    document.body.appendChild(modal);
  });
}

async function approveTask(task) {
  // Show star rating modal
  let rating = await showStarRatingModal();
  if (!rating) return;
  // Prompt for answer commentary
  let answerCommentary = prompt("Antwort-Kommentar (optional):", task.answerCommentary || "");
  // Mark as done and update player stats only if task is actually moved
  const response = await fetch(`/api/confirm/${task.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player: currentPlayerId, rating, answerCommentary })
  });
  const result = await response.json();
  await loadAllData();
  // Only award XP if the task is now in the archive and not in tasks
  const stillInTasks = tasks.find(t => t.id === task.id);
  const nowInArchive = archive.find(t => t.id === task.id);
  if (!stillInTasks && nowInArchive) {
    const exp = getExpForTask(nowInArchive);
    let stats = getPlayerStatsById(nowInArchive.player);
    // Add bonus XP for rating
    let bonus = (nowInArchive.rating || rating) * 2;
    stats.exp = (stats.exp || 0) + exp + bonus;
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
  if (!confirm(`Willst du die Aufgabe wirklich löschen?\nTitel: ${task.title}`)) return;
  // Extra confirmation
  const confirmText = prompt("Gib 'delete' ein, um die Aufgabe unwiderruflich zu löschen.");
  if (confirmText !== "delete") {
    alert("Löschen abgebrochen. Du musst 'delete' eingeben.");
    return;
  }
  fetch(`/api/tasks/${task.id}`, {
    method: 'DELETE'
  }).then(async () => {
    await loadAllData();
    renderTasks();
  });
}

// --- SOCKET.IO REAL-TIME UPDATES ---
let socket;
function setupSocket() {
  if (window.io) {
    socket = io();
    socket.on('dataChanged', async () => {
      await loadAllData();
      renderTasks();
      updatePlayerInfo();
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadAllData();
  // Player selection popup
  let savedPlayerId = localStorage.getItem("taskquest_player_id");
  if (!savedPlayerId || !players.some(p => p.id === savedPlayerId)) {
    let modal = document.createElement("div");
    modal.style.position = "fixed";
    modal.style.top = "0";
    modal.style.left = "0";
    modal.style.width = "100vw";
    modal.style.height = "100vh";
    modal.style.background = "rgba(0,0,0,0.6)";
    modal.style.display = "flex";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.zIndex = "9999";
    let box = document.createElement("div");
    box.style.background = "#232526";
    box.style.padding = "2em 2em 1em 2em";
    box.style.borderRadius = "12px";
    box.style.textAlign = "center";
    box.innerHTML = `<h2 style='color:#ffb347;'>Wer bist du?</h2>`;
    players.forEach(p => {
      let btn = document.createElement("button");
      btn.textContent = p.name;
      btn.style.margin = "1em";
      btn.style.background = "#232526";
      btn.style.color = "#ffb347";
      btn.style.border = "1.5px solid #ffb347";
      btn.style.borderRadius = "8px";
      btn.style.padding = "0.7em 2em";
      btn.style.fontSize = "1.2em";
      btn.style.cursor = "pointer";
      btn.onclick = () => {
        currentPlayerId = p.id;
        localStorage.setItem("taskquest_player_id", p.id);
        document.body.removeChild(modal);
        afterPlayerSelected();
      };
      box.appendChild(btn);
    });
    modal.appendChild(box);
    document.body.appendChild(modal);
    return;
  } else {
    currentPlayerId = savedPlayerId;
    afterPlayerSelected();
  }

  function afterPlayerSelected() {
    const playerSelect = document.getElementById("player-select");
    if (playerSelect) {
      playerSelect.innerHTML = players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
      playerSelect.value = currentPlayerId;
      playerSelect.addEventListener("change", async () => {
        currentPlayerId = playerSelect.value;
        localStorage.setItem("taskquest_player_id", currentPlayerId);
        await loadAllData();
        updatePlayerInfo();
        renderFilterBar();
        renderTasks();
      });
    }
    loadAllData().then(() => {
      updatePlayerInfo();
      buildScale("difficulty-scale", 4);
      buildScale("urgency-scale", 4);
      renderFilterBar();
      renderTasks();
      renderScoreboard();
    });
  }

  await loadAllData();
  updatePlayerInfo();
  buildScale("difficulty-scale", 4);
  buildScale("urgency-scale", 4);
  renderFilterBar();
  renderTasks();
  renderScoreboard(); // Ensure scoreboard is rendered on load

  // --- EXP & REWARDS COLLAPSE/EXPAND LOGIC ---
  const expRewardsBox = document.getElementById("exp-rewards-box");
  const expRewardsContent = document.getElementById("exp-rewards-content");
  const toggleExpRewardsBtn = document.getElementById("toggle-exp-rewards");
  if (toggleExpRewardsBtn && expRewardsContent) {
    let expanded = true;
    toggleExpRewardsBtn.addEventListener("click", () => {
      expanded = !expanded;
      expRewardsContent.style.display = expanded ? "block" : "none";
      toggleExpRewardsBtn.textContent = expanded ? "EXP & Belohnungen ausblenden" : "EXP & Belohnungen anzeigen";
    });
    // Start expanded
    expRewardsContent.style.display = "block";
    toggleExpRewardsBtn.textContent = "EXP & Belohnungen ausblenden";
  }

  // No due date button logic
  let noDueDate = false;
  const dueDateInput = document.getElementById("due-date");
  const noDueDateBtn = document.getElementById("no-due-date");
  if (noDueDateBtn) {
    noDueDateBtn.addEventListener("click", () => {
      noDueDate = !noDueDate;
      if (noDueDate) {
        if (dueDateInput) {
          dueDateInput.value = "";
          dueDateInput.disabled = true;
        }
        noDueDateBtn.style.background = "#ffb347";
        noDueDateBtn.style.color = "#232526";
        noDueDateBtn.textContent = "Fälligkeitsdatum aktivieren";
      } else {
        if (dueDateInput) dueDateInput.disabled = false;
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
      // Add input prompt for reset confirmation
      const confirmText = prompt("Gib 'reset' ein, um die App wirklich zurückzusetzen. Alle Aufgaben, das Archiv und Punkte werden gelöscht!");
      if (confirmText !== "reset") {
        alert("Zurücksetzen abgebrochen. Du musst 'reset' eingeben.");
        return;
      }
      // Clear backend files using new clear endpoints
      await fetch('/api/tasks/clear', { method: 'POST' });
      await fetch('/api/archive/clear', { method: 'POST' });
      await fetch('/api/player-stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId: 'Leon', exp: 0, claimedRewards: [] }) });
      await fetch('/api/player-stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId: 'Daniel', exp: 0, claimedRewards: [] }) });
      await loadAllData();
      renderTasks();
      location.reload();
    });
  }

  const addTaskBtn = document.getElementById("add-task");
  if (addTaskBtn) {
    addTaskBtn.addEventListener("click", async () => {
      const title = document.getElementById("title").value.trim();
      const difficulty = parseInt(document.querySelector("#difficulty-scale .selected")?.textContent);
      let urgency = 0;
      const urgencySelected = document.querySelector("#urgency-scale .selected");
      if (urgencySelected) {
        if (!urgencySelected.classList.contains("not-urgent")) urgency = parseInt(urgencySelected.textContent);
      }
      let dueDate = dueDateInput ? dueDateInput.value : "";
      if (noDueDate) dueDate = null;
      if (!title || !difficulty || (!urgencySelected) || (!dueDate && !noDueDate)) {
        alert("Bitte Titel, Schwierigkeit, Dringlichkeit und ggf. Fälligkeitsdatum angeben.");
        return;
      }
      // Enforce due date: max days in future = 2 + (5-urgency)*2 (urgency 0: no limit)
      if (!noDueDate) {
        if (urgency !== 0) {
          let maxDays = 2 + (5 - urgency) * 2;
          const today = new Date();
          const due = new Date(dueDate);
          const diffDays = Math.ceil((due - today) / (1000*3600*24));
          if (diffDays < 0) {
            alert("Das Fälligkeitsdatum muss in der Zukunft liegen.");
            return;
          }
          if (diffDays > maxDays) {
            alert(`Bei Dringlichkeit ${urgency} darf das Fälligkeitsdatum maximal ${maxDays} Tage in der Zukunft liegen.`);
            return;
          }
        } else {
          // Only check that due date is in the future
          const today = new Date();
          const due = new Date(dueDate);
          const diffDays = Math.ceil((due - today) / (1000*3600*24));
          if (diffDays < 0) {
            alert("Das Fälligkeitsdatum muss in der Zukunft liegen.");
            return;
          }
        }
      }
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, difficulty, urgency, dueDate, player: currentPlayerId, status: "open", added: new Date().toISOString() })
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
  }

  // Setup socket.io for real-time updates
  const script = document.createElement('script');
  script.src = '/socket.io/socket.io.js';
  script.onload = setupSocket;
  document.body.appendChild(script);

  // --- Align Schwierigkeit label with difficulty buttons in add-task form ---
  const diffLabel = document.querySelector("label[for='difficulty-scale']");
  const diffScale = document.getElementById("difficulty-scale");
  if (diffLabel && diffScale) {
    diffLabel.style.display = "inline-block";
    diffLabel.style.verticalAlign = "middle";
    diffLabel.style.marginRight = "0.7em";
    diffScale.style.display = "inline-block";
    diffScale.style.verticalAlign = "middle";
  }
});

function renderScoreboard() {
  // Ensure scoreboard box exists
  let box = document.getElementById("scoreboard-box");
  if (!box) {
    // Try to insert it to the left sidebar, before exp explanation box if possible
    const expBox = document.getElementById("exp-explanation-box");
    box = document.createElement("div");
    box.id = "scoreboard-box";
    box.className = "scoreboard-box";
    if (expBox && expBox.parentNode) {
      expBox.parentNode.insertBefore(box, expBox);
    } else {
      document.body.prepend(box);
    }
  }
  // Calculate stats for all players
  let html = '<h4>🏆 Scoreboard</h4><ul style="padding-left:0;list-style:none;">';
  players.forEach(p => {
    const stats = getPlayerStatsById(p.id);
    const level = getLevel(stats.exp||0);
    // Sum all completionTime from tasks and archive for this player
    let totalMinutes = 0;
    if (Array.isArray(tasks)) {
      totalMinutes += tasks.filter(t => t.player === p.id && t.completionTime).reduce((sum, t) => sum + parseInt(t.completionTime||0), 0);
    }
    if (Array.isArray(archive)) {
      totalMinutes += archive.filter(t => t.player === p.id && t.completionTime).reduce((sum, t) => sum + parseInt(t.completionTime||0), 0);
    }
    // Format minutes as hh:mm if over 60
    let timeStr = totalMinutes < 60 ? `${totalMinutes} min` : `${Math.floor(totalMinutes/60)}h ${totalMinutes%60}min`;
    html += `<li class="scoreboard-entry${p.id===currentPlayerId?' active-player':''}">
      <span class="scoreboard-player">${p.name}</span><br>
      Level: <b>${level}</b> | EXP: <b>${stats.exp||0}</b><br>
      Zeit investiert: <b>${timeStr}</b>
    </li>`;
  });
  html += '</ul>';
  box.innerHTML = html;
}
