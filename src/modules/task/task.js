export const PRIORITIES = ['urgent', 'high', 'normal', 'low'];
export const STATUSES = ['pending', 'progress', 'done'];

/**
 * Helpers puros sobre el modelo de tarea. La persistencia vive en `storage/`.
 *
 * Shape de Task (después de mapear desde Supabase):
 *   {
 *     id: number,
 *     title: string,
 *     description: string,
 *     priority: 'urgent'|'high'|'normal'|'low',
 *     dueDate: string ISO | null,
 *     status: 'pending'|'progress'|'done',
 *     tagIds: number[],
 *     createdAt: string ISO,
 *     updatedAt: string ISO,
 *   }
 */

export function getTaskById(tasks, id) {
  return tasks.find(t => t.id === id) ?? null;
}

export function getTagById(tags, id) {
  return tags.find(t => t.id === id) ?? null;
}

export function isOverdue(task) {
  if (!task.dueDate || task.status === 'done') { return false; }
  return new Date(task.dueDate).getTime() < Date.now();
}

export function nextStatus(status) {
  const i = STATUSES.indexOf(status);
  return i < 0 || i === STATUSES.length - 1 ? null : STATUSES[i + 1];
}

export function prevStatus(status) {
  const i = STATUSES.indexOf(status);
  return i <= 0 ? null : STATUSES[i - 1];
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
