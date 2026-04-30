const STORAGE_KEY = 'todo_tasks';

export function saveTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

export function getTasks() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function clearTasks() {
  localStorage.removeItem(STORAGE_KEY);
}
