// ============================================================
// ZHINO — admin authentication (integration seam)
//
// SECURITY POSTURE (phase 1, no backend yet):
//   - There is NO real authentication. The demo provider below
//     validates nothing and persists nothing: no hardcoded
//     password, no credential in localStorage, session exists
//     only in memory for the current tab.
//   - The UI says so openly (login notice + «نمایشی» chips).
//   - This module exists so that wiring a real backend later is
//     a one-line switch, not a rebuild.
//
// To connect a real backend:
//   1. point ApiAuthProvider at your /admin/auth endpoints
//      (login returns a session object; logout best-effort),
//   2. set VITE_ADMIN_AUTH_MODE=api together with
//      VITE_API_BASE_URL.
// The admin UI, guard and layout consume only the
// AdminAuthProvider interface — nothing else changes.
// ============================================================

export type AuthMode = 'demo' | 'api';

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
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim();

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

export function getAuthProvider(): AdminAuthProvider {
  if (!provider) {
    const mode = import.meta.env.VITE_ADMIN_AUTH_MODE ?? 'demo';
    provider =
      mode === 'api' && API_BASE ? new ApiAuthProvider() : new DemoAuthProvider();
  }
  return provider;
}
