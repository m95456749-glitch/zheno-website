// ============================================================
// ZHINO — admin role verification against Supabase (live truth)
//
// WHERE role=admin COMES FROM (and why this module exists):
//
//   Database side (the ONLY enforcement that matters):
//     public.is_admin()  =  coalesce((auth.jwt() -> 'app_metadata'
//     ->> 'role') = 'admin', false). Every admin write — the
//     manage_product_image() RPC, the Storage RLS policies on the
//     «product-images» bucket and all catalog RLS policies — reads the
//     role from the request JWT's app_metadata claim. That claim is a
//     SNAPSHOT of auth.users.raw_app_meta_data taken when GoTrue
//     issued or refreshed the access token.
//
//   The old panel gate trusted ONLY that snapshot. Three real-world
//   failures all ended in the same misleading «دسترسی مدیر تأیید نشد»
//   refusal at upload time:
//
//     1. the role was granted in user_metadata (the dashboard's user
//        metadata editor) instead of app_metadata — is_admin() never
//        sees it;
//     2. the session token was issued BEFORE the role was granted (or
//        refreshed from a record without it), so the snapshot and the
//        live record disagree;
//     3. the session quietly disappeared mid-panel — supabase-js then
//        sends the publishable key as the bearer (an anonymous
//        request), which Row Level Security rightly refuses.
//
// This module closes all three gaps WITHOUT touching RLS or the RPCs:
//
//   * the panel is opened only after the LIVE Supabase user record
//     (auth.getUser() → the server-side row in auth.users) really
//     carries app_metadata.role === 'admin';
//   * when the live record is admin but the current token does not
//     carry the claim, the session is refreshed so the re-issued JWT
//     matches the record — the database keeps deciding, with correct
//     input;
//   * a role placed in the wrong metadata bucket is diagnosed by name
//     instead of surfacing later as an opaque RLS error.
//
// SECURITY POSTURE
//   * strictly fail-closed: any uncertainty refuses access;
//   * nothing here GRANTS anything — Row Level Security and the
//     security-definer RPCs remain the sole authorisers of every write;
//   * the client-side JWT decode below is a hint about our OWN token
//     (already readable by the user); it is never used to allow
//     anything on its own;
//   * no service key, no hardcoded account, no bypass.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchIsAdmin } from './supabaseCatalog';

/** What exactly prevented the account from being recognised as admin. */
export type AdminAccessIssue =
  /** no Supabase session exists in this browser (or it was dropped) */
  | { kind: 'no-session' }
  /**
   * the LIVE user record has no admin role.
   * `roleInUserMetadata` means the value was written to user_metadata
   * instead of app_metadata — the common dashboard mistake.
   */
  | { kind: 'role-missing'; roleInUserMetadata: boolean }
  /** the live record is admin but a valid token could not be obtained */
  | { kind: 'stale-claims' }
  /** transient: the checks themselves could not be completed */
  | { kind: 'unverifiable' };

/** Fail-closed verification failure; `issue` says exactly why. */
export class AdminAccessError extends Error {
  readonly issue: AdminAccessIssue;

  constructor(issue: AdminAccessIssue, message: string) {
    super(message);
    this.name = 'AdminAccessError';
    this.issue = issue;
  }
}

/** The role value must match this exactly (case-sensitive), as in SQL. */
const ADMIN_ROLE = 'admin';

/**
 * Decode the payload of OUR OWN access token. A browser session token
 * is not a secret from its owner — this only saves a refresh round
 * trip and powers precise diagnostics. The result is never trusted as
 * an authorisation decision.
 */
export function readJwtAppMetadataRole(accessToken: string | undefined): string | null {
  if (!accessToken) return null;
  try {
    const payloadPart = accessToken.split('.')[1] ?? '';
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const decoded = atob(padded);
    // base64 → UTF-8 safe parse (roles are ASCII, but metadata may not be)
    const bytes = Uint8Array.from(decoded, (ch) => ch.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as {
      app_metadata?: { role?: unknown };
    };
    const role = payload?.app_metadata?.role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null; // undecodable → treated as "claim missing", never fatal
  }
}

function fail(kind: 'no-session' | 'stale-claims' | 'unverifiable', message: string): never {
  throw new AdminAccessError({ kind }, message);
}

function failMissingRole(roleInUserMetadata: boolean): never {
  throw new AdminAccessError({ kind: 'role-missing', roleInUserMetadata }, 'live record has no admin role');
}

/** True for GoTrue answers that mean the access token itself is unusable. */
function isInvalidTokenError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { status?: number; statusCode?: number; message?: string; name?: string };
  if (err.status === 401 || err.statusCode === 401) return true;
  const text = `${err.name ?? ''} ${err.message ?? ''}`.toLowerCase();
  return /invalid (jwt|token|login)|jwt (expired|not found|malformed)|token (has expired|is invalid|expired)|bad jwt/i.test(text);
}

/** True for transport-level failures (offline, DNS, timeout). */
function isTransportError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; message?: string; isAuthRetryableFetchError?: boolean };
  if (err.isAuthRetryableFetchError === true) return true;
  if (err.name === 'AuthRetryableFetchError' || err.name === 'AuthUnknownError') {
    return !isInvalidTokenError(error);
  }
  return /failed to fetch|networkerror|fetch failed|econn|timeout|timed out/i.test(err.message ?? '');
}

interface LiveRoleRecord {
  appRole: unknown;
  userRole: unknown;
}

/**
 * Ask GoTrue for the LIVE user record behind the current session
 * (server-side auth.users, not a token snapshot).
 */
async function readLiveRole(supabase: SupabaseClient, retriesLeft = 1): Promise<LiveRoleRecord> {
  const { data, error } = await supabase.auth.getUser();
  if (!error && data.user) {
    return {
      appRole: (data.user.app_metadata as { role?: unknown } | undefined)?.role,
      userRole: (data.user.user_metadata as { role?: unknown } | undefined)?.role,
    };
  }
  if (error && isInvalidTokenError(error) && retriesLeft > 0) {
    // An expired/invalid token is not proof about the role: re-issue
    // from the refresh token (GoTrue embeds the CURRENT record) and
    // ask once more.
    try {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session) throw refreshed.error ?? new Error('refresh failed');
      return readLiveRole(supabase, retriesLeft - 1);
    } catch (refreshError) {
      if (isTransportError(refreshError)) fail('unverifiable', 'session refresh failed (transport)');
      fail('no-session', 'session could not be refreshed');
    }
  }
  if (error && isTransportError(error)) fail('unverifiable', 'user record could not be fetched (transport)');
  fail('no-session', 'user record request was refused');
}

/**
 * Verify — securely and against Supabase itself — that the current
 * session belongs to an administrator. Resolves only when ALL hold:
 *
 *   1. a Supabase session exists in this browser;
 *   2. the database's own is_admin() accepts the current token
 *      (defence in depth; the same check every write will face);
 *   3. the LIVE GoTrue record carries app_metadata.role === 'admin'
 *      (catches a revoked role even while an old token still lives);
 *   4. the access token actually carries the claim — if the record is
 *      admin but the token predates the grant, the session is
 *      refreshed so subsequent writes present the correct claims, and
 *      the database is asked again.
 *
 * Throws AdminAccessError otherwise — never resolves "partially".
 */
export async function checkAdminAccess(supabase: SupabaseClient): Promise<void> {
  // 1 — session
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session?.access_token) fail('no-session', 'no session');

  // 2 — the database's verdict on the CURRENT token
  let dbSaysAdmin: boolean;
  try {
    dbSaysAdmin = await fetchIsAdmin();
  } catch {
    fail('unverifiable', 'is_admin() could not be asked');
  }

  // 3 — the live record (authoritative app_metadata source)
  let live: LiveRoleRecord;
  try {
    live = await readLiveRole(supabase);
  } catch (error) {
    if (error instanceof AdminAccessError) throw error;
    fail('unverifiable', 'user record could not be read');
  }
  if (live.appRole !== ADMIN_ROLE) failMissingRole(live.userRole === ADMIN_ROLE);

  // 4 — make the token match the record, then re-ask the database
  const claimSaysAdmin = readJwtAppMetadataRole(session.access_token) === ADMIN_ROLE;
  if (!dbSaysAdmin || !claimSaysAdmin) {
    try {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session) throw refreshed.error ?? new Error('refresh failed');
    } catch (error) {
      if (isTransportError(error)) fail('unverifiable', 'refresh failed (transport)');
      fail('stale-claims', 'refresh failed');
    }
    if (!dbSaysAdmin) {
      let rechecked: boolean;
      try {
        rechecked = await fetchIsAdmin();
      } catch {
        fail('unverifiable', 'is_admin() could not be asked after refresh');
      }
      if (!rechecked) fail('stale-claims', 'database refuses the refreshed token');
    }
  }
}

/**
 * Persian, operator-safe wording for each refusal — shown by the login
 * page. Deliberately names app_metadata vs user_metadata, because that
 * is the single most common misconfiguration.
 */
export function describeAdminAccessIssue(issue: AdminAccessIssue): string {
  switch (issue.kind) {
    case 'no-session':
      return 'نشست Supabase معتبری وجود ندارد؛ دوباره وارد شوید.';
    case 'role-missing':
      return issue.roleInUserMetadata
        ? 'این حساب دسترسی مدیر ندارد: نقش admin در user_metadata ثبت شده، اما دیتابیس فقط app_metadata را می‌خواند. ' +
            'همین مقدار {"role":"admin"} را برای همین کاربر در app_metadata ثبت کنید ' +
            '(Supabase Dashboard → Authentication → Users → کاربر → App metadata یا Management API) و دوباره وارد شوید.'
        : 'این حساب دسترسی مدیر ندارد. نقش {"role":"admin"} باید در app_metadata همین کاربر ثبت شود ' +
            '(نه در user_metadata): Supabase Dashboard → Authentication → Users → کاربر → App metadata، ' +
            'یا از طریق Management API با کلید سرویس. سپس دوباره وارد شوید.';
    case 'stale-claims':
      return 'نقش مدیر برای این حساب ثبت است، اما توکن نشست آن را دریافت نکرد. از پنل خارج شوید و دوباره وارد شوید.';
    case 'unverifiable':
      return 'بررسی دسترسی مدیر ناموفق بود؛ اتصال به Supabase را بررسی کنید و دوباره تلاش کنید.';
  }
}
