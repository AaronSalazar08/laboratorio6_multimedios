/**
 * Cache local de solo-lectura para modo offline.
 * No es la fuente de verdad: Supabase lo es. La app sólo lee del cache cuando
 * Supabase es inaccesible (red caída, credenciales mal configuradas).
 */

const CACHE_KEY = 'taskboard_cache_v1';

export function readCache() {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) { return { tasks: [], tags: [] }; }

  try {
    const parsed = JSON.parse(raw);
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  } catch {
    return { tasks: [], tags: [] };
  }
}

export function writeCache({ tasks, tags }) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ tasks, tags, cachedAt: Date.now() }));
  } catch (err) {
    // QuotaExceeded u otros: no es fatal, sólo perdemos el cache.
    console.warn('No se pudo escribir cache local:', err);
  }
}

export function clearCache() {
  localStorage.removeItem(CACHE_KEY);
}
