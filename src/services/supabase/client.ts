// ============================================================
// ZHINO — browser Supabase client
// ============================================================
// The publishable anon key is safe to ship only with RLS enabled.
// A service-role key is never read by Vite, imported, or accepted here.

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Optional chaining also keeps the production-equivalent jsdom smoke harness
// safe when it intentionally defines no Supabase variables.
const url = (import.meta.env?.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '').trim();

let client: SupabaseClient<Database> | null | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null;
  if (client === undefined) {
    client = createClient<Database>(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export function getSupabaseUrl(): string {
  return url;
}
