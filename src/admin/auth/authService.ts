// ============================================================
// ZHINO — admin authentication providers
// ============================================================
// Production mode uses Supabase Auth. Passwords are sent only to Supabase
// Auth and are never stored by this application. Database writes remain
// protected by PostgreSQL RLS, which checks app_metadata.role = "admin".
// The old demo provider is retained only for the existing credential-free
// preview build and is explicitly marked as non-secure in the UI.

import { getSupabaseClient, isSupabaseConfigured } from '../../services/supabase/client';

export type AuthMode = 'demo' | 'api' | 'supabase';

export interface AdminSession {
  mode: AuthMode;
  identifier: string;
  issuedAt: string;
}

export interface AdminAuthProvider {
  readonly mode: AuthMode;
  login(identifier: string, secret: string): Promise<AdminSession>;
  logout(): void | Promise<void>;
  currentSession?(): Promise<AdminSession | null>;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim();

class DemoAuthProvider implements AdminAuthProvider {
  readonly mode = 'demo' as const;

  async login(identifier: string): Promise<AdminSession> {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return { mode: 'demo', identifier: identifier.trim(), issuedAt: new Date().toISOString() };
  }

  logout(): void {
    // Deliberately no persistence: this provider is preview-only.
  }
}

class ApiAuthProvider implements AdminAuthProvider {
  readonly mode = 'api' as const;

  async login(identifier: string, secret: string): Promise<AdminSession> {
    const response = await fetch(`${API_BASE}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, secret }),
    });
    if (!response.ok) throw new Error('اطلاعات ورود صحیح نیست');
    const data = (await response.json().catch(() => null)) as { session?: Partial<AdminSession> | null } | null;
    if (!data?.session || typeof data.session.identifier !== 'string' || typeof data.session.issuedAt !== 'string') {
      throw new Error('پاسخ اعتباری از سرور دریافت نشد');
    }
    return { mode: 'api', identifier: data.session.identifier, issuedAt: data.session.issuedAt };
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/admin/auth/logout`, { method: 'POST' });
    } catch {
      // local React session is cleared regardless
    }
  }
}

class SupabaseAuthProvider implements AdminAuthProvider {
  readonly mode = 'supabase' as const;

  async login(identifier: string, secret: string): Promise<AdminSession> {
    const client = getSupabaseClient();
    if (!client) throw new Error('پیکربندی Supabase کامل نیست');
    const { data, error } = await client.auth.signInWithPassword({
      email: identifier.trim(),
      password: secret,
    });
    if (error || !data.user) throw new Error('ایمیل یا گذرواژه صحیح نیست');
    if (data.user.app_metadata?.role !== 'admin') {
      await client.auth.signOut();
      throw new Error('این حساب دسترسی مدیریت ندارد');
    }
    return {
      mode: 'supabase',
      identifier: data.user.email ?? identifier.trim(),
      issuedAt: data.session?.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : new Date().toISOString(),
    };
  }

  async currentSession(): Promise<AdminSession | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    const user = data.session?.user;
    if (!user || user.app_metadata?.role !== 'admin') return null;
    return {
      mode: 'supabase',
      identifier: user.email ?? user.id,
      issuedAt: user.last_sign_in_at ?? new Date().toISOString(),
    };
  }

  async logout(): Promise<void> {
    const client = getSupabaseClient();
    if (client) await client.auth.signOut();
  }
}

let provider: AdminAuthProvider | null = null;

export function getAuthProvider(): AdminAuthProvider {
  if (!provider) {
    const requestedMode = (import.meta.env.VITE_ADMIN_AUTH_MODE ?? 'supabase').trim();
    if (requestedMode === 'supabase' && isSupabaseConfigured()) provider = new SupabaseAuthProvider();
    else if (requestedMode === 'api' && API_BASE) provider = new ApiAuthProvider();
    else provider = new DemoAuthProvider();
  }
  return provider;
}
