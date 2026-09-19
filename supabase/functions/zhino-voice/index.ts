// ============================================================
// ZHINO — «صدای ابری فارسی دستیار ژینو» (فاز ۹) — Supabase Edge Function
//
// وضعیت فعلی: این تابع عمداً dormant است؛ مسیر کاربر فقط SpeechSynthesis
// مرورگر را اجرا می‌کند و این تابع هیچ‌وقت از هوک صدای فروشگاه صدا زده نمی‌شود.
// قرارداد هر دو provider برای بازگردانی احتمالی در همین فایل حفظ شده است.
//
// این تابع، «پروکسی امن» بین فروشگاه و سرویس TTS است:
//
//   مرورگر  ──►  این تابع (Deno)  ──►  سرویس TTS
//                 کلید سرویس اینجا در
//                 Secrets سوپابیس می‌ماند
//
//   مرورگر متنِ «پاسخ دستیار» را می‌فرستد و فایل صوتی MP3 می‌گیرد.
//   هیچ کلیدی هیچ‌وقت در فرانت‌اند، در این مخزن، در پاسخ یا در لاگ
//   قرار نمی‌گیرد.
//
// ── سرویس‌های پشتیبانی‌شده (VOICE_PROVIDER) ──────────────────
//   openai (پیش‌فرضِ خودکار)  — OpenAI «gpt-4o-mini-tts»
//   azure                    — Azure AI Speech (fa-IR-DilaraNeural)
//   (خالی/auto)              — اول OpenAI اگر کلیدش باشد، وگرنه Azure
//
//   قرارداد HTTP تابع برای هر دو سرویس دقیقاً یکی است (POST متن →
//   audio/mpeg، GET سلامت، همان کدهای خطا)؛ بنابراین فرانت‌اند، UI و
//   منطق دستیار هیچ نیازی به تغییر ندارند. جابه‌جایی بین دو سرویس فقط
//   با Secrets انجام می‌شود.
//
// حریم خصوصی:
//   فقط متن «پاسخ دستیار» به این تابع می‌رسد — هرگز پرسش کاربر،
//   نام، نشانی یا سبد خرید. متن برای ساخت صدا به سرویس TTS می‌رود و
//   این تابع چیزی را ذخیره یا لاگ نمی‌کند.
//
// Secrets لازم (Supabase Dashboard → Project Settings → Edge
// Functions → Secrets، یا `supabase secrets set`):
//
//   انتخاب سرویس:
//   VOICE_PROVIDER      — اختیاری؛ `openai` یا `azure` (خالی = خودکار)
//
//   مسیر OpenAI:
//   TTS_API_KEY         — کلید OpenAI (الزامی برای این مسیر). اگر
//                         تنظیم نشود، `OPENAI_API_KEY` و سپس `AI_API_KEY`
//                         (همان کلید دستیار) خوانده می‌شود.
//   TTS_API_URL         — اختیاری؛ پیش‌فرض:
//                         https://api.openai.com/v1/audio/speech
//   TTS_MODEL           — اختیاری؛ پیش‌فرض: gpt-4o-mini-tts
//   TTS_VOICE_FEMALE    — اختیاری؛ پیش‌فرض: coral (برای «دیلارا»)
//   TTS_VOICE_MALE      — اختیاری؛ پیش‌فرض: onyx (برای «فرید»)
//   TTS_OUTPUT_FORMAT   — اختیاری؛ پیش‌فرض: mp3
//
//   مسیر Azure:
//   AZURE_SPEECH_KEY      — کلید سرویس Speech (هرگز در فرانت‌اند نیست)
//   AZURE_SPEECH_REGION   — ناحیهٔ سرویس، مثل eastus (مگر با Endpoint سفارشی)
//   AZURE_SPEECH_ENDPOINT — اختیاری؛ Endpoint سفارشی کامل (با https و بدون / آخر)
//   AZURE_SPEECH_VOICE    — اختیاری؛ پیش‌فرض: fa-IR-DilaraNeural
//
//   مشترک:
//   ALLOWED_ORIGINS       — اختیاری؛ دامنه‌های مجاز، جدا‌شده با کاما (پیش‌فرض *)
//
// استقرار:
//   supabase functions deploy zhino-voice
// ============================================================

/** سرویس‌های پشتیبانی‌شده — نام‌ها با مقدار `VOICE_PROVIDER` یکی است */
type Provider = 'azure' | 'openai';

/** انتخاب صریح سرویس؛ خالی یعنی «خودکار» */
const VOICE_PROVIDER = (Deno.env.get('VOICE_PROVIDER') ?? '').trim().toLowerCase();

/* ── مسیر Azure AI Speech ───────────────────────────────────── */
const AZURE_SPEECH_KEY = (Deno.env.get('AZURE_SPEECH_KEY') ?? '').trim();
const AZURE_SPEECH_REGION = (Deno.env.get('AZURE_SPEECH_REGION') ?? '').trim();
const AZURE_SPEECH_ENDPOINT = (Deno.env.get('AZURE_SPEECH_ENDPOINT') ?? '').trim().replace(/\/+$/, '');
const VOICE_NAME = (Deno.env.get('AZURE_SPEECH_VOICE') ?? 'fa-IR-DilaraNeural').trim() || 'fa-IR-DilaraNeural';

/* ── مسیر OpenAI (gpt-4o-mini-tts) ──────────────────────────── */
// ترتیب خواندن کلید، دقیقاً مثل تابع «zhino-assistant»: اول کلید مخصوص
// صدا، بعد کلید OpenAI و در آخر همان کلید مدل دستیار — تا در صورت
// امکان یک کلید برای هر دو کافی باشد.
const OPENAI_TTS_KEY = (
  Deno.env.get('TTS_API_KEY') ?? Deno.env.get('OPENAI_API_KEY') ?? Deno.env.get('AI_API_KEY') ?? ''
).trim();
const OPENAI_TTS_URL = (
  Deno.env.get('TTS_API_URL') ?? 'https://api.openai.com/v1/audio/speech'
).trim().replace(/\/+$/, '');
const OPENAI_TTS_MODEL = (Deno.env.get('TTS_MODEL') ?? 'gpt-4o-mini-tts').trim() || 'gpt-4o-mini-tts';
/** صداهای OpenAI برای دو گزینهٔ فارسی پنل (شناسه‌های داخلی بدون تغییر می‌مانند) */
const OPENAI_VOICE_FEMALE = (Deno.env.get('TTS_VOICE_FEMALE') ?? 'coral').trim() || 'coral';
const OPENAI_VOICE_MALE = (Deno.env.get('TTS_VOICE_MALE') ?? 'onyx').trim() || 'onyx';
const OPENAI_OUTPUT_FORMAT = (Deno.env.get('TTS_OUTPUT_FORMAT') ?? 'mp3').trim() || 'mp3';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').trim();
/** آدرس پروژه و کلید عمومی — برای خواندن تنظیمات عمومی صدا (تحت همان RLS بازدیدکننده) */
const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();

/** بیشینهٔ طول متنی که به تبدیل صدا می‌رود (محافظ سهمیهٔ سرویس) */
const MAX_TEXT_CHARS = 2000;
/** بیشینهٔ حجم بدنهٔ درخواست (بایت) */
const MAX_BODY_BYTES = 8_000;
/** مهلت تماس با سرویس TTS (میلی‌ثانیه) — قابل‌تنظیم فقط برای تست‌های خودکار */
const UPSTREAM_TIMEOUT_MS = Math.max(
  1_000,
  Number(Deno.env.get('VOICE_UPSTREAM_TIMEOUT_MS') ?? '') || 20_000,
);

/** سهمیهٔ سادهٔ ضدسوءاستفاده (per instance — سقف واقعی روی پلتفرم) */
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const hits = new Map<string, number[]>();

/** فرمت خروجی مسیر Azure: MP3 سبک و کم‌حجم — مناسب موبایل و پشتیبانی‌شده در <audio> */
const OUTPUT_FORMAT = 'audio-16khz-32kbitrate-mono-mp3';

/** مهلت خواندن تنظیمات صدا از دیتابیس (میلی‌ثانیه) */
const DB_TIMEOUT_MS = 6_000;

/**
 * صداهای فارسیِ مجاز — فقط این‌ها پذیرفته می‌شوند، هر مقدار دیگری در
 * دیتابیس (به هر دلیلی) به پیش‌فرض امن برمی‌گردد. این دو مقدار
 * «شناسهٔ داخلی» محصول‌اند (همان دو گزینهٔ پنل مدیریت) و هیچ‌وقت به
 * مرورگر وابسته نیستند: مسیر Azure مستقیماً همین‌ها را به SSML می‌دهد
 * و مسیر OpenAI آن‌ها را به صداهای خودش نگاشت می‌کند.
 * صدای پیش‌فرض محصول: fa-IR-DilaraNeural (زن).
 */
const ALLOWED_FA_VOICES = ['fa-IR-DilaraNeural', 'fa-IR-FaridNeural'] as const;
/** بازهٔ مجاز سرعت خواندن (۱ = عادی) — دفاع در عمق حتی روی تنظیمات مدیر */
const RATE_MIN = 0.7;
const RATE_MAX = 1.4;

/** تنظیمات مؤثر صدا — غیرمحرمانه، قابل‌خواندن برای بازدیدکننده هم هست */
interface SiteVoiceConfig {
  /** کلید اصلی مدیر: صدای ابری فعال باشد یا نه */
  enabled: boolean;
  /** نام صدای فارسی (بعد از اعتبارسنجی) — شناسهٔ داخلی */
  voice: string;
  /** درصد نسبی سرعت برای سرویس TTS (۰ یعنی سرعت عادی) */
  ratePercent: number;
  /** منبع مقدار — برای شفافیت در پاسخ GET */
  source: 'database' | 'default';
}

function defaultVoiceConfig(): SiteVoiceConfig {
  const voice = (ALLOWED_FA_VOICES as readonly string[]).includes(VOICE_NAME)
    ? VOICE_NAME
    : 'fa-IR-DilaraNeural';
  return { enabled: true, voice, ratePercent: 0, source: 'default' };
}

/**
 * خواندن «تنظیمات صدای دستیار» از همان جدول عمومی site_content.
 * دقیقاً همان مجوزی که RLS به یک بازدیدکنندهٔ فروشگاه می‌دهد (فقط
 * ردیف‌های published)؛ هیچ service_role و هیچ دادهٔ محرمانه‌ای. اگر
 * خواندن ممکن نشد (پروژه‌ای تنظیم نباشد، شبکه قطع باشد یا دیتابیس خطا
 * بدهد)، پیش‌فرض‌های امنِ بالا برگردانده می‌شوند تا سرویس نخوابد.
 */
async function readSiteVoiceConfig(): Promise<SiteVoiceConfig> {
  const fallback = defaultVoiceConfig();
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return fallback;

  const keys = [
    'assistant_voice_enabled',
    'assistant_voice_cloud',
    'assistant_voice_name',
    'assistant_voice_rate',
  ];
  const filter = keys.map((key) => `"${key}"`).join(',');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DB_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/site_content?select=key,value&key=in.(${filter})`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) return fallback;
    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows)) return fallback;

    const values = new Map<string, string>();
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      if (typeof r?.key === 'string' && typeof r?.value === 'string') values.set(r.key, r.value);
    }
    if (values.size === 0) return fallback;

    // کلیدهای اصلی: فقط رشتهٔ صریح '0' یعنی خاموش؛ هر چیز دیگر (از جمله
    // نبود ردیف) یعنی روشن — تا وقتی مدیر چیزی ننوشته رفتار قبلی حفظ
    // می‌شود. هر دو کلید باید روشن باشند: کلید کلی صدای ربات + کلید ابری.
    const enabled =
      values.get('assistant_voice_enabled') !== '0' &&
      values.get('assistant_voice_cloud') !== '0';

    const rawVoice = (values.get('assistant_voice_name') ?? '').trim();
    const voice = (ALLOWED_FA_VOICES as readonly string[]).includes(rawVoice)
      ? rawVoice
      : fallback.voice;

    const rawRate = Number(values.get('assistant_voice_rate') ?? '');
    const clamped = Number.isFinite(rawRate)
      ? Math.min(RATE_MAX, Math.max(RATE_MIN, rawRate))
      : 1;
    const ratePercent = Math.round((clamped - 1) * 100);

    return { enabled, voice, ratePercent, source: 'database' };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

/* ── انتخاب سرویس ───────────────────────────────────────────── */

function azureConfigured(): boolean {
  return AZURE_SPEECH_KEY !== '' && (AZURE_SPEECH_REGION !== '' || AZURE_SPEECH_ENDPOINT !== '');
}

function openaiConfigured(): boolean {
  return OPENAI_TTS_KEY !== '' && OPENAI_TTS_URL !== '';
}

/**
 * سرویس مؤثر این درخواست. انتخاب صریح مدیر (`VOICE_PROVIDER`) اولویت
 * دارد؛ در حالت خودکار اول OpenAI انتخاب می‌شود و اگر کلیدش نبود Azure.
 * هیچ fallback زمان‌اجرا بین دو سرویس وجود ندارد (جلوگیری از هزینهٔ
 * دو‌باره)؛ جایگزین واقعی خطا، صدای خود مرورگر در فرانت‌اند است.
 */
function resolveProvider(): Provider | null {
  if (VOICE_PROVIDER === 'azure' || VOICE_PROVIDER === 'openai') return VOICE_PROVIDER;
  if (openaiConfigured()) return 'openai';
  if (azureConfigured()) return 'azure';
  return null;
}

/**
 * آیا سرویس انتخاب‌شده واقعاً کلید/آدرس لازم را دارد؟ انتخاب صریح یک
 * سرویسِ پیکربندی‌نشده هرگز به تماس بی‌کلید با upstream منجر نمی‌شود —
 * تابع صادقانه `not_configured` می‌دهد تا فرانت‌اند به صدای مرورگر برود.
 */
function providerConfigured(provider: Provider | null): boolean {
  if (provider === 'azure') return azureConfigured();
  if (provider === 'openai') return openaiConfigured();
  return false;
}

function azureTtsUrl(): string {
  if (AZURE_SPEECH_ENDPOINT !== '') return AZURE_SPEECH_ENDPOINT;
  return `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
}

/* ── CORS ──────────────────────────────────────────────────── */

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get('origin') ?? '';
  if (ALLOWED_ORIGINS === '*') return '*';
  const list = ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean);
  if (origin && list.includes(origin)) return origin;
  // بدون Origin (curl/سرور) یا مبدأ ناشناس: هیچ هدر CORS داده نمی‌شود
  return null;
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = allowedOrigin(request);
  if (!origin) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/* ── ضدسوءاستفاده ───────────────────────────────────────── */

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0]?.trim() || request.headers.get('cf-connecting-ip') || 'unknown';
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  // نگه‌داشتن حافظه کوچک
  if (hits.size > 500) {
    for (const [key, value] of hits) {
      if (value.every((time) => now - time >= RATE_LIMIT_WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
}

/* ── ساخت SSML امن برای مسیر Azure (متن کاملاً فرار داده می‌شود) ── */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSsml(text: string, voice: string, ratePercent: number): string {
  const rate = ratePercent === 0 ? '' : `<prosody rate="${ratePercent > 0 ? '+' : ''}${ratePercent}%">`;
  const rateClose = ratePercent === 0 ? '' : '</prosody>';
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fa-IR">` +
    `<voice xml:lang="fa-IR" name="${escapeXml(voice)}">${rate}${escapeXml(text)}${rateClose}</voice>` +
    `</speak>`
  );
}

/* ── نگاشت تنظیمات داخلی به مسیر OpenAI ─────────────────────── */

/** شناسهٔ داخلی پنل → صدای OpenAI (دیلارا = زن، فرید = مرد) */
function openaiVoice(internalVoice: string): string {
  return internalVoice === 'fa-IR-FaridNeural' ? OPENAI_VOICE_MALE : OPENAI_VOICE_FEMALE;
}

/**
 * مسیر OpenAI (gpt-4o-mini-tts) SSML ندارد؛ زبان، لحن و سرعت با
 * `instructions` کنترل می‌شود (در مستند رسمی: Accent / Speed of speech /
 * Tone). ضریب سرعت دقیقاً از همان درصد تنظیمات مدیر ساخته می‌شود، پس
 * بازهٔ ۰٫۷ تا ۱٫۴ پنل مدیریت بدون تغییر کار می‌کند.
 */
function openaiInstructions(ratePercent: number): string {
  const factor = Math.round((1 + ratePercent / 100) * 100) / 100;
  return (
    `Speak in Persian (Iran) with a warm, natural, friendly tone ` +
    `at ${factor.toFixed(2)} times the normal speaking speed. ` +
    `Read the text exactly as written, in Persian, and never translate it.`
  );
}

/* ── نتیجهٔ تماس با سرویس TTS ───────────────────────────────── */

type UpstreamResult =
  | { ok: true; audio: ArrayBuffer }
  | {
      ok: false;
      kind: 'timeout' | 'network' | 'quota' | 'auth' | 'invalid' | 'upstream';
      status?: number;
      /** علت کوتاه و غیرمحرمانهٔ سمت سرویس TTS (برای تشخیص سریع) */
      upstream?: string;
    };

/**
 * فقط دو فیلد کوتاه و غیرحساس از خطای سرویس TTS بیرون کشیده می‌شود
 * (`type` و `code`) — تا علت واقعی (مثلاً `insufficient_quota` یعنی
 * نبود اعتبار/روش پرداخت، در برابر `rate_limit_exceeded`) بدون خواندن
 * لاگ سرور معلوم باشد. کلید هیچ‌وقت در بدنهٔ خطای سرویس نیست و اینجا
 * هم بدنهٔ خام برگردانده نمی‌شود.
 */
async function upstreamErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const text = (await response.text()).slice(0, 500);
    const parsed = JSON.parse(text) as {
      error?: { type?: unknown; code?: unknown; message?: unknown };
    };
    const type = typeof parsed?.error?.type === 'string' ? parsed.error.type.slice(0, 60) : '';
    const code = typeof parsed?.error?.code === 'string' ? parsed.error.code.slice(0, 60) : '';
    const parts = [type, code].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    if (parts.length > 0) return parts.join('/');
    const message = typeof parsed?.error?.message === 'string' ? parsed.error.message.slice(0, 160) : '';
    return message === '' ? undefined : message;
  } catch {
    return undefined;
  }
}

/** بررسی مشترک پاسخ سرویس TTS — برای هر دو مسیر یکسان است */
async function toAudioResult(response: Response): Promise<UpstreamResult> {
  try {
    if (response.status === 429) {
      return { ok: false, kind: 'quota', status: 429, upstream: await upstreamErrorDetail(response) };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        kind: 'auth',
        status: response.status,
        upstream: await upstreamErrorDetail(response),
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        kind: 'upstream',
        status: response.status,
        upstream: await upstreamErrorDetail(response),
      };
    }

    const contentType = (response.headers.get('Content-Type') ?? '').toLowerCase();
    if (!contentType.startsWith('audio/')) {
      return { ok: false, kind: 'invalid', status: response.status };
    }
    const audio = await response.arrayBuffer();
    if (audio.byteLength === 0) return { ok: false, kind: 'invalid', status: response.status };
    return { ok: true, audio };
  } catch {
    return { ok: false, kind: 'network' };
  }
}

/** یک تماس شبکه با مهلت و نگاشت خطای یکسان؛ کلید فقط در هدر می‌رود */
async function timedFetch(
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
): Promise<Response | { error: 'timeout' | 'network' }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    // AbortError = مهلت؛ بقیه = قطعی شبکه
    if ((error as Error)?.name === 'AbortError') return { error: 'timeout' };
    return { error: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

async function callAzure(text: string, voice: string, ratePercent: number): Promise<UpstreamResult> {
  const response = await timedFetch(azureTtsUrl(), {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
      'User-Agent': 'ZHINO-store',
    },
    body: buildSsml(text, voice, ratePercent),
  });
  if ('error' in response) return { ok: false, kind: response.error };
  return await toAudioResult(response);
}

async function callOpenAi(text: string, voice: string, ratePercent: number): Promise<UpstreamResult> {
  const response = await timedFetch(OPENAI_TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_TTS_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'ZHINO-store',
    },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      voice,
      input: text,
      response_format: OPENAI_OUTPUT_FORMAT,
      instructions: openaiInstructions(ratePercent),
    }),
  });
  if ('error' in response) return { ok: false, kind: response.error };
  return await toAudioResult(response);
}

/** نقطهٔ واحد ساخت صدا — هندلر فقط همین را می‌بیند */
async function synthesize(
  provider: Provider,
  text: string,
  site: SiteVoiceConfig,
): Promise<UpstreamResult> {
  if (provider === 'openai') return callOpenAi(text, openaiVoice(site.voice), site.ratePercent);
  return callAzure(text, site.voice, site.ratePercent);
}

/* ── هندلر اصلی ────────────────────────────────────────────── */

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const provider = resolveProvider();
  const configured = providerConfigured(provider);

  // بررسی سلامت — فقط آماده‌بودن سرویس و نام صدا (و کلید اصلی مدیر)؛
  // هیچ کلیدی برنمی‌گردد. برای نمایش «وضعیت اتصال» در پنل مدیریت.
  if (request.method === 'GET') {
    const site = await readSiteVoiceConfig();
    return json(
      {
        ok: true,
        configured,
        provider: provider ?? null,
        voice: configured ? site.voice : null,
        enabled: site.enabled,
        settings: site.source,
      },
      200,
      request,
    );
  }

  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed', message: 'فقط POST و GET پشتیبانی می‌شود.' }, 405, request);
  }

  if (ALLOWED_ORIGINS !== '*' && allowedOrigin(request) === null) {
    return json({ error: 'origin_not_allowed', message: 'این مبدأ اجازهٔ استفاده از سرویس صدا را ندارد.' }, 403, request);
  }

  // ورودی سنگین پیش از خواندن بدنه رد می‌شود
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large', message: 'درخواست بیش از حد بزرگ است.' }, 413, request);
  }

  if (!configured || provider === null) {
    // فرانت‌اند با این پاسخ به صدای خود مرورگر برمی‌گردد
    return json(
      {
        error: 'not_configured',
        message:
          'صدای ابری روی سرور پیکربندی نشده است (VOICE_PROVIDER و کلید سرویس TTS لازم است: TTS_API_KEY یا AZURE_SPEECH_KEY).',
      },
      501,
      request,
    );
  }

  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return json(
      { error: 'rate_limited', message: 'تعداد درخواست‌های صدا زیاد بود؛ لطفاً چند دقیقه بعد دوباره تلاش کنید.' },
      429,
      request,
    );
  }

  let body: { text?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'invalid_json', message: 'درخواست نامعتبر است.' }, 400, request);
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length === 0) {
    return json({ error: 'empty_text', message: 'متن برای خواندن خالی است.' }, 400, request);
  }
  if (text.length > MAX_TEXT_CHARS) {
    return json(
      { error: 'text_too_long', message: 'متن برای خواندن ابری بیش از حد طولانی است.' },
      400,
      request,
    );
  }

  // «تنظیمات صدای دستیار» مدیر — غیرمحرمانه، از همان دیتابیس عمومی
  const site = await readSiteVoiceConfig();
  if (!site.enabled) {
    // فرانت‌اند با این پاسخ بی‌صدا به صدای مرورگر برمی‌گردد
    return json(
      { error: 'voice_disabled', message: 'صدای ابری از پنل مدیریت غیرفعال شده است.' },
      403,
      request,
    );
  }

  const result = await synthesize(provider, text, site);
  if (!result.ok) {
    // در لاگ فقط نام سرویس، کد وضعیت و علت کوتاه سمت سرویس می‌ماند —
    // نه کلید، نه متن کاربر، نه بدنهٔ خام پاسخ.
    console.error(
      '[zhino-voice] upstream failed:',
      provider,
      result.kind,
      result.status ?? '',
      result.upstream ?? '',
    );
    // `upstream` علت سمت سرویس TTS است (مثلاً `insufficient_quota` یعنی
    // اعتبار/روش پرداخت حساب کامل نیست) — بدون آن، 429 و 502 برای مدیر
    // قابل تفکیک نیستند. کلید هیچ‌وقت در آن نیست.
    const upstream = result.upstream ?? null;
    switch (result.kind) {
      case 'timeout':
        return json(
          { error: 'upstream_timeout', message: 'پاسخ سرویس صدا به‌موقع نرسید.', upstream },
          504,
          request,
        );
      case 'quota':
        return json(
          { error: 'quota_exceeded', message: 'سهمیهٔ سرویس صدا پر شده است.', upstream },
          429,
          request,
        );
      case 'auth':
        return json(
          { error: 'upstream_auth', message: 'اعتبار سرویس صدا تأیید نشد.', upstream },
          502,
          request,
        );
      case 'invalid':
        return json(
          { error: 'invalid_upstream_audio', message: 'پاسخ سرویس صدا معتبر نبود.', upstream },
          502,
          request,
        );
      default:
        return json(
          { error: 'upstream_error', message: 'سرویس صدا در این لحظه پاسخ نداد.', upstream },
          502,
          request,
        );
    }
  }

  return new Response(result.audio, {
    status: 200,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  });
});
