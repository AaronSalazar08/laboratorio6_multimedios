const STORAGE_KEY = 'todo_tasks';
const SCHEMA_VERSION = 2;

const STATUS_MAP = {
  pending: 'pending',
  progress: 'progress',
  done: 'done',
};

function migrateV1(rawTasks) {
  return rawTasks.map(t => ({
    id: t.id ?? Date.now() + Math.random(),
    title: t.text ?? t.title ?? 'Sin título',
    description: '',
    priority: 'normal',
    dueDate: null,
    tagIds: [],
    status: STATUS_MAP[t.status] ?? 'pending',
    createdAt: new Date(typeof t.id === 'number' ? t.id : Date.now()).toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

function emptyState() {
  return { version: SCHEMA_VERSION, tasks: [], tags: [] };
}

export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) { return emptyState(); }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyState();
  }

  if (Array.isArray(parsed)) {
    return { version: SCHEMA_VERSION, tasks: migrateV1(parsed), tags: [] };
  }

  if (parsed && typeof parsed === 'object') {
    return {
      version: SCHEMA_VERSION,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  }

  return emptyState();
}

export function saveState({ tasks, tags }) {
  const payload = { version: SCHEMA_VERSION, tasks, tags };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}
