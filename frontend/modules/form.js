import { addTask } from './api.js';
import { players } from './players.js';

// Add-task form logic for TaskQuest
export function setupAddTaskForm(onTaskAdded, getPlayerId) {
  const box = document.getElementById('add-task-box');
  if (!box) return;
  const diff = document.getElementById('difficulty-scale');
  const urg = document.getElementById('urgency-scale');
  const addBtn = document.getElementById('add-task');
  const titleInput = document.getElementById('title');
  const dueDateInput = document.getElementById('due-date');
  const noDueBtn = document.getElementById('no-due-date');
  if (diff) {
    diff.innerHTML = [1,2,3,4,5].map(n => `<button type="button" class="scale-btn" data-value="${n}">${n}★</button>`).join('');
    diff.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        diff.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        diff.dataset.value = btn.dataset.value;
      };
    });
  }
  if (urg) {
    urg.innerHTML = [1,2,3,4,5].map(n => `<button type="button" class="scale-btn" data-value="${n}">${n}!</button>`).join('');
    urg.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        urg.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        urg.dataset.value = btn.dataset.value;
      };
    });
  }
  if (noDueBtn && dueDateInput) {
    noDueBtn.onclick = () => {
      dueDateInput.value = '';
      dueDateInput.disabled = true;
      setTimeout(() => { dueDateInput.disabled = false; }, 500); // allow re-enable
    };
  }
  if (addBtn) {
    addBtn.onclick = async e => {
      e.preventDefault();
      const title = titleInput.value.trim();
      const difficulty = diff?.dataset.value || '';
      const urgency = urg?.dataset.value || '';
      const dueDate = dueDateInput.value;
      if (!title || !difficulty || !urgency) return;
      const playerId = typeof getPlayerId === 'function' ? getPlayerId() : getPlayerId;
      await addTask({
        name: title,
        difficulty: Number(difficulty),
        urgency: Number(urgency),
        dueDate: dueDate || null,
        player: playerId
      });
      if (onTaskAdded) await onTaskAdded();
      titleInput.value = '';
      dueDateInput.value = '';
      if (diff) diff.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
      if (urg) urg.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
      diff.dataset.value = '';
      urg.dataset.value = '';
    };
  }
}
