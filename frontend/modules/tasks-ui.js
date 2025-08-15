// Task list rendering and task-related UI logic for TaskQuest
import { players, getPlayerById } from './players.js';
import { tasks, archive, getTasksByPlayerAndFilter } from './tasks.js';
import { getLevel, getExpForTask } from './exp.js';
import { deleteTask, updateTask, completeTask } from './api.js';

function getNoteKey(taskId) {
  return `task_note_${taskId}`;
}

function promptProofAndTime(defaultTime) {
  const proof = prompt('Bitte gib einen Nachweis/Beweis für die Erledigung der Aufgabe ein:');
  if (proof === null) return null;
  let time = prompt('Wie viele Minuten hast du insgesamt an dieser Aufgabe gearbeitet?', defaultTime);
  if (time === null) return null;
  time = parseInt(time, 10);
  if (isNaN(time) || time < 0) time = defaultTime;
  return { proof, time };
}

function promptRatingAndComment() {
  // Create a modal for star selection
  return new Promise(resolve => {
    // Create modal elements
    const modal = document.createElement('div');
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
    const box = document.createElement('div');
    box.style.background = '#232526';
    box.style.padding = '2em';
    box.style.borderRadius = '12px';
    box.style.textAlign = 'center';
    box.innerHTML = `<div style="font-size:1.2em;margin-bottom:1em;">Bewerte die Aufgabe:</div>`;
    // Star selector
    const starRow = document.createElement('div');
    starRow.style.fontSize = '2em';
    starRow.style.marginBottom = '1em';
    let selected = 5;
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      const star = document.createElement('span');
      star.innerHTML = '★';
      star.style.cursor = 'pointer';
      star.style.color = i <= selected ? '#FFD700' : '#555';
      star.addEventListener('mouseenter', () => {
        stars.forEach((s, idx) => s.style.color = idx < i ? '#FFD700' : '#555');
      });
      star.addEventListener('mouseleave', () => {
        stars.forEach((s, idx) => s.style.color = idx < selected ? '#FFD700' : '#555');
      });
      star.addEventListener('click', () => {
        selected = i;
        stars.forEach((s, idx) => s.style.color = idx < selected ? '#FFD700' : '#555');
      });
      stars.push(star);
      starRow.appendChild(star);
    }
    box.appendChild(starRow);
    // Comment input
    const commentInput = document.createElement('textarea');
    commentInput.placeholder = 'Kommentar zur Aufgabe (optional)';
    commentInput.style.width = '100%';
    commentInput.style.minHeight = '3em';
    commentInput.style.marginBottom = '1em';
    box.appendChild(commentInput);
    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.marginTop = '1em';
    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.style.marginRight = '1em';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Abbrechen';
    btnRow.appendChild(okBtn);
    btnRow.appendChild(cancelBtn);
    box.appendChild(btnRow);
    modal.appendChild(box);
    document.body.appendChild(modal);
    okBtn.onclick = () => {
      document.body.removeChild(modal);
      resolve({ rating: selected, comment: commentInput.value });
    };
    cancelBtn.onclick = () => {
      document.body.removeChild(modal);
      resolve(null);
    };
  });
}

// Helper to format minutes as dd.hh:mm or hh:mm or X min
function formatMinutes(minutes) {
  if (!minutes || isNaN(minutes) || minutes < 0) return '0 min';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) {
    return `${String(days).padStart(2,'0')}.${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;
  } else if (hours > 0) {
    return `${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;
  } else {
    return `${mins} min`;
  }
}

// Helper to format minutes as dd Tage, hh:mm or hh:mm or X min
function formatMinutesVerbose(minutes) {
  if (!minutes || isNaN(minutes) || minutes < 0) return '0 min';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) {
    return `${String(days).padStart(2,'0')} Tage, ${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;
  } else if (hours > 0) {
    return `${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;
  } else {
    return `${mins} min`;
  }
}

// Render the task list for the selected player and filter
export function renderTasksUI(playerId, filter) {
  const list = document.getElementById('task-list');
  if (!list) return;
  // --- Sorting controls ---
  let sortBy = window.taskSortBy || 'created';
  let sortDir = window.taskSortDir || 'desc';
  let sortHtml = `<div class="task-sort-bar" style="margin-bottom:0.7em;display:flex;align-items:center;gap:1em;">
    <label>Sortieren nach:</label>
    <select id="task-sort-by">
      <option value="created"${sortBy==='created'?' selected':''}>Erstellungsdatum</option>
      <option value="approved"${sortBy==='approved'?' selected':''}>Abschlussdatum</option>
    </select>
    <select id="task-sort-dir">
      <option value="desc"${sortDir==='desc'?' selected':''}>Absteigend</option>
      <option value="asc"${sortDir==='asc'?' selected':''}>Aufsteigend</option>
    </select>
  </div>`;
  list.innerHTML = sortHtml;
  // Sort players so current user is first
  const sortedPlayers = [
    ...players.filter(p => p.id === playerId),
    ...players.filter(p => p.id !== playerId)
  ];
  let html = '';
  sortedPlayers.forEach(player => {
    const pid = player.id;
    const pname = player.name || '';
    html += `<div class="task-user-section"><div class="task-user-header">${pid === playerId ? 'Deine Aufgaben' : `Aufgaben von ${pname}`}</div>`;
    // Filtered active tasks
    let filtered = [];
    if (filter === 'all') {
      filtered = tasks.filter(t => t.player === pid && t.status !== 'done');
    } else if (filter === 'offen') {
      filtered = tasks.filter(t => t.player === pid && t.status === 'open');
    } else if (filter === 'eingereicht') {
      filtered = tasks.filter(t => t.player === pid && t.status === 'submitted');
    }
    // --- Sort active tasks ---
    filtered = filtered.slice().sort((a, b) => {
      let aVal, bVal;
      if (sortBy === 'approved') {
        aVal = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        bVal = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      } else {
        aVal = a.id;
        bVal = b.id;
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    // Render active tasks
    html += filtered.map(task => {
      const due = task.dueDate ? new Date(task.dueDate) : null;
      const dueStr = due ? `${due.getFullYear()}-${String(due.getMonth()+1).padStart(2,'0')}-${String(due.getDate()).padStart(2,'0')}` : '';
      const note = localStorage.getItem(getNoteKey(task.id)) || '';
      const isOwner = (task.player === playerId || task.playerId === playerId);
      const isApprover = (task.approver === playerId);
      const approverOptions = `<option value="__anyone__">Jeder darf bestätigen</option>` +
        players.filter(p => p.id !== task.player).map(p => `<option value="${p.id}"${task.approver===p.id?' selected':''}>${p.name}</option>`).join('');
      let approverDropdown = '';
      if (task.status === 'open' && isOwner) {
        approverDropdown = `<select class="approver-select">${approverOptions}</select>`;
      } else if (task.status === 'submitted') {
        approverDropdown = `<span>Genehmiger: <b>${task.approver === '__anyone__' ? 'Jeder' : (getPlayerById(task.approver)?.name || '')}</b></span>`;
      }
      let approveControls = '';
      if (task.status === 'submitted' && (isApprover || (task.approver === '__anyone__' && playerId !== task.player && playerId !== task.playerId))) {
        approveControls = `<button class="approve-task">Genehmigen</button>` +
          `<button class="decline-task">Ablehnen</button>`;
      }
      let locked = (task.status === 'submitted' && !isApprover);
      let waitingApproval = (task.status === 'submitted' && !isApprover);
      // Hide due date and time worked input fields for submitted tasks (only for owner)
      const showDueDate = isOwner && task.status === 'open';
      const showTimeWorked = isOwner && task.status === 'open';
      // Notes, difficulty, urgency: only editable for owner
      const notesDisabled = !isOwner || locked ? 'disabled' : '';
      const diffDisabled = !isOwner || locked ? 'disabled' : '';
      const urgDisabled = !isOwner || locked ? 'disabled' : '';
      // Always show the creator's notes for all users
      const noteField = `<textarea class="task-note" placeholder="Fortschritt, Ideen, ToDos..." ${notesDisabled} style="max-height:4.2em;min-height:2.5em;overflow-y:auto;">${note}</textarea>`;
      // Only show the notes input field for the owner
      const noteFieldBlock = isOwner ? `<div class="task-note-row">
        <label>Notizen:</label><br>
        ${noteField}
      </div>` : '';
      // Show due date and time spent for all users (readonly for non-owners)
      let dueDateInfo = '';
      if (task.dueDate && !isOwner) {
        // Format as dd.mm.yyyy for non-owners
        const dueDateObj = task.dueDate ? new Date(task.dueDate) : null;
        const dueDateStr = dueDateObj ? `${String(dueDateObj.getDate()).padStart(2,'0')}.${String(dueDateObj.getMonth()+1).padStart(2,'0')}.${dueDateObj.getFullYear()}` : '';
        dueDateInfo = `<div class="task-due-row"><b>Fällig bis:</b> ${dueDateStr}</div>`;
      } else if (task.dueDate) {
        dueDateInfo = `<div class="task-due-row"><b>Fällig bis:</b> ${dueStr}</div>`;
      }
      const timeSpentInfo = `<div class="task-minutes-row"><b>Zeit gearbeitet:</b> ${formatMinutesVerbose(task.minutesWorked || 0)}</div>`;
      // Commentary for non-owners
      let commentaryBlock = '';
      if (!isOwner && task.commentary) {
        const ownerName = (players.find(p => p.id === task.player) || {}).name || 'Spieler';
        commentaryBlock = `<div class="commentary-block"><b>Notizen von ${ownerName}:</b><br><span class="commentary-text">${task.commentary}</span></div>`;
      }
      // Improved dropdowns for difficulty and urgency
      const difficultyOptions = [1,2,3,4,5].map(n => `<option value="${n}"${task.difficulty==n?' selected':''}>S${n}</option>`).join('');
      const urgencyOptions = [1,2,3,4,5].map(n => `<option value="${n}"${task.urgency==n?' selected':''}>D${n}${n==5?' (Dringend)':''}</option>`).join('');
      return `
        <li class="task-card" data-taskid="${task.id}">
          <div class="task-title">${task.name}</div>
          <div class="task-select-row">
            <select class="difficulty-select styled-select" ${diffDisabled}>${difficultyOptions}</select>
            <select class="urgency-select styled-select" ${urgDisabled}>${urgencyOptions}</select>
          </div>
          ${noteFieldBlock}
          ${!isOwner ? dueDateInfo : ''}
          ${!isOwner ? timeSpentInfo : ''}
          ${commentaryBlock}
          ${(task.status === 'submitted' || task.status === 'approved' || task.status === 'done') && task.commentary && isOwner ? `<div class="commentary-block"><b>Kommentar vom Spieler:</b><br><span class="commentary-text">${task.commentary}</span></div>` : ''}
          ${(task.status === 'approved' || task.status === 'done') && task.answerCommentary ? (() => {
  const approverName = (players.find(p => p.id === task.approver) || {}).name || 'Genehmiger';
  return `<div class="commentary-block"><b>Kommentar von ${approverName}:</b><br><span class="commentary-text">${task.answerCommentary}</span></div>`;
})() : ''}
          ${showTimeWorked ? `<div class="task-time-row">
            <label>Zeit gearbeitet (min):</label>
            <input type="number" min="0" class="minutes-input" value="${task.minutesWorked || 0}" ${locked?'disabled':''}/>
            <button class="add-minutes" ${locked?'disabled':''}>Hinzufügen</button>
            <span>Gesamt: ${formatMinutesVerbose(task.minutesWorked || 0)}</span>
          </div>` : ''}
          <div class="task-action-row">
            ${task.status === 'open' && isOwner ? `<button class="complete-task">Abschließen</button>` : ''}
            ${approverDropdown}
            ${showDueDate ? `<input type="date" class="due-date-input" value="${dueStr}" ${locked?'disabled':''}/>` : ''}
            ${isOwner && task.status === 'open' ? `<button class="delete-task">🗑️</button>` : ''}
            ${approveControls}
            ${waitingApproval ? '<span class="waiting-approval">Warte auf Genehmigung...</span>' : ''}
          </div>
        </li>
      `;
    }).join('');
    // Render archived tasks if needed
    if (filter === 'erledigt' || filter === 'all') {
      let doneTasks = archive.filter(t => t.player === pid);
      // --- Sort archived tasks ---
      doneTasks = doneTasks.slice().sort((a, b) => {
        let aVal, bVal;
        if (sortBy === 'approved') {
          aVal = a.completedAt ? new Date(a.completedAt).getTime() : 0;
          bVal = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        } else {
          aVal = a.id;
          bVal = b.id;
        }
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      });
      html += doneTasks.map(task => {
        const note = localStorage.getItem(getNoteKey(task.id)) || '';
        // Format minutes for archive: dd Tage, hh:mm if days > 0
        let totalMinutes = task.minutesWorked || task.hours || 0;
        let timeStr = '';
        if (!totalMinutes || isNaN(totalMinutes) || totalMinutes < 0) {
          timeStr = '0 min';
        } else {
          const days = Math.floor(totalMinutes / 1440);
          const hours = Math.floor((totalMinutes % 1440) / 60);
          const mins = totalMinutes % 60;
          if (days > 0) {
            timeStr = `${String(days).padStart(2,'0')} Tage, ${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;
          } else if (hours > 0) {
            timeStr = `${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;
          } else {
            timeStr = `${mins} min`;
          }
        }
        // Gold stars for rating, green for exp
        let ratingStars = '';
        if (task.rating) {
          ratingStars = `<span style="color:#FFD700;font-size:1.2em;">${'★'.repeat(task.rating)}</span><span style="color:#555;font-size:1.2em;">${'☆'.repeat(5-task.rating)}</span>`;
        } else {
          ratingStars = '-';
        }
        let expStr = task.exp ? `<span style="color:#4CAF50;font-weight:bold;">(+${task.exp} EXP)</span>` : '';
        return `<div class="task-archive-card" style="border:2px solid #888;padding:1rem;margin-bottom:1.2rem;border-radius:12px;background:#232526;">
          <div style="font-weight:bold;">${task.name}</div>
          <div>S${task.difficulty || '-'} / D${task.urgency || '-'} | Abgeschlossen am: ${task.completedAt ? new Date(task.completedAt).toLocaleString() : '-'} | Zeit: ${timeStr} | Bewertung: ${ratingStars} ${expStr}</div>
          <div><b>Notizen von ${(players.find(p => p.id === task.player) || {}).name || 'Spieler'}:</b><br><span class="commentary-text">${task.commentary || ''}</span></div>
          ${task.answerCommentary ? (() => {
    const approverName = (players.find(p => p.id === task.approver) || {}).name || 'Genehmiger';
    return `<div><b>Kommentar von ${approverName}:</b><br><span class=\"commentary-text\">${task.answerCommentary}</span></div>`;
  })() : ''}
          <div style="color:#ffb347;font-weight:bold;">Abgeschlossen</div>
        </div>`;
      }).join('');
    }
    html += '</div>';
  });
  list.innerHTML += html;
  // Add event listeners for sorting controls
  const sortBySel = document.getElementById('task-sort-by');
  const sortDirSel = document.getElementById('task-sort-dir');
  if (sortBySel && sortDirSel) {
    sortBySel.onchange = () => {
      window.taskSortBy = sortBySel.value;
      renderTasksUI(playerId, filter);
    };
    sortDirSel.onchange = () => {
      window.taskSortDir = sortDirSel.value;
      renderTasksUI(playerId, filter);
    };
  }
  // Add event listeners for all controls
  Object.entries([...sortedPlayers].reduce((acc, p) => { acc[p.id] = tasks.filter(t => t.player === p.id); return acc; }, {})).forEach(([uid, tasksArr]) => {
    tasksArr.forEach(task => {
      const card = list.querySelector(`.task-card[data-taskid="${task.id}"]`);
      if (!card) return;
      const isOwner = (task.player === playerId || task.playerId === playerId);
      const isApprover = (task.approver === playerId);
      let locked = (task.status === 'submitted' && !isApprover);
      const due = task.dueDate ? new Date(task.dueDate) : null;
      const dueStr = due ? `${due.getFullYear()}-${String(due.getMonth()+1).padStart(2,'0')}-${String(due.getDate()).padStart(2,'0')}` : '';
      // Notes
      const noteEl = card.querySelector('.task-note');
      if (noteEl && isOwner && task.status === 'open') {
        noteEl.addEventListener('input', e => {
          localStorage.setItem(getNoteKey(task.id), noteEl.value);
        });
        noteEl.addEventListener('blur', async e => {
          await updateTask(task.id, { commentary: noteEl.value });
        });
      }
      // Difficulty
      const diffSel = card.querySelector('.difficulty-select');
      if (diffSel && isOwner && task.status === 'open') {
        diffSel.addEventListener('change', async e => {
          await updateTask(task.id, { difficulty: Number(diffSel.value) });
        });
      }
      // Urgency
      const urgSel = card.querySelector('.urgency-select');
      if (urgSel && isOwner && task.status === 'open') {
        urgSel.addEventListener('change', async e => {
          await updateTask(task.id, { urgency: Number(urgSel.value) });
        });
      }
      // Approver (only on open tasks)
      const apprSel = card.querySelector('.approver-select');
      if (apprSel && isOwner && task.status === 'open') {
        apprSel.addEventListener('change', async e => {
          await updateTask(task.id, { approver: apprSel.value });
        });
      }
      // Delete
      const delBtn = card.querySelector('.delete-task');
      if (delBtn && isOwner && task.status === 'open') {
        delBtn.addEventListener('click', async e => {
          if (confirm('Task wirklich löschen?')) {
            await deleteTask(task.id);
          }
        });
      }
      // Complete (submit for approval)
      const compBtn = card.querySelector('.complete-task');
      if (compBtn && isOwner && task.status === 'open') {
        compBtn.addEventListener('click', async e => {
          const apprSel = card.querySelector('.approver-select');
          let approver = apprSel ? apprSel.value : '__anyone__';
          if (!approver) approver = '__anyone__';
          const { proof, time } = promptProofAndTime(task.minutesWorked || 0) || {};
          if (proof == null || time == null) return;
          await updateTask(task.id, {
            status: 'submitted',
            approver,
            proof,
            minutesWorked: time
          });
        });
      }
      // Approve (for approver or anyone except owner if approver is '__anyone__')
      const approveBtn = card.querySelector('.approve-task');
      if (approveBtn && task.status === 'submitted' && (isApprover || (task.approver === '__anyone__' && playerId !== task.player && playerId !== task.playerId))) {
        approveBtn.addEventListener('click', async e => {
          const result = await promptRatingAndComment();
          if (!result || result.rating == null) return;
          await completeTask(task.id, playerId, result.rating, result.comment);
        });
      }
      // Decline (reset to open)
      const declineBtn = card.querySelector('.decline-task');
      if (declineBtn && task.status === 'submitted' && (isApprover || (task.approver === '__anyone__' && playerId !== task.player && playerId !== task.playerId))) {
        declineBtn.addEventListener('click', async e => {
          await updateTask(task.id, {
            status: 'open',
            approver: '',
            proof: '',
          });
        });
      }
      // Minutes worked
      const minInput = card.querySelector('.minutes-input');
      const addMinBtn = card.querySelector('.add-minutes');
      if (minInput && addMinBtn && isOwner && task.status === 'open') {
        addMinBtn.addEventListener('click', async e => {
          e.preventDefault();
          const addValue = Number(minInput.value);
          if (isNaN(addValue) || addValue <= 0) return;
          const currentValue = Number(task.minutesWorked) || 0;
          const newValue = currentValue + addValue;
          await updateTask(task.id, { minutesWorked: newValue });
          minInput.value = 0; // Reset input after adding
        });
      }
      // Due date
      const dueInput = card.querySelector('.due-date-input');
      if (dueInput && isOwner && task.status === 'open') {
        dueInput.addEventListener('change', async e => {
          await updateTask(task.id, { dueDate: dueInput.value });
        });
      }
      // Notes (commentary) - sync on blur for all users
      if (noteEl && task.status !== 'done') {
        // Always show the latest commentary for all users
        noteEl.value = localStorage.getItem(getNoteKey(task.id)) || '';
        noteEl.readOnly = !isOwner || locked;
        noteEl.placeholder = "Fortschritt, Ideen, ToDos...";
        noteEl.addEventListener('blur', async e => {
          if (isOwner && task.status === 'open') {
            await updateTask(task.id, { commentary: noteEl.value });
          }
        });
      }
      // Minutes worked - sync on blur for all users
      if (minInput) {
        minInput.value = 0;
        minInput.readOnly = !isOwner || locked;
        minInput.addEventListener('blur', async e => {
          // Do nothing on blur, only add-minutes button should add
        });
      }
      // Due date - sync on change for all users
      if (dueInput) {
        dueInput.value = dueStr;
        dueInput.readOnly = !isOwner || locked;
        dueInput.addEventListener('change', async e => {
          if (dueInput.value !== (task.dueDate || '')) {
            await updateTask(task.id, { dueDate: dueInput.value });
          }
        });
      }
      // Re-render UI after updates to show latest data for all users
      [noteEl, minInput, dueInput].forEach(el => {
        if (el) {
          el.addEventListener('change', () => setTimeout(() => renderTasksUI(playerId, filter), 300));
          el.addEventListener('blur', () => setTimeout(() => renderTasksUI(playerId, filter), 300));
        }
      });
    });
  });
}
