import { assertSupabase } from '../config/env.js';

/**
 * Capa CRUD contra Supabase. Convierte filas de DB ↔ shape de la app.
 * Tres tablas:
 *   - tasks (campos planos)
 *   - tags (id, name, color)
 *   - task_tags (junction task_id ↔ tag_id)
 *
 * El módulo expone funciones async + un suscriptor de realtime que avisa
 * de cambios remotos para mantener el estado local sincronizado entre pestañas.
 */

/* ------------------------------------------------------------------ *
 * Mappers DB ↔ App
 * ------------------------------------------------------------------ */

function rowToTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    priority: row.priority,
    dueDate: row.due_date,
    status: row.status,
    tagIds: (row.task_tags ?? []).map(rel => rel.tag_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function taskPayloadToRow(payload) {
  const row = {};
  if (payload.title !== undefined)       { row.title = payload.title; }
  if (payload.description !== undefined) { row.description = payload.description; }
  if (payload.priority !== undefined)    { row.priority = payload.priority; }
  if (payload.dueDate !== undefined)     { row.due_date = payload.dueDate; }
  if (payload.status !== undefined)      { row.status = payload.status; }
  return row;
}

function rowToTag(row) {
  return { id: row.id, name: row.name, color: row.color };
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

export async function fetchTasks() {
  const { data, error } = await assertSupabase()
    .from('tasks')
    .select('*, task_tags ( tag_id )')
    .order('created_at', { ascending: true });

  if (error) { throw error; }
  return data.map(rowToTask);
}

export async function fetchTags() {
  const { data, error } = await assertSupabase()
    .from('tags')
    .select('id, name, color')
    .order('name', { ascending: true });

  if (error) { throw error; }
  return data.map(rowToTag);
}

/* ------------------------------------------------------------------ *
 * Tasks: writes
 * ------------------------------------------------------------------ */

export async function insertTask(payload) {
  const supabase = assertSupabase();
  const row = taskPayloadToRow(payload);

  const { data, error } = await supabase
    .from('tasks')
    .insert(row)
    .select('*, task_tags ( tag_id )')
    .single();

  if (error) { throw error; }

  if (payload.tagIds?.length) {
    await replaceTaskTags(data.id, payload.tagIds);
    return { ...rowToTask(data), tagIds: [...payload.tagIds] };
  }
  return rowToTask(data);
}

export async function updateTaskRow(id, patch) {
  const supabase = assertSupabase();
  const row = taskPayloadToRow(patch);

  if (Object.keys(row).length > 0) {
    const { error } = await supabase.from('tasks').update(row).eq('id', id);
    if (error) { throw error; }
  }

  if (patch.tagIds !== undefined) {
    await replaceTaskTags(id, patch.tagIds);
  }

  // Re-fetch para devolver shape canónico (con tagIds y updated_at fresco).
  const { data, error } = await supabase
    .from('tasks')
    .select('*, task_tags ( tag_id )')
    .eq('id', id)
    .single();
  if (error) { throw error; }
  return rowToTask(data);
}

export async function deleteTaskRow(id) {
  // ON DELETE CASCADE en task_tags se encarga de la junction.
  const { error } = await assertSupabase().from('tasks').delete().eq('id', id);
  if (error) { throw error; }
}

async function replaceTaskTags(taskId, tagIds) {
  const supabase = assertSupabase();

  // Estrategia simple: borrar todas las relaciones del task y reinsertar.
  // Para volúmenes pequeños (decenas de tags por task), es perfectamente eficiente.
  const { error: delErr } = await supabase.from('task_tags').delete().eq('task_id', taskId);
  if (delErr) { throw delErr; }

  if (!tagIds.length) { return; }

  const rows = tagIds.map(tag_id => ({ task_id: taskId, tag_id }));
  const { error: insErr } = await supabase.from('task_tags').insert(rows);
  if (insErr) { throw insErr; }
}

/* ------------------------------------------------------------------ *
 * Tags: writes
 * ------------------------------------------------------------------ */

export async function insertTag(name, color) {
  const { data, error } = await assertSupabase()
    .from('tags')
    .insert({ name, color })
    .select('id, name, color')
    .single();

  if (error) { throw error; }
  return rowToTag(data);
}

export async function updateTagRow(id, patch) {
  const { data, error } = await assertSupabase()
    .from('tags')
    .update(patch)
    .eq('id', id)
    .select('id, name, color')
    .single();

  if (error) { throw error; }
  return rowToTag(data);
}

export async function deleteTagRow(id) {
  const { error } = await assertSupabase().from('tags').delete().eq('id', id);
  if (error) { throw error; }
}

/* ------------------------------------------------------------------ *
 * Realtime
 * ------------------------------------------------------------------ */

/**
 * Suscribe la app a los cambios de las tres tablas. Al recibir un evento
 * dispara `onChange()` para que la capa superior recargue todo desde DB
 * (estrategia simple y consistente para volúmenes pequeños).
 *
 * @returns {() => Promise<'ok'|'timed out'|'error'>} función para desuscribirse.
 */
export function subscribeToChanges(onChange) {
  const supabase = assertSupabase();

  const channel = supabase
    .channel('taskboard-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tags' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'task_tags' }, onChange)
    .subscribe();

  return () => supabase.removeChannel(channel);
}
