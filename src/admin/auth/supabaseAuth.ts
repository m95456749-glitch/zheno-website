// ============================================================
// ZHINO — Supabase Auth provider for the admin panel
//
// Real authentication, no fake security:
//   1. the operator signs in with a Supabase Auth account
//      (e-mail + password) — credentials go straight to Supabase
//      over HTTPS and are never stored by this app;
//   2. the session is then checked for ADMINISTRATOR rights by
//      calling the database's own `is_admin()` function, which reads
//      the `role` claim from the JWT's app_metadata. Set
//      {"role":"admin"} in app_metadata for the operator account
//      (Dashboard → Authentication → Users, or the Management API).
//
// Step 2 is not decorative: every write in the admin panel is also
// authorised by Row Level Security, so a signed-in non-admin account
// can read the storefront-visible rows and nothing else. The check
// here only makes that refusal happen at login time with a clear
// message instead of a silent no-op later.
//
// The publishable key used by the client grants no data access by
// itself (see src/services/supabaseClient.ts) — RLS is the gate.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../../services/supabaseClient';
import { fetchIsAdmin } from '../../services/supabaseCatalog';
import type { AdminAuthProvider, AdminSession } from './authService';

/** Session shape returned by the Supabase provider. */
function sessionFromUser(email: string | undefined, lastSignIn: string | null | undefined): AdminSession {
  return {
    mode: 'supabase',
    identifier: email ?? 'admin',
    issuedAt: lastSignIn ?? new Date().toISOString(),
  };
}

function loginErrorMessage(raw: string | undefined): string {
  const message = (raw ?? '').toLowerCase();
  if (message.includes('invalid login credentials')) {
    return 'ایمیل یا گذرواژه نادرست است.';
  }
  if (message.includes('email not confirmed')) {
    return 'ایمیل این حساب هنوز تأیید نشده است.';
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'تلاش‌های ورود بیش از حد؛ چند دقیقه بعد دوباره امتحان کنید.';
  }
  return 'ورود انجام نشد؛ اتصال و اطلاعات حساب را بررسی کنید.';
}

export class SupabaseAuthProvider implements AdminAuthProvider {
  readonly mode = 'supabase' as const;

  private client(): SupabaseClient {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('اتصال Supabase پیکربندی نشده است.');
    }
    return supabase;
  }

  async login(identifier: string, secret: string): Promise<AdminSession> {
    const supabase = this.client();
    const email = identifier.trim();

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: secret });
    if (error || !data.user) {
      throw new Error(loginErrorMessage(error?.message));
    }

    let isAdmin: boolean;
    try {
      isAdmin = await fetchIsAdmin();
    } catch (err) {
      await supabase.auth.signOut();
      throw new Error(err instanceof Error ? err.message : 'بررسی دسترسی مدیر ناموفق بود.');
    }

    if (!isAdmin) {
      await supabase.auth.signOut();
      throw new Error(
        'این حساب دسترسی مدیر ندارد. نقش admin باید در app_metadata همین کاربر ثبت شده باشد.',
      );
    }

    return sessionFromUser(data.user.email, data.user.last_sign_in_at);
  }

  async logout(): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
    } catch {
      /* best effort — the panel clears its own state regardless */
    }
  }

  /**
   * Restore a session that the Supabase client kept for this browser
   * (refresh token in localStorage). Returns null when there is no
   * session, when the account is not an administrator, or when the
   * database could not be reached (fail closed → login page).
   */
  async restore(): Promise<AdminSession | null> {
    try {
      return await this.verifySession();
    } catch {
      return null;
    }
  }

  /**
   * Read the persisted session and confirm the account is an admin.
   * Throws when the check itself could not be performed (offline), so
   * callers can tell "not an admin" apart from "could not ask".
   */
  private async verifySession(): Promise<AdminSession | null> {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return null;

    const isAdmin = await fetchIsAdmin();
    if (!isAdmin) return null;

    return sessionFromUser(data.session.user.email ?? undefined, data.session.user.last_sign_in_at);
  }

  /**
   * Follow sign-in / sign-out / token events (e.g. another tab).
   * Every emission is re-verified against is_admin(). The verification
   * is deferred out of the auth callback on purpose: supabase-js holds
   * its auth lock while the callback runs, so calling back into the
   * client from inside it can deadlock.
   */
  subscribe(onChange: (session: AdminSession | null) => void): () => void {
    const supabase = getSupabase();
    if (!supabase) return () => undefined;

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        onChange(null);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setTimeout(() => {
          this.verifySession()
            .then((session) => onChange(session))
            .catch(() => {
              /* database unreachable — keep the current panel state */
            });
        }, 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }
}
