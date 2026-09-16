// ============================================================
// ZHINO — admin session
//
// Two modes, one API:
//   - Supabase connected: the session comes from Supabase Auth
//     (refresh token held by the Supabase client) and is restored on
//     page load; the account must carry the admin role, which is
//     verified with the database's is_admin() before the panel opens.
//   - demo (no database configured): the session is kept in React
//     state only — refreshing returns to the login page and no
//     credential ever touches localStorage.
// ============================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getAuthProvider } from './authService';
import type { AdminSession, AuthMode } from './authService';

export type AdminAuthStatus = 'loading' | 'ready';

interface AdminAuthValue {
  session: AdminSession | null;
  /** 'loading' while a persisted Supabase session is being restored */
  status: AdminAuthStatus;
  /** which provider is in use ('supabase' = real authentication) */
  providerMode: AuthMode;
  /** true while the demo (non-secure) provider is in use */
  isDemo: boolean;
  /** true when the panel is authenticated against Supabase */
  isDatabaseAuth: boolean;
  login: (identifier: string, secret: string) => Promise<void>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const provider = getAuthProvider();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [status, setStatus] = useState<AdminAuthStatus>(provider.restore ? 'loading' : 'ready');

  // Restore a persisted session once, then follow sign-in/sign-out.
  useEffect(() => {
    let alive = true;

    if (provider.restore) {
      provider
        .restore()
        .then((restored) => {
          if (alive && restored) setSession(restored);
        })
        .catch(() => {
          /* stay on the login page */
        })
        .finally(() => {
          if (alive) setStatus('ready');
        });
    }

    const unsubscribe = provider.subscribe?.((next) => {
      if (!alive) return;
      setSession((current) => {
        if (next === null) return null;
        return current ?? next; // keep the richer local session once signed in
      });
    });

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [provider]);

  const login = useCallback(
    async (identifier: string, secret: string) => {
      const next = await provider.login(identifier, secret);
      setSession(next);
    },
    [provider],
  );

  const logout = useCallback(() => {
    void provider.logout();
    setSession(null);
  }, [provider]);

  const value = useMemo<AdminAuthValue>(
    () => ({
      session,
      status,
      providerMode: provider.mode,
      isDemo: provider.mode === 'demo',
      isDatabaseAuth: provider.mode === 'supabase',
      login,
      logout,
    }),
    [session, status, provider.mode, login, logout],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return ctx;
}
