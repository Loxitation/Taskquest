// API utility functions for TaskQuest (with authentication)
export async function fetchJSON(url, options = {}) {
  // Always include credentials for authentication
  const res = await fetch(url, {
    ...options,
    credentials: 'include'
  });
  
  if (res.status === 401) {
    // Unauthorized - redirect to login
    window.location.href = '/login.html';
    throw new Error('Authentication required');
  }
  
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getTasks() {
  return fetchJSON('/api/tasks');
}
export async function getArchive() {
  return fetchJSON('/api/archive');
}
export async function getPlayerStats() {
  return fetchJSON('/api/player-stats');
}
export async function getPlayers() {
  return fetchJSON('/api/players');
}
export async function getRanks() {
  return fetchJSON('/api/ranks');
}
export async function getRewards() {
  return fetchJSON('/api/rewards');
}
export async function addTask(task) {
  return fetchJSON('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task)
  });
}
export async function deleteTask(id) {
  return fetchJSON(`/api/tasks/${id}`, { method: 'DELETE' });
}
export async function updateTask(id, data) {
  return fetchJSON(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}
export async function completeTask(id, playerId, rating, answerCommentary) {
  // If rating/comment provided, this is an approval (by approver)
  if (typeof rating !== 'undefined') {
    return fetchJSON(`/api/confirm/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player: playerId, rating, answerCommentary })
    });
  } else {
    // Otherwise, this is a submission for approval (should use updateTask instead)
    return fetchJSON(`/api/mark-done/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player: playerId })
    });
  }
}
export async function updateClaimedRewards(playerId, name, exp, claimedRewards) {
  return fetchJSON('/api/player-stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: playerId, name, exp, claimedRewards })
  });
}

// Admin functions
export async function updateUser(userId, data) {
  return fetchJSON(`/api/admin/users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

// Add more API helpers as needed
