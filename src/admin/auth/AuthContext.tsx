// ============================================================
// ZHINO — admin session context
// ============================================================
// Supabase Auth sessions are restored through authService when production
// configuration is present. The explicit demo provider remains an in-memory
// preview fallback only; it never claims to secure the admin route.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getAuthProvider } from './authService';
import type { AdminSession } from './authService';
import { hydrateCatalogFromSupabase } from '../../services/catalog';
import { hydrateOrdersFromSupabase } from '../../services/orderStore';
import { hydrateRecipesFromSupabase } from '../../services/recipeStore';

interface AdminAuthValue {
  session: AdminSession | null;
  isDemo: boolean;
  login: (identifier: string, secret: string) => Promise<void>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);

  useEffect(() => {
    const provider = getAuthProvider();
    if (!provider.currentSession) return;
    let cancelled = false;
    void provider.currentSession().then((next) => {
      if (!cancelled && next) setSession(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (identifier: string, secret: string) => {
    const next = await getAuthProvider().login(identifier, secret);
    setSession(next);
    if (next.mode === 'supabase') {
      void Promise.all([
        hydrateCatalogFromSupabase(true),
        hydrateOrdersFromSupabase(true),
        hydrateRecipesFromSupabase(true),
      ]);
    }
  }, []);

  const logout = useCallback(() => {
    void getAuthProvider().logout();
    setSession(null);
  }, []);

  const value = useMemo<AdminAuthValue>(
    () => ({ session, isDemo: session?.mode === 'demo' || getAuthProvider().mode === 'demo', login, logout }),
    [session, login, logout],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  return ctx;
}
