// EXP and level calculation logic for TaskQuest
export function getLevel(exp) {
  // Level 1: 0-99, 2: 100-299, 3: 300-699, 4: 700-1499, 5: 1500-3099, etc.
  return Math.floor(Math.log2(exp / 100 + 1)) + 1;
}

export function getExpForTask(task) {
  let exp = 10 * (task.difficulty || 1);
  if (task.urgency && task.urgency > 0) exp += 5 * task.urgency;
  if (task.completionTime) exp += parseInt(task.completionTime);
  if (task.urgency && task.urgency > 0 && task.dueDate && task.completedAt && new Date(task.completedAt) <= new Date(task.dueDate)) {
    exp += 20;
  }
  if (task.dueDate && task.completedAt && new Date(task.completedAt) > new Date(task.dueDate)) {
    const daysLate = Math.ceil((new Date(task.completedAt) - new Date(task.dueDate)) / (1000*3600*24));
    exp = Math.floor(exp * Math.pow(0.8, daysLate));
    if (daysLate >= 21) exp = Math.max(-10, exp);
  }
  if (task.urgency === 0) {
    exp = Math.floor(exp * 0.5);
  }
  return Math.max(1, exp);
}
