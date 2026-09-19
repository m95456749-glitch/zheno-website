// ============================================================
// ZHINO — «تنظیمات صدای دستیار» (فاز ۹) — تنظیمات غیرمحرمانهٔ صدا
//
// ⚠️ قرارداد امنیتی:
//   این ماژول فقط تنظیمات غیرمحرمانه را نگه می‌دارد (روشن/خاموش بودن
//   صدا، نام صدای فارسی، سرعت خواندن). هیچ کلیدی — به‌ویژه کلید Azure —
//   اینجا، در localStorage یا در دیتابیس عمومی ذخیره نمی‌شود. کلید
//   Azure فقط در Supabase Edge Function Secrets می‌ماند و تابع
//   «zhino-voice» خودش تنظیمات عمومی را سمت سرور هم می‌خواند و
//   اعتبارسنجی هم می‌کند (دفاع در عمق).
//
// جای ذخیره:
//   • متصل (Supabase) → ردیف‌های published در جدول عمومی site_content
//     (همان جدول و RLS ویرایشگر محتوای سایت؛ خواندن برای همه آزاد و
//     نوشتن فقط برای نقش admin — بدون هیچ Migration یا تغییر دیتابیس).
//   • آفلاین/دمو → localStorage (مثل بقیهٔ تنظیمات پنل).
//   نبود ردیف‌ها = پیش‌فرض (روشن، Dilara، سرعت ۱) تا رفتار قبلی سایت
//   دست‌نخورده بماند.
// ============================================================

import { useMemo, useRef } from 'react';
import { createLocalStore, useLocalStore } from './localStore';
import {
  getRemoteSiteData,
  pushRemoteVoiceSettings,
  runRemoteSiteWrite,
  useRemoteSiteData,
  type RemoteSiteData,
} from './siteDataSync';
import { getSupabase } from './supabaseClient';

export const ASSISTANT_VOICE_DB_KEYS = {
  voiceEnabled: 'assistant_voice_enabled',
  autoVoice: 'assistant_voice_auto',
  cloudVoice: 'assistant_voice_cloud',
  voiceName: 'assistant_voice_name',
  rate: 'assistant_voice_rate',
  suggestions: 'assistant_suggestions',
  tone: 'assistant_tone',
} as const;

export type AssistantVoiceName = 'fa-IR-DilaraNeural' | 'fa-IR-FaridNeural';

/** صداهای فارسی قابل‌انتخاب در پنل — باز هم سمت سرور باید تأیید شود */
export const ASSISTANT_VOICE_OPTIONS: ReadonlyArray<{
  value: AssistantVoiceName;
  label: string;
}> = [
  { value: 'fa-IR-DilaraNeural', label: 'دیلارا (زن — پیش‌فرض)' },
  { value: 'fa-IR-FaridNeural', label: 'فرید (مرد)' },
];

export const VOICE_RATE_MIN = 0.7;
export const VOICE_RATE_MAX = 1.4;

export type AssistantTone = 'friendly' | 'formal';

/** لحن‌های قابل‌انتخاب برای پاسخ‌های مدل سرور — سرور هم فقط همین‌ها را می‌پذیرد */
export const ASSISTANT_TONE_OPTIONS: ReadonlyArray<{
  value: AssistantTone;
  label: string;
}> = [
  { value: 'friendly', label: 'خودمانی و گرم (پیش‌فرض)' },
  { value: 'formal', label: 'رسمی و محتاط' },
];

export interface AssistantVoiceSettings {
  /** کلید اصلی صدای ربات — خاموش = هیچ صدایی (ابری و مرورگر) وجود ندارد */
  voiceEnabled: boolean;
  /** خواندن خودکار پاسخ‌های جدید (بازدیدکننده می‌تواند برای خودش خاموش کند) */
  autoVoice: boolean;
  /** کلید اصلی صدای ابری — خاموش = همان رفتار قبلی با صدای مرورگر */
  cloudVoice: boolean;
  /** صدای فارسی (پیش‌فرض: دیلارا) */
  voiceName: AssistantVoiceName;
  /** سرعت خواندن (۱ = عادی) */
  rate: number;
  /** پیشنهادهای شروع گفت‌وگو در محیط چت */
  suggestions: boolean;
  /** لحن پاسخ‌گویی مدل سرور (پیش‌فرض: خودمانی) */
  tone: AssistantTone;
}

export const DEFAULT_ASSISTANT_VOICE: AssistantVoiceSettings = {
  voiceEnabled: true,
  autoVoice: true,
  cloudVoice: true,
  voiceName: 'fa-IR-DilaraNeural',
  rate: 1,
  suggestions: true,
  tone: 'friendly',
};

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const clamped = Math.min(VOICE_RATE_MAX, Math.max(VOICE_RATE_MIN, value));
  return Math.round(clamped * 100) / 100;
}

function asVoiceName(value: unknown): AssistantVoiceName {
  return value === 'fa-IR-FaridNeural' ? 'fa-IR-FaridNeural' : 'fa-IR-DilaraNeural';
}

/** بولی ذخیره‌شده به شکل '1'/'0'؛ نبود مقدار یعنی پیش‌فرض (روشن) */
function asOnFlag(value: unknown, fallback: boolean): boolean {
  if (value === true || value === '1') return true;
  if (value === false || value === '0') return false;
  return fallback;
}

function asTone(value: unknown): AssistantTone {
  return value === 'formal' ? 'formal' : 'friendly';
}

function sanitize(raw: unknown): AssistantVoiceSettings | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  return {
    voiceEnabled: asOnFlag(r.voiceEnabled, DEFAULT_ASSISTANT_VOICE.voiceEnabled),
    autoVoice: asOnFlag(r.autoVoice, DEFAULT_ASSISTANT_VOICE.autoVoice),
    cloudVoice: asOnFlag(r.cloudVoice, DEFAULT_ASSISTANT_VOICE.cloudVoice),
    voiceName: asVoiceName(r.voiceName),
    rate: clampRate(typeof r.rate === 'number' ? r.rate : 1),
    suggestions: asOnFlag(r.suggestions, DEFAULT_ASSISTANT_VOICE.suggestions),
    tone: asTone(r.tone),
  };
}

const store = createLocalStore<AssistantVoiceSettings>(
  'zhino_admin_voice_settings_v1',
  DEFAULT_ASSISTANT_VOICE,
  sanitize,
);

/**
 * آخرین ذخیرهٔ محلی مدیر (لحظهٔ ذخیره). تا وقتی اسنپ‌شات دیتابیس از این
 * لحظه تازه‌تر نشده، مقدارهای محلی به‌عنوان «پیش‌نمایش فوری» روی نمایش
 * ابری/اتصالی می‌نشینند — این همان وعدهٔ ذخیرهٔ مدیر است: تغییر باید
 * بی‌درنگ روی همین دستگاه دیده شود و بعد از رسیدن پاسخ دیتابیس، حقیقتِ
 * دیتابیس جایگزین می‌شود. اگر نوشتن روی دیتابیس شکست بخورد، اسنپ‌شاتِ
 * تازه‌شده قدیمی می‌ماند و نمای به‌همراه بنر خطای فارسی به حقیقت برمی‌گردد.
 */
let lastLocalWriteAt = 0;

function snapshotLoadedAtMs(remote: RemoteSiteData | null): number {
  const parsed = remote ? Date.parse(remote.loadedAt) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * ادغام تنظیمات: حالت محلی → همان ذخیرهٔ محلی؛ حالت متصل → ردیف‌های
 * دیتابیس، مگر اینکه (الف) ردیفی وجود نداشته باشد که مقدار محلیِ
 * دستگاه می‌آید، یا (ب) ذخیرهٔ محلی از آخرین اسنپ‌شات تازه‌تر باشد
 * (پیش‌نمایش فوری تا پاسخ دیتابیس).
 */
function mergeSettings(
  local: AssistantVoiceSettings,
  remote: RemoteSiteData | null,
): AssistantVoiceSettings {
  if (getSupabase() === null) return local;
  const rows = (remote?.content ?? {}) as unknown as Record<string, unknown>;
  const optimisticLocal = lastLocalWriteAt > snapshotLoadedAtMs(remote);
  const K = ASSISTANT_VOICE_DB_KEYS;
  const flag = (key: string, localValue: boolean): boolean =>
    optimisticLocal ? localValue : asOnFlag(rows[key], localValue);
  const text = (key: string, localValue: string): unknown =>
    optimisticLocal ? localValue : rows[key] ?? localValue;
  return {
    voiceEnabled: flag(K.voiceEnabled, local.voiceEnabled),
    autoVoice: flag(K.autoVoice, local.autoVoice),
    cloudVoice: flag(K.cloudVoice, local.cloudVoice),
    voiceName: asVoiceName(text(K.voiceName, local.voiceName)),
    rate: clampRate(Number(text(K.rate, String(local.rate)))),
    suggestions: flag(K.suggestions, local.suggestions),
    tone: asTone(text(K.tone, local.tone)),
  };
}

function sameSettings(a: AssistantVoiceSettings, b: AssistantVoiceSettings): boolean {
  return (
    a.voiceEnabled === b.voiceEnabled &&
    a.autoVoice === b.autoVoice &&
    a.cloudVoice === b.cloudVoice &&
    a.voiceName === b.voiceName &&
    a.rate === b.rate &&
    a.suggestions === b.suggestions &&
    a.tone === b.tone
  );
}

/** خواندن فعلی — اسنپ‌شات دیتابیس اگر هست، وگرنه پیش‌فرض + اورلی محلی */
export function getVoiceSettings(): AssistantVoiceSettings {
  return mergeSettings(store.get(), getRemoteSiteData());
}

function toRows(next: AssistantVoiceSettings): Record<string, string> {
  return {
    [ASSISTANT_VOICE_DB_KEYS.voiceEnabled]: next.voiceEnabled ? '1' : '0',
    [ASSISTANT_VOICE_DB_KEYS.autoVoice]: next.autoVoice ? '1' : '0',
    [ASSISTANT_VOICE_DB_KEYS.cloudVoice]: next.cloudVoice ? '1' : '0',
    [ASSISTANT_VOICE_DB_KEYS.voiceName]: next.voiceName,
    [ASSISTANT_VOICE_DB_KEYS.rate]: String(clampRate(next.rate)),
    [ASSISTANT_VOICE_DB_KEYS.suggestions]: next.suggestions ? '1' : '0',
    [ASSISTANT_VOICE_DB_KEYS.tone]: next.tone,
  };
}

/** ذخیره توسط مدیر — remote با همان RLS نقش admin؛ آفلاین روی همین دستگاه */
export function saveVoiceSettings(next: AssistantVoiceSettings): void {
  const clean: AssistantVoiceSettings = {
    voiceEnabled: next.voiceEnabled === true,
    autoVoice: next.autoVoice === true,
    cloudVoice: next.cloudVoice === true,
    voiceName: asVoiceName(next.voiceName),
    rate: clampRate(next.rate),
    suggestions: next.suggestions === true,
    tone: asTone(next.tone),
  };
  lastLocalWriteAt = Date.now();
  if (getSupabase()) {
    runRemoteSiteWrite('ذخیره تنظیمات صدای دستیار', () => pushRemoteVoiceSettings(toRows(clean)));
    // پیش‌نمایش فوری روی همین دستگاه تا پاسخ دیتابیس برسد
    store.set(clean);
    return;
  }
  store.set(clean);
}

export function resetVoiceSettings(): void {
  lastLocalWriteAt = Date.now();
  if (getSupabase()) {
    runRemoteSiteWrite('بازنشانی تنظیمات صدای دستیار', () =>
      pushRemoteVoiceSettings(toRows(DEFAULT_ASSISTANT_VOICE)),
    );
    store.set({ ...DEFAULT_ASSISTANT_VOICE });
    return;
  }
  store.reset();
}

/**
 * نمای reactive برای رابط کاربری — با ذخیرهٔ مدیر (local) یا رسیدن
 * اسنپ‌شات دیتابیس (remote) فوراً تازه می‌شود.
 *
 * ⚠️ قرارداد هویت: مرجع شیء برگشتی فقط وقتی عوض می‌شود که «مقدارها»
 * عوض شده باشند. ساختن شیء تازه در هر رندر (الگوی قبلی) باعث حلقهٔ
 * بی‌پایان رندر در صفحهٔ تنظیمات ربات می‌شد و عملاً هیچ کلیدی کار
 * نمی‌کرد — این هویت پایدار، تضمینِ کارکرد دکمه‌هاست.
 */
export function useVoiceSettings(): AssistantVoiceSettings {
  const local = useLocalStore(store);
  const remote = useRemoteSiteData();
  const merged = useMemo(() => mergeSettings(local, remote), [local, remote]);
  const prevRef = useRef<AssistantVoiceSettings | null>(null);
  if (prevRef.current === null || !sameSettings(prevRef.current, merged)) {
    prevRef.current = merged;
  }
  return prevRef.current;
}

/** آیا «خواندن خودکار» برای این بازدیدکننده اجازه دارد؟ (کلید مدیر) */
export function isAutoVoiceAllowed(): boolean {
  return getVoiceSettings().autoVoice;
}

/** آیا صدای ابری از نگاه تنظیمات مدیر فعال است؟ (بدون درخواست) */
export function isCloudVoiceEnabledByAdmin(): boolean {
  return getVoiceSettings().cloudVoice;
}
