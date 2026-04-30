import { getTasks, saveTasks } from '../storage/storage.js';
import { addTask, deleteTask, updateTaskStatus } from '../task/task.js';

const taskInput    = document.querySelector('#task-input');
const addBtn       = document.querySelector('#add-btn');
const inputError   = document.querySelector('#input-error');
const pendingCount = document.querySelector('#pending-count');
const taskTemplate = document.querySelector('#task-template');
const board        = document.querySelector('#board');

const lists = {
  pending:  document.querySelector('#list-pending'),
  progress: document.querySelector('#list-progress'),
  done:     document.querySelector('#list-done'),
};

const badges = {
  pending:  document.querySelector('#badge-pending'),
  progress: document.querySelector('#badge-progress'),
  done:     document.querySelector('#badge-done'),
};

let tasks     = getTasks();
let draggedId = null;

function commit(nextTasks) {
  tasks = nextTasks;
  saveTasks(tasks);
  render(tasks);
}

function buildCard(task) {
  const clone    = taskTemplate.content.cloneNode(true);
  const li       = clone.querySelector('.task-card');
  const checkbox = clone.querySelector('.task-checkbox');
  const span     = clone.querySelector('.task-text');

  li.dataset.id    = task.id;
  checkbox.checked = task.status === 'done';
  span.textContent = task.text;

  if (task.status === 'done') {
    li.classList.add('done-card');
  }

  return li;
}

function render(taskList) {
  Object.values(lists).forEach(ul => ul.replaceChildren());

  taskList.forEach(task => {
    lists[task.status].append(buildCard(task));
  });

  const counts = { pending: 0, progress: 0, done: 0 };
  taskList.forEach(t => counts[t.status]++);

  Object.keys(counts).forEach(status => {
    badges[status].textContent = counts[status];
  });

  pendingCount.textContent = counts.pending + counts.progress;
}

function showError() {
  inputError.classList.remove('hidden');
  taskInput.classList.add('error');
}

function hideError() {
  inputError.classList.add('hidden');
  taskInput.classList.remove('error');
}

function handleAdd() {
  const text = taskInput.value.trim();

  if (!text) {
    showError();
    return;
  }

  hideError();
  commit(addTask(tasks, text));
  taskInput.value = '';
}

function handleBoardClick(e) {
  const delBtn = e.target.closest('.delete-btn');
  if (!delBtn) { return; }

  const id = Number(delBtn.closest('.task-card').dataset.id);
  commit(deleteTask(tasks, id));
}

function handleBoardChange(e) {
  const checkbox = e.target.closest('.task-checkbox');
  if (!checkbox) { return; }

  const id     = Number(checkbox.closest('.task-card').dataset.id);
  const status = checkbox.checked ? 'done' : 'pending';
  commit(updateTaskStatus(tasks, id, status));
}

function handleDragStart(e) {
  const card = e.target.closest('.task-card');
  if (!card) { return; }

  draggedId = Number(card.dataset.id);
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  const card = e.target.closest('.task-card');
  if (!card) { return; }

  draggedId = null;
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

  if (draggedId === null) { return; }

  const newStatus = e.currentTarget.dataset.status;
  commit(updateTaskStatus(tasks, draggedId, newStatus));
  draggedId = null;
}

function handleKeyDown(e) {
  if (e.key === 'Enter') { handleAdd(); }
}

function handleInputChange() {
  if (taskInput.value.trim()) { hideError(); }
}

board.addEventListener('click', handleBoardClick);
board.addEventListener('change', handleBoardChange);
board.addEventListener('dragstart', handleDragStart);
board.addEventListener('dragend', handleDragEnd);

document.querySelectorAll('.column').forEach(column => {
  column.addEventListener('dragover', handleDragOver);
  column.addEventListener('dragleave', handleDragLeave, { passive: true });
  column.addEventListener('drop', handleDrop);
});

addBtn.addEventListener('click', handleAdd);
taskInput.addEventListener('keydown', handleKeyDown);
taskInput.addEventListener('input', handleInputChange);

render(tasks);
