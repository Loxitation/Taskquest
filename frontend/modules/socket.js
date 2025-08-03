// Socket.io real-time logic for TaskQuest
export let socket = null;
export function setupSocket(onDataChanged) {
  if (window.io && !socket) {
    socket = io();
    socket.on('dataChanged', onDataChanged);
  }
}

export let notificationSocket = null;
export function setupNotificationSocket(onNotification) {
  if (window.io && !notificationSocket) {
    notificationSocket = io();
    notificationSocket.on('notification', onNotification);
  }
}
