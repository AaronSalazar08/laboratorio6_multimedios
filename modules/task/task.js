export function addTask(tasks, text) {
  const newTask = { id: Date.now(), text, status: 'pending' };
  return [...tasks, newTask];
}

export function deleteTask(tasks, id) {
  return tasks.filter(t => t.id !== id);
}

export function updateTaskStatus(tasks, id, status) {
  return tasks.map(t => (t.id === id ? { ...t, status } : t));
}

export function getTaskById(tasks, id) {
  return tasks.find(t => t.id === id) ?? null;
}
