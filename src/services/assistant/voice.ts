// ============================================================
// ZHINO — «صدای فارسی دستیار» (فاز ۹) — لایهٔ اتصال به سرویس صدا
//
// ⚠️ قرارداد امنیتی این فایل (مثل client.ts و supabaseClient.ts):
//   هیچ کلید سرویس صدا در این فایل نیست و هرگز نخواهد بود.
//   مرورگر فقط به یکی از این دو مسیر حرف می‌زند:
//
//     ۱) Supabase Edge Function: <project>/functions/v1/zhino-voice
//        (کلید سرویس در Secrets خود Supabase می‌ماند)
//     ۲) Backend خودمان: VITE_VOICE_API_URL
//        (کلید در متغیر محیطی سرور می‌ماند)
//
//   در هر دو حالت هدر Authorization فقط «کلید عمومی» پروژه است
//   (publishable/anon) — همان کلیدی که همین حالا هم در بسته هست.
//
// اگر هیچ‌کدام پیکربندی نشده باشند (`null`)، هیچ درخواستی زده
// نمی‌شود و خواندن پاسخ به موتور صدای خود دستگاه برمی‌گردد
// (همان رفتار قبلی سایت، بدون تغییر).
//
// حریم خصوصی: فقط «متن پاسخ دستیار» فرستاده می‌شود — هرگز سؤال
// کاربر، نام، نشانی یا سبد خرید.
// ============================================================

import { getSupabasePublishableKey, getSupabaseUrl } from '../supabaseClient';

export interface VoiceRemoteConfig {
  /** آدرس کامل Endpoint صدا */
  endpoint: string;
  /** supabase = Edge Function پروژه | api = Backend خودمان */
  mode: 'supabase' | 'api';
  /** کلید عمومی برای هدر Authorization (فقط در حالت supabase) */
  publicKey: string | null;
}

/** مهلت ساخت صدا — بعد از آن، صدای خود دستگاه امتحان می‌شود */
const REQUEST_TIMEOUT_MS = 20_000;
/** مهلت بررسی آماده‌بودن سرویس (فقط برای تصمیم داخلی، بدون نمایش) */
const PROBE_TIMEOUT_MS = 8_000;
/** سقف متنی که برای خوانده‌شدن فرستاده می‌شود (هماهنگ با سرور) */
const MAX_TEXT_CHARS = 1200;

/**
 * پیکربندی صدای ابری — یا `null` اگر چیزی تنظیم نشده است.
 *
 *   VITE_VOICE_API_URL       → Backend خودمان (اولویت اول)
 *   VITE_SUPABASE_URL + key  → Supabase Edge Function
 */
export function getVoiceRemoteConfig(): VoiceRemoteConfig | null {
  const explicit = (import.meta.env.VITE_VOICE_API_URL ?? '').trim();
  if (explicit) {
    return { endpoint: explicit.replace(/\/+$/, ''), mode: 'api', publicKey: null };
  }

  const projectUrl = getSupabaseUrl().replace(/\/+$/, '');
  const publicKey = getSupabasePublishableKey();
  if (projectUrl && publicKey) {
    return {
      endpoint: `${projectUrl}/functions/v1/zhino-voice`,
      mode: 'supabase',
      publicKey,
    };
  }

  return null;
}

/** آیا صدای ابری پیکربندی شده است؟ (بدون هیچ درخواستی) */
export function isVoiceRemoteConfigured(): boolean {
  return getVoiceRemoteConfig() !== null;
}

export type VoiceRemoteErrorKind =
  /** Endpoint پیکربندی نشده */
  | 'unconfigured'
  /** پاسخ در زمان مقرر نرسید */
  | 'timeout'
  /** شبکه/سرور در دسترس نبود */
  | 'network'
  /** سهمیهٔ صدا تمام شده (۴۲۹) */
  | 'rate-limited'
  /** درخواست نامعتبر بود (۴۰۰/۴۱۳) */
  | 'rejected'
  /** سرور پاسخ خطا داد (۵xx) */
  | 'server'
  /** پاسخ سرور صوت معتبری نبود */
  | 'invalid';

export class VoiceRemoteError extends Error {
  readonly kind: VoiceRemoteErrorKind;
  readonly status?: number;

  constructor(kind: VoiceRemoteErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'VoiceRemoteError';
    this.kind = kind;
    this.status = status;
  }
}

function headersFor(config: VoiceRemoteConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.publicKey) {
    // کلید عمومی پروژه — همان کلیدی که همین حالا در بسته هست.
    // هیچ کلید سری‌ای اینجا نیست.
    headers.Authorization = `Bearer ${config.publicKey}`;
    headers.apikey = config.publicKey;
  }
  return headers;
}

/** یک درخواست با مهلت مشخص؛ AbortSignal بیرونی هم رعایت می‌شود */
async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  external?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromOutside = () => controller.abort();
  external?.addEventListener('abort', abortFromOutside, { once: true });

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new VoiceRemoteError('timeout', 'صدا در زمان مقرر ساخته نشد.');
    }
    if (external?.aborted) {
      throw new VoiceRemoteError('network', 'درخواست صدا لغو شد.');
    }
    throw new VoiceRemoteError(
      'network',
      error instanceof Error ? error.message : 'ارتباط با سرویس صدا برقرار نشد.',
    );
  } finally {
    clearTimeout(timer);
  }
}

/** نگاشت کد وضعیت HTTP به نوع خطای صدا */
function kindForStatus(status: number): VoiceRemoteErrorKind {
  if (status === 429) return 'rate-limited';
  if (status === 400 || status === 413 || status === 422) return 'rejected';
  if (status === 501) return 'unconfigured';
  return 'server';
}

/**
 * ساخت صدای فارسی برای یک متن.
 *
 * خروجی: یک Blob صوتی (MP3) که با `URL.createObjectURL` مستقیم در
 * یک `<audio>` پخش می‌شود. هیچ کلیدی در مرورگر نیست و هیچ چیزی
 * جز همین متن فرستاده نمی‌شود.
 */
export async function synthesizePersianSpeech(
  text: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const config = getVoiceRemoteConfig();
  if (!config) {
    throw new VoiceRemoteError('unconfigured', 'صدای ابری روی سرور پیکربندی نشده است.');
  }

  const payload = text.trim().slice(0, MAX_TEXT_CHARS);
  if (payload.length === 0) {
    throw new VoiceRemoteError('rejected', 'متنی برای خواندن نیست.');
  }

  const response = await fetchWithTimeout(
    config.endpoint,
    {
      method: 'POST',
      headers: headersFor(config),
      body: JSON.stringify({ text: payload }),
    },
    REQUEST_TIMEOUT_MS,
    signal,
  );

  if (!response.ok) {
    let code = '';
    try {
      const body = (await response.json()) as { error?: unknown };
      code = typeof body.error === 'string' ? body.error : '';
    } catch {
      /* پاسخ خطا JSON نبود؛ کد وضعیت کافی است */
    }
    if (code === 'not_configured') {
      throw new VoiceRemoteError('unconfigured', 'صدای ابری روی سرور پیکربندی نشده است.', response.status);
    }
    throw new VoiceRemoteError(kindForStatus(response.status), 'سرویس صدا پاسخ خطا داد.', response.status);
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new VoiceRemoteError('invalid', 'پاسخ سرویس صدا خالی بود.');
  }
  return blob;
}

export interface VoiceProbeResult {
  /** سرویس پیکربندی شده و صدای فارسی روی آن موجود است */
  ready: boolean;
  /** نام صدای پیکربندی‌شده (فقط برای لاگ داخلی؛ به کاربر نشان داده نمی‌شود) */
  voice: string | null;
}

/**
 * بررسی سریع آماده‌بودن سرویس صدا. هرگز خطا پرتاب نمی‌کند:
 * نبودِ پاسخ یعنی «آماده نیست» و سایت به صدای خود دستگاه برمی‌گردد.
 */
export async function probeVoiceRemote(signal?: AbortSignal): Promise<VoiceProbeResult> {
  const offline: VoiceProbeResult = { ready: false, voice: null };
  const config = getVoiceRemoteConfig();
  if (!config) return offline;

  try {
    const response = await fetchWithTimeout(
      config.endpoint,
      { method: 'GET', headers: headersFor(config) },
      PROBE_TIMEOUT_MS,
      signal,
    );
    if (!response.ok) return offline;
    const payload = (await response.json()) as {
      configured?: unknown;
      ready?: unknown;
      voice?: unknown;
    };
    return {
      ready: payload?.configured === true && payload?.ready === true,
      voice: typeof payload?.voice === 'string' && payload.voice.length > 0 ? payload.voice : null,
    };
  } catch {
    return offline;
  }
}
