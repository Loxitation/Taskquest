// Modal helpers for TaskQuest
export function showPromptModal(message, defaultValue = '') {
  // TODO: Replace window.prompt with a custom modal for better UX
  return window.prompt(message, defaultValue);
}

export function showConfirmModal(message) {
  // TODO: Replace window.confirm with a custom modal for better UX
  return window.confirm(message);
}

// Add more modal helpers as needed (e.g., star rating modal)
