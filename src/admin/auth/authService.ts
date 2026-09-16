// ============================================================
// ZHINO — admin authentication (integration seam)
//
// THREE PROVIDERS, ONE INTERFACE:
//
//   supabase (default when Supabase is configured) — REAL
//     authentication: sign in with a Supabase Auth account, then the
//     session is checked for the admin role via the database's
//     is_admin() function. Every write that follows is additionally
//     gated by Row Level Security. See ./supabaseAuth.ts.
//
//   demo — preview only, no authentication at all. It validates
//     nothing and persists nothing (no hardcoded password, no
//     credential in localStorage, session in memory for the current
//     tab) and the UI says so openly. Used when Supabase is not
//     configured, or when VITE_ADMIN_AUTH_MODE=demo is set
//     explicitly.
//
//   api — the previous backend seam (POST /admin/auth/login), kept
//     for a future custom backend: set VITE_ADMIN_AUTH_MODE=api
//     together with VITE_API_BASE_URL.
//
// The admin UI, guard and layout consume only the
// AdminAuthProvider interface — nothing else changes.
// ============================================================

import { SupabaseAuthProvider } from './supabaseAuth';
import { isSupabaseConfigured } from '../../services/supabaseClient';

export type AuthMode = 'demo' | 'api' | 'supabase';

export interface AdminSession {
  mode: AuthMode;
  /** the identifier the operator typed (display only) */
  identifier: string;
  /** ISO timestamp the session was issued */
  issuedAt: string;
}

export interface AdminAuthProvider {
  readonly mode: AuthMode;
  login(identifier: string, secret: string): Promise<AdminSession>;
  logout(): void | Promise<void>;
  /** optional: restore a persisted session (Supabase provider) */
  restore?(): Promise<AdminSession | null>;
  /** optional: react to sign-in/sign-out events outside this tab */
  subscribe?(onChange: (session: AdminSession | null) => void): () => void;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
const CONFIGURED_MODE = (import.meta.env.VITE_ADMIN_AUTH_MODE ?? '').trim();

/**
 * Demo provider — preview only. Intentionally does NOT check the
 * secret: there is no credential store to check against, and
 * pretending otherwise would be fake security. The session is
 * in-memory only and dies with the tab.
 */
class DemoAuthProvider implements AdminAuthProvider {
  readonly mode = 'demo' as const;

  async login(identifier: string): Promise<AdminSession> {
    // small delay so the form feels deliberate (and testable)
    await new Promise((resolve) => setTimeout(resolve, 350));
    return {
      mode: 'demo',
      identifier: identifier.trim(),
      issuedAt: new Date().toISOString(),
    };
  }

  logout(): void {
    /* nothing to clear — the session is not persisted anywhere */
  }
}

/**
 * API provider — ready to use once a backend exists. Credentials
 * travel only in the request body to the configured backend;
 * nothing is stored client-side. (Expected response shape:
 * { session: { mode: 'api', identifier: string, issuedAt: string } })
 */
class ApiAuthProvider implements AdminAuthProvider {
  readonly mode = 'api' as const;

  async login(identifier: string, secret: string): Promise<AdminSession> {
    const response = await fetch(`${API_BASE}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, secret }),
    });
    if (!response.ok) {
      throw new Error('اطلاعات ورود صحیح نیست');
    }
    const data = (await response.json().catch(() => null)) as {
      session?: Partial<AdminSession> | null;
    } | null;
    if (
      !data?.session ||
      typeof data.session.identifier !== 'string' ||
      typeof data.session.issuedAt !== 'string'
    ) {
      throw new Error('پاسخ اعتباری از سرور دریافت نشد');
    }
    return {
      mode: 'api',
      identifier: data.session.identifier,
      issuedAt: data.session.issuedAt,
    };
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/admin/auth/logout`, { method: 'POST' });
    } catch {
      /* best effort — the local session is cleared regardless */
    }
  }
}

let provider: AdminAuthProvider | null = null;

/**
 * Provider selection:
 *   VITE_ADMIN_AUTH_MODE=supabase (or unset + Supabase configured)
 *        → real Supabase Auth + is_admin() check
 *   VITE_ADMIN_AUTH_MODE=api (+ VITE_API_BASE_URL)   → custom backend
 *   VITE_ADMIN_AUTH_MODE=demo                        → preview only
 * Anything that cannot be satisfied falls back to the demo provider,
 * so the panel never becomes unreachable — but a configured
 * VITE_ADMIN_AUTH_MODE=supabase without credentials is reported.
 */
export function getAuthProvider(): AdminAuthProvider {
  if (!provider) {
    if (CONFIGURED_MODE === 'demo') {
      provider = new DemoAuthProvider();
    } else if (CONFIGURED_MODE === 'api' && API_BASE) {
      provider = new ApiAuthProvider();
    } else if (CONFIGURED_MODE === 'api') {
      provider = new DemoAuthProvider();
    } else if (isSupabaseConfigured()) {
      provider = new SupabaseAuthProvider();
    } else {
      if (CONFIGURED_MODE === 'supabase') {
        console.warn(
          '[zhino] VITE_ADMIN_AUTH_MODE=supabase but VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY ' +
            'are missing — the login page stays in preview (demo) mode.',
        );
      }
      provider = new DemoAuthProvider();
    }
  }
  return provider;
}
