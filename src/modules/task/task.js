export const PRIORITIES = ['urgent', 'high', 'normal', 'low'];
export const STATUSES = ['pending', 'progress', 'done'];

const TAG_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
];

function nowIso() {
  return new Date().toISOString();
}

function nextId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

export function createTask({ title, description = '', priority = 'normal', dueDate = null, tagIds = [], status = 'pending' }) {
  const ts = nowIso();
  return {
    id: nextId(),
    title: title.trim(),
    description: description.trim(),
    priority,
    dueDate,
    tagIds: [...tagIds],
    status,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function addTask(tasks, payload) {
  return [...tasks, createTask(payload)];
}

export function updateTask(tasks, id, patch) {
  return tasks.map(t =>
    t.id === id
      ? { ...t, ...patch, tagIds: patch.tagIds ? [...patch.tagIds] : t.tagIds, updatedAt: nowIso() }
      : t,
  );
}

export function deleteTask(tasks, id) {
  return tasks.filter(t => t.id !== id);
}

export function updateTaskStatus(tasks, id, status) {
  return updateTask(tasks, id, { status });
}

export function getTaskById(tasks, id) {
  return tasks.find(t => t.id === id) ?? null;
}

export function createTag(tags, name) {
  const trimmed = name.trim();
  if (!trimmed) { return tags; }

  const exists = tags.some(t => t.name.toLowerCase() === trimmed.toLowerCase());
  if (exists) { return tags; }

  const color = TAG_PALETTE[tags.length % TAG_PALETTE.length];
  return [...tags, { id: nextId(), name: trimmed, color }];
}

export function deleteTag(tags, tagId) {
  return tags.filter(t => t.id !== tagId);
}

export function detachTagFromTasks(tasks, tagId) {
  return tasks.map(t =>
    t.tagIds.includes(tagId)
      ? { ...t, tagIds: t.tagIds.filter(id => id !== tagId), updatedAt: nowIso() }
      : t,
  );
}

export function getTagById(tags, id) {
  return tags.find(t => t.id === id) ?? null;
}

export function isOverdue(task) {
  if (!task.dueDate || task.status === 'done') { return false; }
  return new Date(task.dueDate).getTime() < Date.now();
}

export function priorityRank(priority) {
  return PRIORITIES.indexOf(priority);
}

export function filterTasks(tasks, { search = '', tagId = null, priority = null } = {}) {
  const term = search.trim().toLowerCase();

  return tasks.filter(t => {
    if (term) {
      const haystack = `${t.title} ${t.description}`.toLowerCase();
      if (!haystack.includes(term)) { return false; }
    }
    if (tagId !== null && !t.tagIds.includes(tagId)) { return false; }
    if (priority && t.priority !== priority) { return false; }
    return true;
  });
}

export function sortTasks(tasks, mode = 'created') {
  const copy = [...tasks];

  switch (mode) {
    case 'priority':
      return copy.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
    case 'due':
      return copy.sort((a, b) => {
        const ax = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bx = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return ax - bx;
      });
    default:
      return copy.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }
}
