// ============================================================
// ZHINO — «صدای ابری فارسی دستیار ژینو» (فاز ۹) — کلاینت فرانت‌اند
//
// ⚠️ قرارداد امنیتی این فایل (مثل supabaseClient.ts و client.ts):
//   هیچ کلید Azure اینجا وجود ندارد و هیچ‌وقت نخواهد داشت. مرورگر
//   فقط با Supabase Edge Function خودمان حرف می‌زند:
//
//     <project>/functions/v1/zhino-voice     (Azure → fa-IR-DilaraNeural)
//
//   و کلید Azure فقط در Secrets سوپابیس می‌ماند. هدر Authorization
//   فقط «کلید عمومی» پروژه است (publishable/anon) — همان کلیدی که
//   RLS آن را محدود می‌کند و در بستهٔ نهایی سایت هم هست.
//
// کش صدا:
//   فقط حافظهٔ موقت مرورگر (یک Map در حافظهٔ همین صفحه). نه دیسک،
//   نه localStorage، نه IndexedDB؛ بستن/تازه‌سازی صفحه همه‌چیز را
//   پاک می‌کند. پخش مجدد یک پاسخ از همین کش خوانده می‌شود و هیچ
//   درخواست تازه‌ای به سرور نمی‌زند.
//
// اگر Supabase پیکربندی نشده باشد (`null`)، صدا دقیقاً مثل قبل با
// موتور خود مرورگر کار می‌کند و هیچ درخواست شبکه‌ای زده نمی‌شود.
// ============================================================

import { getSupabasePublishableKey, getSupabaseUrl } from '../supabaseClient';

export interface CloudVoiceConfig {
  /** آدرس کامل Edge Function صدا */
  endpoint: string;
  /** کلید عمومی پروژه — برای Authorization/apikey (همان چیزی که RLS می‌شناسد) */
  publicKey: string;
}

export type CloudVoiceErrorKind =
  /** Supabase پیکربندی نشده — صدای ابری اصلاً تعریف نشده */
  | 'unconfigured'
  /** مدار موقتاً باز است (از شکست اخیر شبکه/سرور) */
  | 'cooldown'
  /** Secret روی سرور تنظیم نشده (۵۰۱) */
  | 'not-configured'
  /** شبکه/تابع در دسترس نبود */
  | 'network'
  /** پاسخ در زمان مقرر نرسید */
  | 'timeout'
  /** سهمیه تمام شده (۴۲۹ از تابع یا ضدسوءاستفاده) */
  | 'quota'
  /** متن/درخواست پذیرفته نشد (۴۰۰/۴۰۳/۴۱۳) */
  | 'rejected'
  /** خطای سمت سرور/Azure (۵xx) */
  | 'server'
  /** پاسخ معتبرِ صوتی نبود */
  | 'invalid';

export class CloudVoiceError extends Error {
  readonly kind: CloudVoiceErrorKind;
  readonly status?: number;

  constructor(kind: CloudVoiceErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'CloudVoiceError';
    this.kind = kind;
    this.status = status;
  }
}

/** پیکربندی صدای ابری — یا `null` اگر Supabase تنظیم نشده است. */
export function getCloudVoiceConfig(): CloudVoiceConfig | null {
  const projectUrl = getSupabaseUrl().replace(/\/+$/, '');
  const publicKey = getSupabasePublishableKey();
  if (!projectUrl || !publicKey) return null;
  return {
    endpoint: `${projectUrl}/functions/v1/zhino-voice`,
    publicKey,
  };
}

/** آیا صدای ابری برای این نشست در دسترس است؟ (بدون هیچ درخواستی) */
export function isCloudVoiceConfigured(): boolean {
  return getCloudVoiceConfig() !== null;
}

/* ── بررسی سلامت برای نمایش «وضعیت اتصال» در پنل مدیریت ─────── */

export type CloudVoiceHealth =
  /** Supabase پیکربندی نشده (حالت آفلاین/دمو) */
  | { state: 'no-supabase' }
  /** سرویس آماده است؛ Secret تنظیم شده */
  | { state: 'ready'; voice: string | null; enabled: boolean }
  /** تابع پاسخ می‌دهد ولی Secretهای Azure تنظیم نشده‌اند */
  | { state: 'not-configured' }
  /** تابع/شبکه در دسترس نبود */
  | { state: 'unreachable' };

const HEALTH_TIMEOUT_MS = 8_000;

/**
 * یک GET سبُک روی «zhino-voice» — بدنهٔ پاسخ فقط شامل وضعیت آماده‌بودن،
 * نام صدا و کلید اصلی مدیر است؛ هیچ کلیدی (نه Azure و نه بقیه) در آن
 * نیست و نخواهد بود.
 */
export async function probeCloudVoiceHealth(): Promise<CloudVoiceHealth> {
  const config = getCloudVoiceConfig();
  if (!config) return { state: 'no-supabase' };

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(config.endpoint, {
      method: 'GET',
      headers: headersFor(config),
      signal: controller.signal,
    });
    if (!response.ok) return { state: 'unreachable' };
    const payload = (await response.json()) as {
      configured?: unknown;
      voice?: unknown;
      enabled?: unknown;
    };
    if (payload?.configured === true) {
      return {
        state: 'ready',
        voice: typeof payload.voice === 'string' ? payload.voice : null,
        enabled: payload.enabled !== false,
      };
    }
    return { state: 'not-configured' };
  } catch {
    return { state: 'unreachable' };
  } finally {
    window.clearTimeout(timer);
  }
}

/* ── کشِ فقط‌حافظه — نه دیسک، نه localStorage ─────────────── */

/** حداکثر ورودی‌های کش؛ پاسخ‌های دستیار کوتاه‌اند (~چند صد کیلوبایت هر کدام) */
const MAX_CACHE_ENTRIES = 12;
const cache = new Map<string, { text: string; blob: Blob }>();

/** بیشینهٔ طول متن برای خواندن ابری — با محدودیت تابع (۲۰۰۰) هماهنگ است */
export const CLOUD_VOICE_MAX_CHARS = 2000;

/** هش کوچک و غیررمزنگاری برای کلید کش (متن کامل هم کنارش نگه داشته می‌شود) */
function cacheKey(text: string): string {
  const normalized = text.trim();
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16)}-${normalized.length}`;
}

function readCache(text: string): Blob | null {
  const key = cacheKey(text);
  const entry = cache.get(key);
  if (!entry || entry.text !== text.trim()) return null;
  // تازه‌سازی ترتیب برای eviction کم‌مصرف (LRU ساده)
  cache.delete(key);
  cache.set(key, entry);
  return entry.blob;
}

function writeCache(text: string, blob: Blob): void {
  const key = cacheKey(text);
  cache.delete(key);
  cache.set(key, { text: text.trim(), blob });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/* ── مدار شکننده: بعد از قطعی، یک مدت کوتاه مستقیم به جایگزین ── */

/** بعد از شکست زیرساختی، این‌قدر صبر تا دوباره ابری امتحان شود */
const CIRCUIT_COOLDOWN_MS = 90_000;
let circuitOpenUntil = 0;

function circuitOpenNow(): boolean {
  return Date.now() < circuitOpenUntil;
}

function tripCircuit(): void {
  circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
}

function resetCircuit(): void {
  circuitOpenUntil = 0;
}

/* ── درخواست ────────────────────────────────────────────────── */

/** مهلت دریافت صدا — بیشتر از این، جایگزین مرورگر پاسخ می‌دهد */
const REQUEST_TIMEOUT_MS = 14_000;

function headersFor(config: CloudVoiceConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    // کلید عمومی پروژه؛ هیچ کلید سری‌ای اینجا نیست و نخواهد بود.
    Authorization: `Bearer ${config.publicKey}`,
    apikey: config.publicKey,
  };
}

function toBlob(response: Response): Promise<Blob> {
  const contentType = (response.headers.get('Content-Type') ?? '').toLowerCase();
  if (!contentType.includes('audio/')) {
    return Promise.reject(new CloudVoiceError('invalid', 'پاسخ سرور صدای معتبری نبود.', response.status));
  }
  return response.blob();
}

/**
 * صدای ابری برای «متن» را بگیر: اول کش فقط‌حافظه، بعد یک درخواست به
 * Edge Function. موفقیت در کش ذخیره می‌شود تا پخش مجدد همان پاسخ
 * هیچ درخواستی نزند. شکست، یک CloudVoiceError با kind مشخص است تا
 * لایهٔ بالا مسیر جایگزین (صدای مرورگر) را برگزیند.
 */
export async function loadCloudAudio(text: string, external?: AbortSignal): Promise<Blob> {
  const cached = readCache(text);
  if (cached) return cached;

  if (text.trim().length > CLOUD_VOICE_MAX_CHARS) {
    // پاسخ‌های خیلی بلند مستقیم به صدای مرورگر می‌روند (محافظ سهمیه)
    throw new CloudVoiceError('rejected', 'text_too_long');
  }

  const config = getCloudVoiceConfig();
  if (!config) throw new CloudVoiceError('unconfigured', 'صدای ابری پیکربندی نشده است.');
  if (circuitOpenNow()) {
    throw new CloudVoiceError('cooldown', 'صدای ابری موقتاً در دسترس نیست؛ جایگزین محلی.');
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const abortFromOutside = () => controller.abort();
  external?.addEventListener('abort', abortFromOutside, { once: true });

  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      method: 'POST',
      headers: headersFor(config),
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
  } catch (error) {
    if (external?.aborted) {
      throw new CloudVoiceError('network', 'aborted-by-caller');
    }
    if (timedOut) {
      tripCircuit();
      throw new CloudVoiceError('timeout', 'پاسخ سرویس صدا به‌موقع نرسید.');
    }
    tripCircuit();
    throw new CloudVoiceError('network', 'سرویس صدا در دسترس نبود.');
  } finally {
    window.clearTimeout(timer);
    external?.removeEventListener('abort', abortFromOutside);
  }

  if (response.status === 501) {
    tripCircuit();
    throw new CloudVoiceError('not-configured', 'صدای ابری روی سرور پیکربندی نشده است.', 501);
  }
  if (response.status === 429) {
    tripCircuit();
    throw new CloudVoiceError('quota', 'سهمیهٔ سرویس صدا پر شده است.', 429);
  }
  if (response.status === 400 || response.status === 403 || response.status === 413) {
    // مشکل خودِ درخواست است، نه زیرساخت — مدار باز نمی‌شود
    throw new CloudVoiceError('rejected', 'درخواست صدا پذیرفته نشد.', response.status);
  }
  if (response.status === 504) {
    tripCircuit();
    throw new CloudVoiceError('timeout', 'پاسخ سرویس صدا به‌موقع نرسید.', 504);
  }
  if (!response.ok) {
    tripCircuit();
    throw new CloudVoiceError('server', 'سرویس صدا خطا داد.', response.status);
  }

  let blob: Blob;
  try {
    blob = await toBlob(response);
  } catch (error) {
    tripCircuit();
    if (error instanceof CloudVoiceError) throw error;
    throw new CloudVoiceError('invalid', 'پاسخ سرور صدای معتبری نبود.');
  }
  if (blob.size === 0) {
    tripCircuit();
    throw new CloudVoiceError('invalid', 'صدای دریافتی خالی بود.');
  }

  resetCircuit();
  writeCache(text, blob);
  return blob;
}
