import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseCredentials = Boolean(url) && Boolean(anonKey);

export const supabase = hasSupabaseCredentials
  ? createClient(url, anonKey, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;

export function assertSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase no configurado. Crea un archivo `.env.local` con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver .env.example).',
    );
  }
  return supabase;
}
