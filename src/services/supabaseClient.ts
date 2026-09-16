// ============================================================
// ZHINO — Supabase client (browser only, publishable key only)
//
// SECURITY CONTRACT of this module:
//   - Only PUBLIC credentials ever reach the browser:
//       VITE_SUPABASE_URL            — the project URL
//       VITE_SUPABASE_PUBLISHABLE_KEY — the publishable (a.k.a. anon) key
//     Both are safe to ship: they identify the project, they do NOT
//     grant data access. Every read/write is authorised by the
//     database's Row Level Security policies (supabase/migrations/
//     20260912000000_initial_schema.sql), not by the key.
//   - A service_role / secret key (sb_secret_… or a JWT whose `role`
//     is `service_role`) is REJECTED here, loudly. That key bypasses
//     RLS and must never exist in frontend code, in the bundle or in
//     this repository.
//   - Nothing here is called when the two variables are unset: the
//     app then behaves exactly as the localStorage/demo build it was
//     before (see src/services/catalog.ts).
// ============================================================

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Raw (trimmed) configuration, read once at module load. */
const RAW_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const RAW_KEY = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  ''
).trim();

export type SupabaseKeyClass = 'publishable' | 'anon-jwt' | 'unknown' | 'secret';

/**
 * Classify a key WITHOUT printing it: a secret key must never be used
 * in the browser, a publishable/anon key is exactly what we want.
 */
export function classifySupabaseKey(key: string): SupabaseKeyClass {
  if (!key) return 'unknown';
  if (key.startsWith('sb_secret_')) return 'secret';
  if (key.startsWith('sb_publishable_')) return 'publishable';
  if (key.startsWith('eyJ')) {
    try {
      const payloadPart = key.split('.')[1] ?? '';
      const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      const payload = JSON.parse(atob(padded)) as { role?: unknown };
      if (payload.role === 'service_role') return 'secret';
      if (payload.role === 'anon') return 'anon-jwt';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }
  return 'unknown';
}

/** True only for a key that is safe in a browser. */
export function isPublishableKey(key: string): boolean {
  const cls = classifySupabaseKey(key);
  return cls === 'publishable' || cls === 'anon-jwt';
}

let client: SupabaseClient | null = null;
let warnedAboutUnknownKey = false;

/**
 * The endpoint must be https, because the admin's access token travels
 * in the Authorization header. A plaintext endpoint would leak it on the
 * wire, so it is refused exactly like a secret key. The only exception is
 * a local Supabase stack (http://localhost or http://127.0.0.1), which
 * never leaves the machine.
 */
function isSecureEndpoint(url: string): boolean {
  if (/^https:\/\//i.test(url)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(url);
}

/**
 * The configured project URL ("" when Supabase is not configured).
 * Public information — safe to print/log.
 */
export function getSupabaseUrl(): string {
  return RAW_URL;
}

/** True when both variables are present and the key is browser-safe. */
export function isSupabaseConfigured(): boolean {
  return RAW_URL !== '' && RAW_KEY !== '' && isSecureEndpoint(RAW_URL) && isPublishableKey(RAW_KEY);
}

/**
 * Lazily created singleton. Returns null when Supabase is not
 * configured (or when a secret key was supplied by mistake), so every
 * caller can fall back to the offline/local behaviour instead of
 * crashing.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    if (RAW_URL !== '' && !isSecureEndpoint(RAW_URL)) {
      console.error(
        '[zhino] Refusing to initialise Supabase: VITE_SUPABASE_URL must use https:// ' +
          `(got a plaintext endpoint). The admin access token travels in a header, so an ` +
          'http:// endpoint would expose it. Running in local (offline) mode.',
      );
    } else if (RAW_KEY !== '' && classifySupabaseKey(RAW_KEY) === 'secret') {
      // Never fall back silently on this one: it is a security bug in
      // the deployment configuration, not a missing feature.
      console.error(
        '[zhino] Refusing to initialise Supabase: the configured key is a SECRET/ service_role key. ' +
          'Use the project publishable (anon) key in VITE_SUPABASE_PUBLISHABLE_KEY — a secret key ' +
          'bypasses Row Level Security and must never be shipped to a browser.',
      );
    } else if (RAW_KEY !== '' && !warnedAboutUnknownKey) {
      warnedAboutUnknownKey = true;
      console.warn(
        '[zhino] The configured Supabase key could not be identified as a publishable/anon key; ' +
          'running in local (offline) mode.',
      );
    }
    return null;
  }

  if (!client) {
    client = createClient(RAW_URL, RAW_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // No OAuth/magic-link redirect flow is used by the admin panel.
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
