// Notification logic for TaskQuest
export function showNotificationBanner(notification, rewards, currentPlayerId) {
  let shownNotificationIds = JSON.parse(localStorage.getItem('taskquest_shown_notifications') || '[]');
  if (shownNotificationIds.includes(notification.timestamp)) return;
  shownNotificationIds.push(notification.timestamp);
  localStorage.setItem('taskquest_shown_notifications', JSON.stringify(shownNotificationIds));
  let banner = document.createElement('div');
  banner.className = 'notification-banner';
  let emoji = '';
  if (notification.type === 'levelup') emoji = '<span class="celebrate-emoji">🎉</span>';
  if (notification.type === 'reward') emoji = '<span class="celebrate-emoji">🏆</span>';
  let msg = '';
  if (notification.type === 'levelup') {
    if (notification.playerId === currentPlayerId) {
      msg = `${emoji} <b>Glückwunsch!</b> Du bist jetzt Level <b>${notification.level}</b>!`;
    } else {
      msg = `${emoji} <b>${notification.playerName}</b> ist jetzt Level <b>${notification.level}</b>!`;
    }
  } else if (notification.type === 'reward') {
    let reward = rewards.find(r => r.id === notification.reward || r.level === notification.reward);
    if (notification.playerId === currentPlayerId) {
      msg = `${emoji} <b>Glückwunsch!</b> Du hast eine Belohnung eingelöst: <b>${reward ? reward.name : 'Belohnung'}</b>${reward && reward.description ? ` – ${reward.description}` : ''}!`;
    } else {
      msg = `${emoji} <b>${notification.playerName}</b> hat eine Belohnung eingelöst: <b>${reward ? reward.name : 'Belohnung'}</b>${reward && reward.description ? ` – ${reward.description}` : ''}!`;
    }
  }
  banner.innerHTML = msg;
  document.body.appendChild(banner);
  // Optionally trigger confetti here
  setTimeout(() => {
    banner.style.transition = 'opacity 0.7s';
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 800);
  }, 4200);
  markNotificationsSeen(currentPlayerId);
}

export async function markNotificationsSeen(playerId) {
  await fetch('/api/notifications/seen', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId })
  });
}

export async function showMissedNotifications(rewards, currentPlayerId) {
  const res = await fetch('/api/notifications');
  const notifications = await res.json();
  // Only show notifications not seen by this player
  const missed = notifications.filter(n => !n.seenBy || !n.seenBy.includes(currentPlayerId));
  // Show one after another
  for (const n of missed) {
    await new Promise(resolve => {
      showNotificationBanner(n, rewards, currentPlayerId);
      setTimeout(resolve, 4800); // Wait for banner to disappear (banner timeout + fade)
    });
  }
}
