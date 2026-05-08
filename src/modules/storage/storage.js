import { hasSupabaseCredentials } from '../config/env.js';
import * as remote from './supabase-storage.js';
import { readCache, writeCache } from './cache.js';

/**
 * Facade de almacenamiento. Render.js sólo conoce este módulo.
 *
 * - Reads: intenta Supabase. Si falla, devuelve cache local (modo offline).
 * - Writes: siempre van a Supabase. Si Supabase está caído, fallan con
 *   `OfflineError` (la app muestra toast). Esta versión NO escribe offline.
 * - Realtime: re-fetch de tasks+tags al recibir cualquier evento.
 */

export class OfflineError extends Error {
  constructor(message = 'No hay conexión con Supabase') {
    super(message);
    this.name = 'OfflineError';
  }
}

let online = false;

export function isOnline() { return online; }

export async function loadInitial() {
  if (!hasSupabaseCredentials) {
    online = false;
    return { ...readCache(), online, reason: 'no-credentials' };
  }

  try {
    const [tasks, tags] = await Promise.all([remote.fetchTasks(), remote.fetchTags()]);
    online = true;
    writeCache({ tasks, tags });
    return { tasks, tags, online: true, reason: null };
  } catch (err) {
    console.warn('Supabase inaccesible, usando cache local:', err);
    online = false;
    return { ...readCache(), online: false, reason: 'fetch-failed' };
  }
}

/* ------------- Tasks ------------- */

export async function addTask(payload) {
  ensureOnline();
  const task = await remote.insertTask(payload);
  return task;
}

export async function updateTask(id, patch) {
  ensureOnline();
  return await remote.updateTaskRow(id, patch);
}

export async function deleteTask(id) {
  ensureOnline();
  await remote.deleteTaskRow(id);
}

export async function updateTaskStatus(id, status) {
  return await updateTask(id, { status });
}

/* ------------- Tags ------------- */

export async function addTag(name, color) {
  ensureOnline();
  return await remote.insertTag(name, color);
}

export async function updateTagColor(id, color) {
  ensureOnline();
  return await remote.updateTagRow(id, { color });
}

export async function removeTag(id) {
  ensureOnline();
  await remote.deleteTagRow(id);
}

/* ------------- Realtime ------------- */

export function subscribeRealtime(onChange) {
  if (!hasSupabaseCredentials) { return () => {}; }
  return remote.subscribeToChanges(onChange);
}

export async function refresh() {
  return await loadInitial();
}

export function persistSnapshot(snapshot) {
  writeCache(snapshot);
}

/* ------------- Internals ------------- */

function ensureOnline() {
  if (!online) {
    throw new OfflineError(
      hasSupabaseCredentials
        ? 'Sin conexión con Supabase. Tus cambios no se guardarán hasta que vuelva la red.'
        : 'Supabase no está configurado. Revisa el archivo .env.local.',
    );
  }
}
