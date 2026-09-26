// ============================================================
// ZHINO — TEMPORARY diagnostic: admin access trace
//
// DELETE THIS FILE (and its route in src/App.tsx) once the
// product-image upload issue is closed.
//
// What it is for: the panel's admin verification runs in the
// OPERATOR'S BROWSER, with the operator's own Supabase session. No
// server-side trace can see that session. This page reproduces, step by
// step and with the real signed-in account, exactly what
// `checkAdminAccess()` does, so the failing stage can be named instead
// of guessed:
//
//   1. client configuration (URL + key CLASS — never the key itself)
//   2. auth.getSession()      — is there a session at all?
//   3. auth.getUser()         — the LIVE record: app_metadata.role
//   4. the JWT claim          — does the CURRENT token carry the role?
//   5. rpc is_admin()         — the database's verdict on that token
//   6. rpc product_image_api_version() — is the DB contract v3?
//   7. rpc product_image_upload_allowed(probe)  — Storage gate, dry
//   8. rpc manage_product_image(probe)          — write gate, dry
//   9. checkAdminAccess()     — the real gate, and which stage refuses
//
// SECURITY POSTURE — nothing here is a bypass:
//   * the page lives INSIDE AdminGate, so it is unreachable without an
//     already-verified admin session (fail closed, like every page);
//   * every call is a read or a pure predicate; the two probes are dry
//     by construction — the write probe targets a product id that does
//     not exist, so the RPC raises `product_not_found` AFTER its
//     is_admin() gate and BEFORE touching a single row;
//   * no service key, no hardcoded account, no RLS change, no admin
//     flag is set anywhere on this page.
// ============================================================

import { useState } from 'react';
import { getSupabase, getSupabaseUrl, getSupabasePublishableKey, classifySupabaseKey, isSupabaseConfigured } from '../../services/supabaseClient';
import { checkAdminAccess, describeAdminAccessIssue, readJwtAppMetadataRole } from '../../services/supabaseAdminRole';

interface Step {
  /** stage number, shown as ۱..۹ */
  no: number;
  name: string;
  /** true = passed, false = failed, null = informational (no verdict) */
  ok: boolean | null;
  detail: string;
}

/** Mask the local part, keep the domain: identifiable, not a full address. */
function maskEmail(email: string | undefined | null): string {
  if (!email) return '(ندارد)';
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/** Read the `exp` claim of our own token — never the token itself. */
function readJwtExpiry(accessToken: string | undefined): { exp: number | null; secondsLeft: number | null } {
  if (!accessToken) return { exp: null, secondsLeft: null };
  try {
    const payloadPart = accessToken.split('.')[1] ?? '';
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)))) as { exp?: unknown };
    if (typeof payload.exp !== 'number') return { exp: null, secondsLeft: null };
    return { exp: payload.exp, secondsLeft: Math.round(payload.exp - Date.now() / 1000) };
  } catch {
    return { exp: null, secondsLeft: null };
  }
}

function errorText(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error ?? '');
  const e = error as { message?: string; code?: string; details?: string | null; statusCode?: string };
  return [e.code, e.statusCode, e.message, e.details].filter((p) => typeof p === 'string' && p.length > 0).join(' · ');
}

export default function AdminAuthTracePage() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [verdict, setVerdict] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setVerdict(null);
    const out: Step[] = [];
    const push = (no: number, name: string, ok: boolean | null, detail: string) => out.push({ no, name, ok, detail });

    try {
      const supabase = getSupabase();

      /* 1 — client configuration ─────────────────────────────── */
      const key = getSupabasePublishableKey();
      push(1, 'پیکربندی کلاینت', isSupabaseConfigured(),
        `URL: ${getSupabaseUrl() || '(تنظیم نشده)'} · کلاس کلید: ${classifySupabaseKey(key)} · مقدار کلید نمایش داده نمی‌شود`);

      if (!supabase) {
        setVerdict('کلاینت Supabase ساخته نشده است (پیکربندی ناقص یا کلید از نوعsecret).');
        setSteps(out);
        setRunning(false);
        return;
      }

      /* 2 — session ──────────────────────────────────────────── */
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const session = sessionData.session;
      const { secondsLeft } = readJwtExpiry(session?.access_token);
      push(2, 'auth.getSession()', session?.access_token ? true : false,
        session?.access_token
          ? `نشست هست · کاربر: ${maskEmail(session.user?.email)} · id: ${session.user?.id ?? '(ندارد)'} · `
            + `انقضای توکن: ${secondsLeft === null ? 'نامعلوم' : `${secondsLeft} ثانیه دیگر`}`
          : `نشستی وجود ندارد${sessionError ? ` · ${errorText(sessionError)}` : ''}`);

      /* 3 — the LIVE user record ─────────────────────────────── */
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const appRole = (userData.user?.app_metadata as { role?: unknown } | undefined)?.role;
      const userRole = (userData.user?.user_metadata as { role?: unknown } | undefined)?.role;
      push(3, 'auth.getUser() (رکورد زنده)', userData.user ? appRole === 'admin' : false,
        userData.user
          ? `app_metadata.role = ${JSON.stringify(appRole ?? null)} · user_metadata.role = ${JSON.stringify(userRole ?? null)}`
          : `دریافت رکورد ناموفق بود · ${errorText(userError) || 'بدون خطا'}`);

      /* 4 — the claim inside the CURRENT token ───────────────── */
      const claimRole = readJwtAppMetadataRole(session?.access_token);
      push(4, 'کلیِم app_metadata.role در توکن فعلی', claimRole === 'admin',
        `مقدار در توکن: ${JSON.stringify(claimRole)}`);

      /* 5 — the database's verdict on this token ─────────────── */
      const isAdminCall = await supabase.rpc('is_admin');
      push(5, 'rpc is_admin()', isAdminCall.error ? false : isAdminCall.data === true,
        isAdminCall.error
          ? `خطا · ${errorText(isAdminCall.error)}`
          : `پاسخ: ${JSON.stringify(isAdminCall.data)}`);

      /* 6 — the database contract version ────────────────────── */
      const versionCall = await supabase.rpc('product_image_api_version');
      push(6, 'rpc product_image_api_version()', versionCall.error ? false : versionCall.data === 3,
        versionCall.error
          ? `خطا · ${errorText(versionCall.error)}`
          : `نسخهٔ قرارداد دیتابیس: ${JSON.stringify(versionCall.data)} (پنل فعلی: ۳)`);

      /* 7 — Storage gate, dry (no object is created) ──────────── */
      const probePath = `products/__zhino_trace_probe__/${crypto.randomUUID()}.png`;
      const uploadAllowed = await supabase.rpc('product_image_upload_allowed', { p_path: probePath });
      push(7, 'rpc product_image_upload_allowed(probe)', uploadAllowed.error ? false : uploadAllowed.data === true,
        uploadAllowed.error
          ? `خطا · ${errorText(uploadAllowed.error)}`
          : `پاسخ برای مسیر آزمایشی: ${JSON.stringify(uploadAllowed.data)} · true یعنی سیاست Storage همین نشست را می‌پذیرد`);

      /* 8 — write gate, dry: raises BEFORE writing any row ────── */
      const writeProbe = await supabase.rpc('manage_product_image', {
        p_action: 'register',
        p_product_id: '__zhino_trace_probe__',
        p_image_id: crypto.randomUUID(),
        p_expected_url: null,
        p_payload: { operation_id: crypto.randomUUID() },
      });
      const writeText = errorText(writeProbe.error);
      const authorised = /product_not_found/.test(writeText);
      push(8, 'rpc manage_product_image(probe) — مسیر نوشت، بدون تغییر داده', authorised,
        authorised
          ? 'دروازهٔ مدیر رد شد: پاسخ product_not_found یعنی بررسی is_admin() موفق بود و فقط محصول آزمایشی وجود ندارد'
          : `پاسخ: ${writeText || JSON.stringify(writeProbe.data) || '(بدون پاسخ)'}`);

      /* 9 — the real gate used by the panel ──────────────────── */
      try {
        await checkAdminAccess(supabase);
        push(9, 'checkAdminAccess()', true, 'همهٔ مراحل پاس شد — این نشست از دید پنل مدیر است.');
      } catch (error) {
        const issue = (error as { issue?: { kind: string } }).issue;
        push(9, 'checkAdminAccess()', false,
          issue
            ? `مرحلهٔ شکست: ${issue.kind} — ${describeAdminAccessIssue(issue as never)}`
            : `خطا: ${errorText(error)}`);
      }

      /* verdict ──────────────────────────────────────────────── */
      const failed = out.filter((s) => s.ok === false);
      setVerdict(failed.length === 0
        ? 'همهٔ مراحل پاس شد: نشست معتبر است، نقش admin در رکورد زنده و در توکن هست، و دیتابیس همین توکن را مدیر می‌داند.'
        : `مرحله(های) شکست‌خورده: ${failed.map((s) => `${s.no} (${s.name})`).join('، ')}`);
      setSteps(out);
    } catch (error) {
      setVerdict(`اجرای ردیابی متوقف شد: ${errorText(error)}`);
      setSteps(out);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <header className="panel-lux rounded-2xl px-5 py-4">
        <h1 className="text-lg font-black text-wine-950">ردیابی دسترسی مدیر (موقت)</h1>
        <p className="mt-1 text-[0.78rem] leading-6 text-mocha">
          این صفحه با <b>همان حسابی که وارد شده‌اید</b> و با نشست واقعی مرورگر، مراحل تأیید دسترسی را یکی‌یکی اجرا می‌کند.
          هیچ چیزی تغییر نمی‌دهد: دو مرحلهٔ آخر فقط دروازهٔ نوشت را «به‌صورت آزمایشی» می‌پرسند و هیچ ردیفی ثبت نمی‌شود.
          این فایل پس از بسته‌شدن مشکل باید حذف شود.
        </p>
      </header>

      <button
        type="button"
        onClick={() => void run()}
        disabled={running}
        className="rounded-xl bg-wine-800 px-5 py-2.5 text-sm font-bold text-cream-page disabled:opacity-60"
      >
        {running ? 'در حال اجرا…' : 'اجرای ردیابی'}
      </button>

      {verdict && (
        <p className="panel-lux rounded-xl px-4 py-3 text-sm font-bold text-wine-950">{verdict}</p>
      )}

      {steps.length > 0 && (
        <ol className="space-y-2">
          {steps.map((step) => (
            <li key={step.no} className="panel-lux rounded-xl px-4 py-3">
              <div className="flex items-start gap-3">
                <span className={
                  step.ok === true ? 'mt-0.5 text-sm font-black text-emerald-700'
                    : step.ok === false ? 'mt-0.5 text-sm font-black text-rose-700'
                      : 'mt-0.5 text-sm font-black text-mocha'
                }>
                  {step.ok === true ? '✓' : step.ok === false ? '✕' : '•'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-wine-950">{step.no}. {step.name}</p>
                  <p className="mt-1 break-words text-[0.78rem] leading-6 text-mocha">{step.detail}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
