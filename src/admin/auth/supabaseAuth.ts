// ============================================================
// ZHINO — Supabase Auth provider for the admin panel
//
// Real authentication, no fake security:
//   1. the operator signs in with a Supabase Auth account
//      (e-mail + password) — credentials go straight to Supabase
//      over HTTPS and are never stored by this app;
//   2. administrator rights are then verified against Supabase
//      ITSELF, in three layers (services/supabaseAdminRole.ts):
//        a. the database's own is_admin() must accept the current
//           token — the same check every write will face;
//        b. the LIVE user record (auth.getUser(), i.e. the row in
//           auth.users) must carry app_metadata.role === 'admin' —
//           the role must be set in app_metadata, NOT user_metadata;
//        c. when the record is admin but the session token predates
//           the grant, the session is refreshed so the re-issued JWT
//           carries the claim the database reads.
//      Set {"role":"admin"} in app_metadata for the operator account
//      (Dashboard → Authentication → Users → App metadata, or the
//      Management API). If it lands in user_metadata by mistake, the
//      login page now says exactly that instead of failing later.
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
import { AdminAccessError, checkAdminAccess, describeAdminAccessIssue } from '../../services/supabaseAdminRole';
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

    try {
      await checkAdminAccess(supabase);
    } catch (err) {
      await supabase.auth.signOut();
      if (err instanceof AdminAccessError) {
        throw new Error(describeAdminAccessIssue(err.issue));
      }
      throw new Error('بررسی دسترسی مدیر ناموفق بود.');
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
   * checks could not be completed (fail closed → login page).
   */
  async restore(): Promise<AdminSession | null> {
    try {
      return await this.verifySession();
    } catch {
      return null;
    }
  }

  /**
   * Read the persisted session and confirm the account is an admin —
   * against the database AND the live Supabase user record, healing a
   * stale token on the way (supabaseAdminRole.checkAdminAccess).
   * Throws when the verification itself could not be performed, so
   * callers can fail closed instead of guessing.
   */
  private async verifySession(): Promise<AdminSession | null> {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return null;

    try {
      await checkAdminAccess(supabase);
    } catch {
      return null;
    }

    return sessionFromUser(data.session.user.email ?? undefined, data.session.user.last_sign_in_at);
  }

  /**
   * Follow sign-in / sign-out / token events (e.g. another tab).
   * Every emission is re-verified against Supabase (live record +
   * is_admin()). The verification is deferred out of the auth
   * callback on purpose: supabase-js holds its auth lock while the
   * callback runs, so calling back into the client from inside it can
   * deadlock.
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
