// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۵ و ۶) — لایهٔ اتصال به مدل هوش مصنوعی
//
// ⚠️ قرارداد امنیتی این فایل (مثل supabaseClient.ts):
//   در این فایل هیچ‌وقت کلید مدل هوش مصنوعی وجود ندارد و هیچ‌وقت
//   نخواهد داشت. مرورگر فقط به یکی از این دو مسیر حرف می‌زند:
//
//     ۱) Supabase Edge Function:  <project>/functions/v1/zhino-assistant
//        (کلید مدل در Secrets خود Supabase می‌ماند)
//     ۲) Backend خودمان:  VITE_ASSISTANT_API_URL
//        (کلید در متغیر محیطی سرور می‌ماند)
//
//   در هر دو حالت هدر Authorization فقط «کلید عمومی» پروژه است
//   (publishable/anon) — همان کلیدی که RLS آن را محدود می‌کند.
//
// اگر هیچ‌کدام پیکربندی نشده باشند (`null`)، دستیار به موتور محلی
// همان فروشگاه برمی‌گردد و هیچ درخواست شبکه‌ای زده نمی‌شود.
// ============================================================

import { getSupabasePublishableKey, getSupabaseUrl } from '../supabaseClient';
import type {
  AssistantContext,
  AssistantHistoryTurn,
  AssistantKnowledgeSource,
  AssistantLink,
  AssistantProbeResult,
  AssistantRemoteReply,
  AssistantSuggestion,
} from './types';
import { compactCatalogDigest } from './knowledge';

export interface AssistantRemoteConfig {
  /** آدرس کامل Endpoint دستیار */
  endpoint: string;
  /** supabase = Edge Function پروژه | api = Backend خودمان */
  mode: 'supabase' | 'api';
  /** کلید عمومی برای هدر Authorization (فقط در حالت supabase) */
  publicKey: string | null;
}

/**
 * مدت انتظار برای پاسخ مدل — بعد از آن، موتور محلی جواب می‌دهد.
 * (۱۲ ثانیه: کوتاه‌تر از این، پاسخ‌های بلند را قطع می‌کند و بلندتر از
 * این، کاربر را معطل نگه می‌دارد.)
 */
const REQUEST_TIMEOUT_MS = 12_000;
/** مدت انتظار برای بررسی سلامت Endpoint (فقط برای نمایش وضعیت اتصال) */
const PROBE_TIMEOUT_MS = 8_000;

/**
 * پیکربندی دستیار هوشمند — یا `null` اگر چیزی تنظیم نشده است.
 *
 *   VITE_ASSISTANT_API_URL   → Backend خودمان (اولویت اول)
 *   VITE_SUPABASE_URL + key  → Supabase Edge Function
 */
export function getAssistantRemoteConfig(): AssistantRemoteConfig | null {
  const explicit = (import.meta.env.VITE_ASSISTANT_API_URL ?? '').trim();
  if (explicit) {
    return { endpoint: explicit.replace(/\/+$/, ''), mode: 'api', publicKey: null };
  }

  const projectUrl = getSupabaseUrl().replace(/\/+$/, '');
  const publicKey = getSupabasePublishableKey();
  if (projectUrl && publicKey) {
    return {
      endpoint: `${projectUrl}/functions/v1/zhino-assistant`,
      mode: 'supabase',
      publicKey,
    };
  }

  return null;
}

/** آیا دستیار به مدل واقعی وصل است؟ (بدون هیچ درخواستی) */
export function isAssistantRemoteConfigured(): boolean {
  return getAssistantRemoteConfig() !== null;
}

export type AssistantRemoteErrorKind =
  /** Endpoint پیکربندی نشده */
  | 'unconfigured'
  /** پاسخ در زمان مقرر نرسید */
  | 'timeout'
  /** شبکه/سرور در دسترس نبود */
  | 'network'
  /** سهمیهٔ پرسش تمام شده (۴۲۹) */
  | 'rate-limited'
  /** درخواست نامعتبر بود (۴۰۰/۴۰۶/۴۲۲) */
  | 'rejected'
  /** سرور پاسخ خطا داد (۵xx) */
  | 'server'
  /** پاسخ سرور شکل معتبری نداشت */
  | 'invalid';

// توجه (فاز ۸): اینجا پیش‌تر یک پیام فارسی برای هر نوع خطا ساخته می‌شد
// (`assistantErrorNote`) تا در رابط کاربری نشان داده شود. آن متن‌ها حذف
// شدند، چون به مشتری نباید گفته شود اتصال مدل یا دیتابیس در کار است:
// خطا بی‌صدا به Fallback محلی می‌رسد و نوع خطا فقط برای شمارندهٔ داخلی
// و تصمیم Fallback نگه داشته می‌شود.

export class AssistantRemoteError extends Error {
  readonly kind: AssistantRemoteErrorKind;
  readonly status?: number;

  constructor(kind: AssistantRemoteErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'AssistantRemoteError';
    this.kind = kind;
    this.status = status;
  }
}

export interface AssistantRemoteRequest {
  message: string;
  history: AssistantHistoryTurn[];
  context: AssistantContext;
  signal?: AbortSignal;
}

function headersFor(config: AssistantRemoteConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.publicKey) {
    // کلید عمومی پروژه؛ سرور با آن هویت پروژه را می‌شناسد و
    // تصمیم دسترسی را policy ها می‌گیرند. هیچ کلید سری‌ای اینجا نیست.
    headers.Authorization = `Bearer ${config.publicKey}`;
    headers.apikey = config.publicKey;
  }
  return headers;
}

/** یک درخواست با مهلت مشخص؛ AbortSignal بیرونی هم رعایت می‌شود */
async function fetchWithTimeout(
  input: RequestInfo | URL,
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
      throw new AssistantRemoteError('timeout', 'پاسخ دستیار هوشمند در زمان مقرر نرسید.');
    }
    if (external?.aborted) {
      throw new AssistantRemoteError('network', 'درخواست لغو شد.');
    }
    throw new AssistantRemoteError(
      'network',
      error instanceof Error ? error.message : 'ارتباط با سرور دستیار برقرار نشد.',
    );
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', abortFromOutside);
  }
}

/* ── پاک‌سازی متن مدل (بدون وابستگی به هیچ کتابخانه‌ای) ────── */

/**
 * متن مدل را به همان سبک گفتگوی ژینو درمی‌آورد: بدون Markdown،
 * با بولت «•» و بدون تیتر `#`. اگر مدل انگلیسی نوشت، متن عوض
 * نمی‌شود؛ فقط قالب تمیز می‌شود.
 */
export function normalizeModelText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    // بدون look-behind (سازگاری با مرورگرهای قدیمی‌تر): هر ستارهٔ
    // باقی‌ماندهٔ Markdown حذف می‌شود، متن فارسی دست‌نخورده می‌ماند.
    .replace(/\*/g, '')
    .replace(/^\s*[-–—]\s+/gm, '• ')
    .replace(/```+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sanitizeLinks(raw: unknown): AssistantLink[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const links = raw
    .map((item) => item as { label?: unknown; to?: unknown })
    .filter((item) => typeof item?.label === 'string' && typeof item?.to === 'string')
    // فقط مسیرهای داخلی سایت — لینک بیرونی هرگز از این مسیر عبور نمی‌کند
    .filter((item) => (item.to as string).startsWith('/') && !(item.to as string).startsWith('//'))
    .map((item) => ({ label: (item.label as string).slice(0, 60), to: item.to as string }))
    .slice(0, 4);
  return links.length > 0 ? links : undefined;
}

function sanitizeSuggestions(raw: unknown): AssistantSuggestion[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .map((item) => item as { label?: unknown; prompt?: unknown })
    .filter((item) => typeof item?.label === 'string' && typeof item?.prompt === 'string')
    .map((item) => ({
      label: (item.label as string).slice(0, 40),
      prompt: (item.prompt as string).slice(0, 300),
    }))
    .slice(0, 5);
  return items.length > 0 ? items : undefined;
}

function readKnowledgeSource(raw: unknown): AssistantKnowledgeSource {
  return raw === 'database' || raw === 'client' || raw === 'none' ? raw : 'none';
}

/** آیا پاسخی که از سرور رسیده معتبر است؟ */
function parseRemoteReply(payload: unknown): AssistantRemoteReply {
  const data = payload as {
    reply?: unknown;
    links?: unknown;
    suggestions?: unknown;
    knowledge?: unknown;
  } | null;
  if (!data || typeof data.reply !== 'string') {
    throw new AssistantRemoteError('invalid', 'پاسخ سرور دستیار قابل خواندن نبود.');
  }
  const text = normalizeModelText(data.reply);
  if (text.length === 0) {
    throw new AssistantRemoteError('invalid', 'پاسخ سرور دستیار خالی بود.');
  }
  return {
    text: text.slice(0, 4000),
    links: sanitizeLinks(data.links),
    suggestions: sanitizeSuggestions(data.suggestions),
    knowledgeSource: readKnowledgeSource(data.knowledge),
  };
}

/** نگاشت کد وضعیت HTTP به نوع خطای دستیار */
function kindForStatus(status: number): AssistantRemoteErrorKind {
  if (status === 429) return 'rate-limited';
  if (status === 400 || status === 406 || status === 413 || status === 422) return 'rejected';
  if (status >= 500) return 'server';
  return 'server';
}

/* ── API عمومی این ماژول ───────────────────────────────────── */

/**
 * پرسش از مدل هوش مصنوعی از طریق Backend/Edge Function.
 * - هیچ کلید مدلی در مرورگر نیست.
 * - کاتالوگ واقعی فروشگاه (قیمت/موجودی) همراه پرسش می‌رود تا مدل
 *   مجبور باشد از دادهٔ واقعی حرف بزند، نه از حافظهٔ خودش.
 */
export async function askRemoteAssistant({
  message,
  history,
  context,
  signal,
}: AssistantRemoteRequest): Promise<AssistantRemoteReply> {
  const config = getAssistantRemoteConfig();
  if (!config) {
    throw new AssistantRemoteError('unconfigured', 'دستیار هوشمند روی سرور پیکربندی نشده است.');
  }

  const response = await fetchWithTimeout(
    config.endpoint,
    {
      method: 'POST',
      headers: headersFor(config),
      body: JSON.stringify({
        message: message.slice(0, 600),
        history: history.slice(-8),
        // دادهٔ عمومی فروشگاه (همان چیزی که در صفحه‌ها دیده می‌شود)
        catalog: compactCatalogDigest(context),
        locale: 'fa-IR',
        // منبع این کاتالوگ: سرور می‌تواند به‌جای آن، خودش دیتابیس را بخواند
        catalogSource: context.dataSource,
      }),
    },
    REQUEST_TIMEOUT_MS,
    signal,
  );

  if (!response.ok) {
    let detail = '';
    let code = '';
    try {
      const payload = (await response.json()) as { error?: unknown; message?: unknown };
      detail = typeof payload.message === 'string' ? payload.message : '';
      code = typeof payload.error === 'string' ? payload.error : '';
    } catch {
      // پاسخ خطا JSON نبود؛ همان پیام پیش‌فرض کافی است
    }
    if (code === 'not_configured') {
      throw new AssistantRemoteError('unconfigured', detail || 'دستیار هوشمند روی سرور پیکربندی نشده است.', response.status);
    }
    throw new AssistantRemoteError(
      kindForStatus(response.status),
      detail || 'سرور دستیار پاسخ خطا داد.',
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AssistantRemoteError('invalid', 'پاسخ سرور دستیار قابل خواندن نبود.');
  }
  return parseRemoteReply(payload);
}

/**
 * بررسی سریع آماده‌بودن Endpoint (فقط برای نمایش وضعیت اتصال در UI).
 * هرگز خطا پرتاب نمی‌کند: نبودِ پاسخ یعنی «آفلاین».
 *
 * سرور در پاسخ GET می‌گوید مدل آماده است یا نه و آیا خودش توانسته
 * دیتابیس فروشگاه را بخواند؛ این دو، متن یادداشت وضعیت را در UI
 * تعیین می‌کنند (بدون هیچ کلیدی و بدون افشای جزئیات داخلی).
 */
export async function probeAssistantRemote(signal?: AbortSignal): Promise<AssistantProbeResult> {
  const offline: AssistantProbeResult = { online: false, database: false, model: null };
  const config = getAssistantRemoteConfig();
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
      database?: unknown;
      model?: unknown;
    };
    return {
      online: payload?.configured === true,
      database: payload?.database === true,
      model: typeof payload?.model === 'string' && payload.model.length > 0 ? payload.model : null,
    };
  } catch {
    return offline;
  }
}
