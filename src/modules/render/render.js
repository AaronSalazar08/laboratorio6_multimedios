import * as storage from '../storage/storage.js';
import { OfflineError } from '../storage/storage.js';
import {
  STATUSES,
  getTaskById,
  getTagById,
  isOverdue,
  nextStatus,
  prevStatus,
  filterTasks,
  sortTasks,
} from '../task/task.js';

const PRIORITY_LABELS = {
  urgent: 'Urgente',
  high: 'Alta',
  normal: 'Normal',
  low: 'Baja',
};

const STATUS_LABELS = {
  pending: 'Pendiente',
  progress: 'En progreso',
  done: 'Completado',
};

const THEME_KEY = 'taskboard_theme';

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

const root = document.documentElement;

const dom = {
  offlineBanner:    $('#offline-banner'),
  offlineBannerText:$('#offline-banner-text'),
  toastContainer:   $('#toast-container'),
  searchInput:      $('#search-input'),
  themeToggle:      $('#theme-toggle'),
  themeIcon:        $('.theme-icon'),
  newTaskBtn:       $('#new-task-btn'),
  manageTagsBtn:    $('#manage-tags-btn'),
  filterPriority:   $('#filter-priority'),
  sortMode:         $('#sort-mode'),
  tagFilterList:    $('#tag-filter-list'),
  board:            $('#board'),
  listView:         $('#list-view'),
  listTbody:        $('#list-tbody'),
  listEmpty:        $('#list-empty'),
  pendingCount:     $('#pending-count'),
  cardTemplate:     $('#task-card-template'),
  taskModal:        $('#task-modal'),
  taskForm:         $('#task-form'),
  modalTitle:       $('#modal-title'),
  fieldTitle:       $('#field-title'),
  fieldDescription: $('#field-description'),
  fieldPriority:    $('#field-priority'),
  fieldDue:         $('#field-due'),
  fieldStatus:      $('#field-status'),
  fieldTags:        $('#field-tags'),
  modalClose:       $('#modal-close'),
  cancelBtn:        $('#cancel-btn'),
  deleteTaskBtn:    $('#delete-task-btn'),
  taskFormError:    $('#task-form-error'),
  tagsModal:        $('#tags-modal'),
  tagCreateForm:    $('#tag-create-form'),
  tagInput:         $('#tag-input'),
  tagColorInput:    $('#tag-color-input'),
  tagAdminList:     $('#tag-admin-list'),
  tagsModalClose:   $('#tags-modal-close'),
  tagsDoneBtn:      $('#tags-done-btn'),
  lists: {
    pending:  $('#list-pending'),
    progress: $('#list-progress'),
    done:     $('#list-done'),
  },
  badges: {
    pending:  $('#badge-pending'),
    progress: $('#badge-progress'),
    done:     $('#badge-done'),
  },
  tabCounts: {
    pending:  $('#tab-count-pending'),
    progress: $('#tab-count-progress'),
    done:     $('#tab-count-done'),
  },
  emptyStates: {
    pending:  $('[data-empty="pending"]'),
    progress: $('[data-empty="progress"]'),
    done:     $('[data-empty="done"]'),
  },
};

const state = {
  tasks: [],
  tags: [],
  online: false,
  filters: { search: '', tagId: null, priority: null },
  sort: 'created',
  view: 'board',
  activeTab: 'pending',
  editingId: null,
  formTagIds: [],
  draggedId: null,
  // Suprime parpadeo cuando un cambio local dispara su propio evento realtime de eco.
  pendingRefresh: false,
};

/* ---------- Theme ---------- */

function applyTheme(theme) {
  root.dataset.theme = theme;
  if (dom.themeIcon) {
    dom.themeIcon.textContent = theme === 'dark' ? '☀' : '☾';
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ?? (prefersDark ? 'dark' : 'light'));
}

function toggleTheme() {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

/* ---------- Toasts ---------- */

function showToast(message, { variant = 'info', duration = 4000 } = {}) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${variant}`;
  toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');
  toast.textContent = message;
  dom.toastContainer.append(toast);

  setTimeout(() => {
    toast.classList.add('is-leaving');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

/* ---------- Offline banner ---------- */

function setOnline(online, reason = null) {
  state.online = online;
  if (online) {
    dom.offlineBanner.hidden = true;
    return;
  }
  dom.offlineBanner.hidden = false;
  dom.offlineBannerText.textContent = reason === 'no-credentials'
    ? 'Supabase no está configurado. Configura .env.local para guardar tus tareas.'
    : 'Sin conexión con Supabase. Modo solo lectura — tus cambios no se guardarán.';
}

function reportError(err, fallbackMessage) {
  if (err instanceof OfflineError) {
    showToast(err.message, { variant: 'error' });
    return;
  }
  console.error(err);
  showToast(fallbackMessage ?? 'Algo falló. Intenta de nuevo.', { variant: 'error' });
}

/* ---------- Formatting ---------- */

function formatDue(iso) {
  if (!iso) { return ''; }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) { return ''; }

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  if (sameDay) {
    return `Hoy ${time}`;
  }

  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) + ` · ${time}`;
}

function toLocalInput(iso) {
  if (!iso) { return ''; }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) { return ''; }
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value) {
  if (!value) { return null; }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* ---------- Filters / search ---------- */

function visibleTasks() {
  return sortTasks(filterTasks(state.tasks, state.filters), state.sort);
}

/* ---------- Render: board ---------- */

function renderTagBadges(container, tagIds) {
  container.replaceChildren();
  tagIds.forEach(id => {
    const tag = getTagById(state.tags, id);
    if (!tag) { return; }
    const span = document.createElement('span');
    span.className = 'task-tag-badge';
    span.style.setProperty('--tag-color', tag.color);
    span.textContent = tag.name;
    container.append(span);
  });
}

function buildCard(task) {
  const clone = dom.cardTemplate.content.cloneNode(true);
  const card  = clone.querySelector('.task-card');

  card.dataset.id = task.id;
  card.dataset.priority = task.priority;
  card.setAttribute('aria-label', `${task.title}, prioridad ${PRIORITY_LABELS[task.priority]}, estado ${STATUS_LABELS[task.status]}`);

  card.querySelector('[data-role="title"]').textContent = task.title;
  card.querySelector('[data-role="description"]').textContent = task.description ?? '';
  card.querySelector('[data-role="edit-label"]').textContent = `Editar tarea ${task.title}`;

  renderTagBadges(card.querySelector('[data-role="tags"]'), task.tagIds);

  const dueEl = card.querySelector('[data-role="due"]');
  if (task.dueDate) {
    dueEl.textContent = formatDue(task.dueDate);
    dueEl.classList.toggle('is-overdue', isOverdue(task));
  } else {
    dueEl.remove();
  }

  card.querySelector('[data-role="priority-label"]').textContent = PRIORITY_LABELS[task.priority];

  configureNavButtons(card, task);

  if (task.status === 'done') { card.classList.add('is-done'); }
  if (isOverdue(task)) { card.classList.add('is-overdue'); }

  return card;
}

function configureNavButtons(card, task) {
  const prev = prevStatus(task.status);
  const next = nextStatus(task.status);

  const prevBtn = card.querySelector('[data-role="move-prev"]');
  const nextBtn = card.querySelector('[data-role="move-next"]');
  const prevLabel = card.querySelector('[data-role="move-prev-label"]');
  const nextLabel = card.querySelector('[data-role="move-next-label"]');

  if (prev) {
    prevBtn.disabled = false;
    prevLabel.textContent = `Mover "${task.title}" a ${STATUS_LABELS[prev]}`;
  } else {
    prevBtn.disabled = true;
    prevBtn.setAttribute('aria-disabled', 'true');
    prevLabel.textContent = `No se puede mover hacia atrás desde ${STATUS_LABELS[task.status]}`;
  }

  if (next) {
    nextBtn.disabled = false;
    nextLabel.textContent = `Mover "${task.title}" a ${STATUS_LABELS[next]}`;
  } else {
    nextBtn.disabled = true;
    nextBtn.setAttribute('aria-disabled', 'true');
    nextLabel.textContent = `No se puede mover hacia adelante desde ${STATUS_LABELS[task.status]}`;
  }
}

function renderBoard(tasks) {
  const counts = { pending: 0, progress: 0, done: 0 };

  STATUSES.forEach(status => {
    dom.lists[status].replaceChildren();
  });

  tasks.forEach(task => {
    counts[task.status]++;
    dom.lists[task.status].append(buildCard(task));
  });

  STATUSES.forEach(status => {
    const count = counts[status];
    const noun = count === 1 ? 'tarea' : 'tareas';
    dom.badges[status].textContent = count;
    dom.badges[status].setAttribute('aria-label', `${count} ${noun} en columna ${STATUS_LABELS[status]}`);
    dom.tabCounts[status].textContent = count;
    dom.emptyStates[status].hidden = count > 0;
  });

  dom.pendingCount.textContent = counts.pending + counts.progress;
}

/* ---------- Render: list view ---------- */

function buildListRow(task) {
  const tr = document.createElement('tr');
  tr.dataset.id = task.id;

  const tdTask = document.createElement('td');
  const title  = document.createElement('div');
  title.className = 'row-title';
  title.textContent = task.title;
  tdTask.append(title);

  if (task.description) {
    const desc = document.createElement('div');
    desc.className = 'row-description';
    desc.textContent = task.description.length > 80 ? task.description.slice(0, 80) + '…' : task.description;
    tdTask.append(desc);
  }

  const tdTags = document.createElement('td');
  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'row-tags';
  renderTagBadges(tagsWrap, task.tagIds);
  tdTags.append(tagsWrap);

  const tdPriority = document.createElement('td');
  const prioLabel = document.createElement('span');
  prioLabel.className = 'task-priority-label';
  prioLabel.style.setProperty('--card-accent', `var(--color-${task.priority})`);
  prioLabel.textContent = PRIORITY_LABELS[task.priority];
  tdPriority.append(prioLabel);

  const tdDue = document.createElement('td');
  if (task.dueDate) {
    tdDue.textContent = formatDue(task.dueDate);
    if (isOverdue(task)) {
      tdDue.style.color = 'var(--color-danger)';
      tdDue.style.fontWeight = '600';
    }
  } else {
    tdDue.textContent = '—';
    tdDue.style.color = 'var(--color-text-subtle)';
  }

  const tdStatus = document.createElement('td');
  const statusBadge = document.createElement('span');
  statusBadge.className = 'row-status';
  statusBadge.innerHTML = `<span class="status-dot status-${task.status}"></span>${STATUS_LABELS[task.status]}`;
  tdStatus.append(statusBadge);

  const tdActions = document.createElement('td');
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'icon-btn';
  editBtn.setAttribute('aria-label', 'Editar tarea');
  editBtn.textContent = '✎';
  editBtn.addEventListener('click', e => {
    e.stopPropagation();
    openTaskModal(task.id);
  });
  tdActions.append(editBtn);

  tr.append(tdTask, tdTags, tdPriority, tdDue, tdStatus, tdActions);
  tr.addEventListener('click', () => openTaskModal(task.id));
  return tr;
}

function renderListView(tasks) {
  dom.listTbody.replaceChildren();
  tasks.forEach(t => dom.listTbody.append(buildListRow(t)));
  dom.listEmpty.hidden = tasks.length > 0;
}

/* ---------- Render: filters ---------- */

function renderTagFilter() {
  dom.tagFilterList.replaceChildren();

  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'tag-chip' + (state.filters.tagId === null ? ' is-active' : '');
  all.dataset.tagId = '';
  all.textContent = 'Todas';
  dom.tagFilterList.append(all);

  state.tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-chip' + (state.filters.tagId === tag.id ? ' is-active' : '');
    btn.dataset.tagId = String(tag.id);
    btn.style.setProperty('--tag-color', tag.color);
    btn.textContent = tag.name;
    dom.tagFilterList.append(btn);
  });
}

/* ---------- Render: tag picker (modal) ---------- */

function renderTagPicker() {
  dom.fieldTags.replaceChildren();

  state.tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-pick' + (state.formTagIds.includes(tag.id) ? ' is-selected' : '');
    btn.dataset.tagId = String(tag.id);
    btn.style.setProperty('--tag-color', tag.color);
    btn.textContent = tag.name;
    dom.fieldTags.append(btn);
  });
}

/* ---------- Render: tag admin ---------- */

function renderTagAdmin() {
  dom.tagAdminList.replaceChildren();

  if (state.tags.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'tag-admin-empty';
    empty.textContent = 'Aún no has creado etiquetas. Empieza por una arriba.';
    dom.tagAdminList.append(empty);
    return;
  }

  state.tags.forEach(tag => {
    const li = document.createElement('li');
    li.className = 'tag-admin-item';

    const nameWrap = document.createElement('span');
    nameWrap.className = 'tag-admin-name';

    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.value = tag.color;
    swatch.className = 'color-swatch color-swatch-sm';
    swatch.setAttribute('aria-label', `Cambiar color de la etiqueta ${tag.name}`);
    // 'change' (no 'input') para evitar saturar la red mientras el usuario arrastra el picker.
    swatch.addEventListener('change', e => handleTagColorChange(tag.id, e.target.value));

    const nameText = document.createElement('span');
    nameText.textContent = tag.name;

    nameWrap.append(swatch, nameText);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'danger-btn';
    del.textContent = 'Eliminar';
    del.setAttribute('aria-label', `Eliminar etiqueta ${tag.name}`);
    del.addEventListener('click', () => handleDeleteTag(tag.id));

    li.append(nameWrap, del);
    dom.tagAdminList.append(li);
  });
}

/* ---------- Master render ---------- */

function render() {
  const tasks = visibleTasks();

  if (state.view === 'board') {
    dom.board.hidden = false;
    dom.listView.hidden = true;
    renderBoard(tasks);
  } else {
    dom.board.hidden = true;
    dom.listView.hidden = false;
    renderListView(tasks);
  }

  renderTagFilter();
}

/* ---------- Modal: task ---------- */

function openTaskModal(id = null) {
  state.editingId = id;
  const task = id !== null ? getTaskById(state.tasks, id) : null;

  dom.modalTitle.textContent = task ? 'Editar tarea' : 'Nueva tarea';
  dom.fieldTitle.value       = task?.title ?? '';
  dom.fieldDescription.value = task?.description ?? '';
  dom.fieldPriority.value    = task?.priority ?? 'normal';
  dom.fieldDue.value         = toLocalInput(task?.dueDate);
  dom.fieldStatus.value      = task?.status ?? 'pending';
  state.formTagIds           = task ? [...task.tagIds] : [];

  dom.deleteTaskBtn.hidden = !task;
  dom.fieldTitle.removeAttribute('aria-invalid');
  clearFormError();

  renderTagPicker();
  dom.taskModal.showModal();
  dom.fieldTitle.focus();
}

function closeTaskModal() {
  dom.taskModal.close();
  state.editingId = null;
  state.formTagIds = [];
}

async function handleTaskSubmit(e) {
  e.preventDefault();
  const title = dom.fieldTitle.value.trim();
  if (!title) {
    showFormError('El título es obligatorio.');
    dom.fieldTitle.setAttribute('aria-invalid', 'true');
    dom.fieldTitle.focus();
    return;
  }

  clearFormError();
  dom.fieldTitle.removeAttribute('aria-invalid');

  const payload = {
    title,
    description: dom.fieldDescription.value.trim(),
    priority: dom.fieldPriority.value,
    dueDate: fromLocalInput(dom.fieldDue.value),
    tagIds: [...state.formTagIds],
    status: dom.fieldStatus.value,
  };

  const submitBtn = dom.taskForm.querySelector('#save-btn');
  submitBtn.disabled = true;

  try {
    if (state.editingId !== null) {
      const updated = await storage.updateTask(state.editingId, payload);
      state.tasks = state.tasks.map(t => (t.id === updated.id ? updated : t));
      showToast('Tarea actualizada.', { variant: 'success' });
    } else {
      const created = await storage.addTask(payload);
      state.tasks = [...state.tasks, created];
      showToast('Tarea creada.', { variant: 'success' });
    }
    persistSnapshot();
    closeTaskModal();
    render();
  } catch (err) {
    reportError(err, 'No se pudo guardar la tarea.');
  } finally {
    submitBtn.disabled = false;
  }
}

function showFormError(message) {
  dom.taskFormError.textContent = message;
  dom.taskFormError.hidden = false;
}

function clearFormError() {
  dom.taskFormError.textContent = '';
  dom.taskFormError.hidden = true;
}

async function handleTaskDelete() {
  if (state.editingId === null) { return; }
  const idToDelete = state.editingId;

  try {
    await storage.deleteTask(idToDelete);
    state.tasks = state.tasks.filter(t => t.id !== idToDelete);
    persistSnapshot();
    closeTaskModal();
    render();
    showToast('Tarea eliminada.', { variant: 'success' });
  } catch (err) {
    reportError(err, 'No se pudo eliminar la tarea.');
  }
}

async function handleStatusMove(taskId, newStatus) {
  try {
    const updated = await storage.updateTaskStatus(taskId, newStatus);
    state.tasks = state.tasks.map(t => (t.id === updated.id ? updated : t));
    persistSnapshot();
    render();
  } catch (err) {
    reportError(err, 'No se pudo cambiar el estado.');
  }
}

/* ---------- Modal: tags ---------- */

function openTagsModal() {
  dom.tagColorInput.value = randomDefaultColor();
  renderTagAdmin();
  dom.tagsModal.showModal();
  dom.tagInput.focus();
}

function closeTagsModal() {
  dom.tagsModal.close();
}

async function handleTagCreate(e) {
  e.preventDefault();
  const name = dom.tagInput.value.trim();
  if (!name) { return; }

  const color = dom.tagColorInput.value;

  try {
    const created = await storage.addTag(name, color);
    state.tags = [...state.tags, created];
    persistSnapshot();
    dom.tagInput.value = '';
    dom.tagColorInput.value = randomDefaultColor();
    renderTagAdmin();
    renderTagPicker();
    renderTagFilter();
  } catch (err) {
    if (err?.code === '23505') {
      reportError(new Error(), 'Ya existe una etiqueta con ese nombre.');
    } else {
      reportError(err, 'No se pudo crear la etiqueta.');
    }
  }
}

async function handleTagColorChange(tagId, color) {
  try {
    const updated = await storage.updateTagColor(tagId, color);
    state.tags = state.tags.map(t => (t.id === updated.id ? updated : t));
    persistSnapshot();
    renderTagAdmin();
    renderTagPicker();
    renderTagFilter();
    render();
  } catch (err) {
    reportError(err, 'No se pudo actualizar el color.');
  }
}

async function handleDeleteTag(tagId) {
  try {
    await storage.removeTag(tagId);
    state.tags = state.tags.filter(t => t.id !== tagId);
    state.tasks = state.tasks.map(t =>
      t.tagIds.includes(tagId) ? { ...t, tagIds: t.tagIds.filter(id => id !== tagId) } : t,
    );
    state.formTagIds = state.formTagIds.filter(id => id !== tagId);
    if (state.filters.tagId === tagId) { state.filters.tagId = null; }
    persistSnapshot();
    renderTagAdmin();
    renderTagPicker();
    render();
  } catch (err) {
    reportError(err, 'No se pudo eliminar la etiqueta.');
  }
}

function randomDefaultColor() {
  // Hue distribuido para que cada nueva etiqueta sugiera un color distinto al anterior.
  const hue = Math.floor(Math.random() * 360);
  return hslToHex(hue, 70, 55);
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const v = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/* ---------- Drag & drop ---------- */

function handleDragStart(e) {
  const card = e.target.closest('.task-card');
  if (!card) { return; }
  state.draggedId = Number(card.dataset.id);
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  const card = e.target.closest('.task-card');
  if (!card) { return; }
  state.draggedId = null;
  card.classList.remove('dragging');
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drag-over');
  }
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (state.draggedId === null) { return; }
  const newStatus = e.currentTarget.dataset.status;
  const id = state.draggedId;
  state.draggedId = null;
  handleStatusMove(id, newStatus);
}

/* ---------- View / tab toggles ---------- */

function setView(view) {
  state.view = view;
  $$('.view-btn').forEach(btn => {
    const isActive = btn.dataset.view === view;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });
  render();
}

function setActiveTab(status) {
  state.activeTab = status;
  dom.board.dataset.activeTab = status;
  $$('.board-tab').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.status === status);
  });
}

/* ---------- Realtime sync ---------- */

let refreshInFlight = false;
async function refreshFromRemote() {
  if (refreshInFlight) { return; }
  refreshInFlight = true;
  try {
    const next = await storage.refresh();
    state.tasks = next.tasks;
    state.tags = next.tags;
    setOnline(next.online, next.reason);
    render();
    if (dom.tagsModal.open) { renderTagAdmin(); }
    if (dom.taskModal.open) { renderTagPicker(); }
  } catch (err) {
    console.warn('Refresh falló:', err);
  } finally {
    refreshInFlight = false;
  }
}

function persistSnapshot() {
  storage.persistSnapshot({ tasks: state.tasks, tags: state.tags });
}

/* ---------- Event wiring ---------- */

function wireEvents() {
  dom.themeToggle.addEventListener('click', toggleTheme);

  dom.searchInput.addEventListener('input', e => {
    state.filters.search = e.target.value;
    render();
  });

  dom.filterPriority.addEventListener('change', e => {
    state.filters.priority = e.target.value || null;
    render();
  });

  dom.sortMode.addEventListener('change', e => {
    state.sort = e.target.value;
    render();
  });

  dom.tagFilterList.addEventListener('click', e => {
    const chip = e.target.closest('.tag-chip');
    if (!chip) { return; }
    const raw = chip.dataset.tagId;
    state.filters.tagId = raw === '' ? null : Number(raw);
    render();
  });

  $$('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  $$('.board-tab').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.status));
  });

  dom.newTaskBtn.addEventListener('click', () => openTaskModal());
  dom.manageTagsBtn.addEventListener('click', openTagsModal);

  dom.board.addEventListener('click', e => {
    const moveBtn = e.target.closest('[data-role="move-prev"], [data-role="move-next"]');
    if (moveBtn && !moveBtn.disabled) {
      const card = moveBtn.closest('.task-card');
      const id   = Number(card.dataset.id);
      const task = getTaskById(state.tasks, id);
      if (!task) { return; }
      const target = moveBtn.dataset.role === 'move-next' ? nextStatus(task.status) : prevStatus(task.status);
      if (target) { handleStatusMove(id, target); }
      return;
    }

    const editBtn = e.target.closest('[data-role="edit"]');
    if (editBtn) {
      const card = editBtn.closest('.task-card');
      if (card) { openTaskModal(Number(card.dataset.id)); }
      return;
    }

    const card = e.target.closest('.task-card');
    if (card) { openTaskModal(Number(card.dataset.id)); }
  });

  dom.board.addEventListener('dragstart', handleDragStart);
  dom.board.addEventListener('dragend', handleDragEnd);
  $$('.column').forEach(col => {
    col.addEventListener('dragover', handleDragOver);
    col.addEventListener('dragleave', handleDragLeave, { passive: true });
    col.addEventListener('drop', handleDrop);
  });

  dom.taskForm.addEventListener('submit', handleTaskSubmit);
  dom.modalClose.addEventListener('click', closeTaskModal);
  dom.cancelBtn.addEventListener('click', closeTaskModal);
  dom.deleteTaskBtn.addEventListener('click', handleTaskDelete);
  dom.fieldTitle.addEventListener('input', () => {
    if (dom.fieldTitle.value.trim()) {
      dom.fieldTitle.removeAttribute('aria-invalid');
      clearFormError();
    }
  });

  // El `required` nativo dispara `invalid` antes que `submit`. Sincronizamos a11y aquí.
  dom.fieldTitle.addEventListener('invalid', e => {
    e.preventDefault();
    dom.fieldTitle.setAttribute('aria-invalid', 'true');
    showFormError('El título es obligatorio.');
    dom.fieldTitle.focus();
  });
  dom.taskModal.addEventListener('click', e => {
    if (e.target === dom.taskModal) { closeTaskModal(); }
  });

  dom.fieldTags.addEventListener('click', e => {
    const btn = e.target.closest('.tag-pick');
    if (!btn) { return; }
    const id = Number(btn.dataset.tagId);
    state.formTagIds = state.formTagIds.includes(id)
      ? state.formTagIds.filter(x => x !== id)
      : [...state.formTagIds, id];
    renderTagPicker();
  });

  dom.tagCreateForm.addEventListener('submit', handleTagCreate);
  dom.tagsModalClose.addEventListener('click', closeTagsModal);
  dom.tagsDoneBtn.addEventListener('click', closeTagsModal);
  dom.tagsModal.addEventListener('click', e => {
    if (e.target === dom.tagsModal) { closeTagsModal(); }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (dom.taskModal.open) { closeTaskModal(); }
      if (dom.tagsModal.open) { closeTagsModal(); }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      dom.searchInput.focus();
    }
  });

  // Si el usuario vuelve online (window online event), reintenta cargar.
  window.addEventListener('online', refreshFromRemote);
}

/* ---------- Boot ---------- */

async function boot() {
  initTheme();
  wireEvents();
  render();

  try {
    const initial = await storage.loadInitial();
    state.tasks = initial.tasks;
    state.tags = initial.tags;
    setOnline(initial.online, initial.reason);
    render();

    if (initial.online) {
      // Realtime: refrescar el estado cuando cambien las tablas.
      // Estrategia simple: re-fetch completo. Funciona bien para volúmenes pequeños.
      storage.subscribeRealtime(() => {
        // Debounce ligero para colapsar ráfagas (insert + insert task_tags + update).
        clearTimeout(window.__taskboardRefreshDebounce);
        window.__taskboardRefreshDebounce = setTimeout(refreshFromRemote, 150);
      });
    }
  } catch (err) {
    console.error('Boot fallo:', err);
    setOnline(false, 'fetch-failed');
    showToast('No se pudo cargar inicial. Revisa tu conexión.', { variant: 'error' });
  }
}

boot();
