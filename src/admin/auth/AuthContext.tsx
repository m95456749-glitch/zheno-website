// ============================================================
// ZHINO — admin session (in-memory only, phase 1)
//
// The session is kept in React state: refreshing the page returns
// the visitor to the login page, and no credential ever touches
// localStorage. When a real backend lands (see authService.ts),
// only the provider changes — this context keeps the same API.
// ============================================================

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getAuthProvider } from './authService';
import type { AdminSession } from './authService';

interface AdminAuthValue {
  session: AdminSession | null;
  /** true while the demo (non-secure) provider is in use */
  isDemo: boolean;
  login: (identifier: string, secret: string) => Promise<void>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);

  const login = useCallback(async (identifier: string, secret: string) => {
    const next = await getAuthProvider().login(identifier, secret);
    setSession(next);
  }, []);

  const logout = useCallback(() => {
    void getAuthProvider().logout();
    setSession(null);
  }, []);

  const value = useMemo<AdminAuthValue>(
    () => ({ session, isDemo: session?.mode === 'demo', login, logout }),
    [session, login, logout],
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
