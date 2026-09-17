// ============================================================
// ZHINO — «صدای فارسی دستیار ژینو» (فاز ۹) — Supabase Edge Function
//
// چرا این تابع وجود دارد؟
//   خواندن پاسخ با موتور صدای خودِ گوشی (Web Speech API) روی
//   بسیاری از دستگاه‌های اندروید شکست می‌خورد: Chrome Android
//   صدای فارسی ندارد و تا کاربر دستی «تبدیل متن به گفتار» فارسی
//   را نصب نکند، هیچ صدایی پخش نمی‌شود. این تابع آن وابستگی را
//   حذف می‌کند: متن را می‌گیرد، از سرویس ابری صدای فارسی می‌سازد
//   و فایل MP3 برمی‌گرداند تا مرورگر آن را مثل هر صوت دیگری پخش کند.
//
//   مرورگر ──POST {text}──►  این تابع (Deno)  ──►  Azure AI Speech
//     بدون هیچ کلید            AZURE_SPEECH_KEY اینجا     fa-IR-DilaraNeural
//     ◄──── audio/mpeg ────
//
// قرارداد امنیتی (همان قرارداد zhino-assistant):
//   • کلید سرویس فقط در Secrets سوپابیس است؛ هرگز در مرورگر،
//     در بستهٔ نهایی، در `VITE_*` یا در این مخزن نمی‌آید.
//   • پاسخ این تابع هرگز کلید یا متن خام خطای سرویس‌دهنده را
//     برنمی‌گرداند.
//   • فقط «متن پاسخ دستیار» خوانده می‌شود. هیچ دسترسی‌ای به
//     جدول‌ها، سفارش‌ها یا دادهٔ مشتری ندارد و هیچ SELECT نمی‌زند.
//   • متن ورودی پیش از رفتن به SSML کاملاً escape می‌شود، پس
//     نمی‌توان با تگ جعلی رفتار موتور صدا را عوض کرد.
//
// Secrets لازم (Supabase Dashboard → Edge Functions → Secrets،
// یا `supabase secrets set`):
//   AZURE_SPEECH_KEY    — کلید Speech (الزامی)
//   AZURE_SPEECH_REGION — ناحیهٔ منبع، مثل westeurope (الزامی)
//   AZURE_SPEECH_VOICE  — اختیاری؛ پیش‌فرض fa-IR-DilaraNeural
//   TTS_ALLOWED_ORIGINS — اختیاری؛ دامنه‌های مجاز، جدا‌شده با کاما
//
// استقرار:
//   supabase functions deploy zhino-voice
// ============================================================

/* ── پیکربندی (فقط از محیط سرور) ───────────────────────────── */

const AZURE_KEY = (Deno.env.get('AZURE_SPEECH_KEY') ?? '').trim();
const AZURE_REGION = (Deno.env.get('AZURE_SPEECH_REGION') ?? '').trim().toLowerCase();
/** صدای پیش‌فرض: «دلارا» — زن، فارسی ایران، لحن گرم و گفتگویی */
const AZURE_VOICE = (Deno.env.get('AZURE_SPEECH_VOICE') ?? 'fa-IR-DilaraNeural').trim();
const ALLOWED_ORIGINS = (
  Deno.env.get('TTS_ALLOWED_ORIGINS') ??
  Deno.env.get('ALLOWED_ORIGINS') ??
  '*'
).trim();

/** حداکثر طول متنی که خوانده می‌شود (کاراکتر) — پاسخ دستیار کوتاه است */
const MAX_TEXT_CHARS = 1200;
/** حداکثر حجم بدنهٔ درخواست (بایت) */
const MAX_BODY_BYTES = 8_000;
/** مهلت تماس با سرویس صدا (میلی‌ثانیه) */
const UPSTREAM_TIMEOUT_MS = 20_000;
/** مهلت بررسی فهرست صداها در سلامت‌سنجی (میلی‌ثانیه) */
const VOICE_LIST_TIMEOUT_MS = 8_000;
/** سرعت خواندن: کمی آرام‌تر از پیش‌فرض، مناسب گوش‌دادن روی موبایل */
const SPEAKING_RATE = '-4%';

/** سهمیهٔ ضدسوءاستفاده (per instance — سقف واقعی روی پلتفرم) */
const RATE_LIMIT_MAX = 40;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const hits = new Map<string, number[]>();

/** نتیجهٔ بررسی فهرست صداها چند دقیقه در حافظه می‌ماند (بدون هزینه) */
const VOICE_CHECK_TTL_MS = 10 * 60 * 1000;
let voiceCheck: { at: number; available: boolean } | null = null;

const configured = AZURE_KEY !== '' && AZURE_REGION !== '';

/* ── CORS ──────────────────────────────────────────────────── */

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get('origin') ?? '';
  if (ALLOWED_ORIGINS === '*') return '*';
  const list = ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean);
  if (origin && list.includes(origin)) return origin;
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

/* ── ضدسوءاستفاده ─────────────────────────────────────────── */

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
  if (hits.size > 500) {
    for (const [key, value] of hits) {
      if (value.every((time) => now - time >= RATE_LIMIT_WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
}

/* ── ساخت SSML امن ────────────────────────────────────────── */

/**
 * متن کاربر هرگز مستقیم داخل XML نمی‌رود. هر نویسهٔ معنادار XML
 * escape می‌شود، پس متن پاسخ نمی‌تواند تگ یا دستور تازه بسازد
 * (همان اصل «دادهٔ مرجع، نه دستور» که در zhino-assistant داریم).
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * پاک‌سازی متن پیش از خواندن:
 *   • نویسه‌های کنترلی حذف می‌شوند (در XML غیرمجازند)
 *   • بولت «•» به مکث طبیعی تبدیل می‌شود تا فهرست، یکنواخت خوانده نشود
 *   • خط‌های جدید به مکث جمله تبدیل می‌شوند
 */
function cleanForSpeech(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/[•▪◦]+/g, '، ')
    .replace(/([^\n.!?؟؛:])\s*\n+\s*/g, '$1. ')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** زبان صدا از نام آن خوانده می‌شود (مثلاً fa-IR-DilaraNeural → fa-IR) */
function localeOfVoice(voice: string): string {
  const match = /^([a-z]{2,3}-[A-Za-z]{2,4})-/.exec(voice);
  return match ? match[1] : 'fa-IR';
}

function buildSsml(text: string, voice: string): string {
  const locale = localeOfVoice(voice);
  return [
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">`,
    `<voice name="${escapeXml(voice)}">`,
    `<prosody rate="${SPEAKING_RATE}">${escapeXml(text)}</prosody>`,
    '</voice>',
    '</speak>',
  ].join('');
}

/* ── تماس با سرویس صدا ────────────────────────────────────── */

interface SynthResult {
  ok: boolean;
  status: number;
  audio?: ArrayBuffer;
  error?: string;
}

async function synthesize(text: string, voice: string): Promise<SynthResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_KEY,
          'Content-Type': 'application/ssml+xml',
          // MP3 ۲۴ کیلوهرتز: سبک برای موبایل، کیفیت کافی برای گفتار
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'zhino-voice',
        },
        body: buildSsml(text, voice),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      // متن خطای سرویس‌دهنده فقط در لاگ سرور می‌ماند، هرگز به مرورگر نمی‌رود
      const detail = await response.text().catch(() => '');
      return { ok: false, status: response.status, error: detail.slice(0, 300) };
    }

    const audio = await response.arrayBuffer();
    if (audio.byteLength === 0) return { ok: false, status: 502, error: 'empty audio' };
    return { ok: true, status: 200, audio };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { ok: false, status: aborted ? 504 : 502, error: aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * آیا صدای پیکربندی‌شده واقعاً در این ناحیه هست؟
 * فهرست صداها رایگان است و هیچ کاراکتری از سهمیه کم نمی‌کند، پس
 * سلامت‌سنجی می‌تواند صادقانه بگوید «آماده است» یا نه.
 */
async function voiceAvailable(): Promise<boolean> {
  if (!configured) return false;
  const now = Date.now();
  if (voiceCheck && now - voiceCheck.at < VOICE_CHECK_TTL_MS) return voiceCheck.available;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VOICE_LIST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
      {
        headers: { 'Ocp-Apim-Subscription-Key': AZURE_KEY, 'User-Agent': 'zhino-voice' },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      voiceCheck = { at: now, available: false };
      return false;
    }
    const list = (await response.json()) as { ShortName?: unknown }[];
    const available =
      Array.isArray(list) &&
      list.some((item) => typeof item?.ShortName === 'string' && item.ShortName === AZURE_VOICE);
    voiceCheck = { at: now, available };
    return available;
  } catch {
    voiceCheck = { at: now, available: false };
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/* ── handler ──────────────────────────────────────────────── */

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  // بررسی سلامت — فقط می‌گوید صدا آماده است یا نه و کدام صداست.
  // هیچ کلیدی، هیچ ناحیه‌ای و هیچ جزئیات داخلی برنمی‌گردد.
  if (request.method === 'GET') {
    const ready = configured ? await voiceAvailable() : false;
    return json(
      {
        ok: true,
        configured,
        ready,
        voice: configured ? AZURE_VOICE : null,
        locale: configured ? localeOfVoice(AZURE_VOICE) : null,
        format: 'audio/mpeg',
      },
      200,
      request,
    );
  }

  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed', message: 'فقط POST و GET پشتیبانی می‌شود.' }, 405, request);
  }

  if (ALLOWED_ORIGINS !== '*' && allowedOrigin(request) === null) {
    return json({ error: 'origin_not_allowed', message: 'این مبدأ اجازهٔ استفاده از صدا را ندارد.' }, 403, request);
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large', message: 'متن بیش از حد بزرگ است.' }, 413, request);
  }

  if (!configured) {
    // فرانت‌اند با این پاسخ بی‌صدا به صدای خود دستگاه برمی‌گردد
    return json(
      {
        error: 'not_configured',
        message: 'صدای ابری روی سرور پیکربندی نشده است (AZURE_SPEECH_KEY / AZURE_SPEECH_REGION).',
      },
      501,
      request,
    );
  }

  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return json(
      { error: 'rate_limited', message: 'تعداد درخواست‌های صدا زیاد بود؛ چند دقیقه بعد دوباره تلاش کنید.' },
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

  const text = typeof body.text === 'string' ? cleanForSpeech(body.text).slice(0, MAX_TEXT_CHARS) : '';
  if (text.length === 0) {
    return json({ error: 'empty_text', message: 'متنی برای خواندن نیست.' }, 400, request);
  }

  const result = await synthesize(text, AZURE_VOICE);

  if (!result.ok || !result.audio) {
    console.error('[zhino-voice] upstream failed:', result.status, result.error ?? '');
    // ۴۰۱/۴۰۳ از سرویس‌دهنده = کلید/ناحیهٔ نادرست. برای مرورگر همان
    // «در دسترس نیست» است؛ جزئیات فقط در لاگ سرور می‌ماند.
    const status = result.status === 429 ? 429 : 502;
    return json(
      {
        error: status === 429 ? 'rate_limited' : 'upstream_error',
        message: 'صدا در این لحظه ساخته نشد؛ لطفاً دوباره تلاش کنید.',
      },
      status,
      request,
    );
  }

  return new Response(result.audio, {
    status: 200,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(result.audio.byteLength),
      // پاسخ مخصوص همین متن است و هیچ دادهٔ شخصی ندارد؛ مرورگر
      // خودش نگه‌داری کوتاه‌مدت را در حافظه انجام می‌دهد.
      'Cache-Control': 'private, max-age=600',
      'X-Zhino-Voice': AZURE_VOICE,
    },
  });
});
