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

import { createLocalStore, useLocalStore } from './localStore';
import {
  getRemoteSiteData,
  pushRemoteVoiceSettings,
  runRemoteSiteWrite,
  useRemoteSiteData,
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

/** ردیف‌های عمومی site_content از اسنپ‌شات دیتابیس (اگر بارگذاری شده باشد) */
function remoteRows(): Record<string, unknown> {
  const remote = getRemoteSiteData();
  if (!remote) return {};
  return (remote.content ?? {}) as unknown as Record<string, unknown>;
}

/** خواندن فعلی — اسنپ‌شات دیتابیس اگر هست، وگرنه پیش‌فرض + اورلی محلی */
export function getVoiceSettings(): AssistantVoiceSettings {
  const local = store.get();
  const rows = remoteRows();
  const hasRemote = getSupabase() !== null;
  return {
    voiceEnabled: hasRemote
      ? asOnFlag(rows[ASSISTANT_VOICE_DB_KEYS.voiceEnabled], DEFAULT_ASSISTANT_VOICE.voiceEnabled)
      : local.voiceEnabled,
    autoVoice: hasRemote
      ? asOnFlag(rows[ASSISTANT_VOICE_DB_KEYS.autoVoice], DEFAULT_ASSISTANT_VOICE.autoVoice)
      : local.autoVoice,
    cloudVoice: hasRemote
      ? asOnFlag(rows[ASSISTANT_VOICE_DB_KEYS.cloudVoice], DEFAULT_ASSISTANT_VOICE.cloudVoice)
      : local.cloudVoice,
    voiceName: hasRemote
      ? asVoiceName(rows[ASSISTANT_VOICE_DB_KEYS.voiceName] ?? local.voiceName)
      : local.voiceName,
    rate: hasRemote
      ? clampRate(Number(rows[ASSISTANT_VOICE_DB_KEYS.rate] ?? local.rate))
      : local.rate,
    suggestions: hasRemote
      ? asOnFlag(rows[ASSISTANT_VOICE_DB_KEYS.suggestions], DEFAULT_ASSISTANT_VOICE.suggestions)
      : local.suggestions,
    tone: hasRemote
      ? asTone(rows[ASSISTANT_VOICE_DB_KEYS.tone] ?? local.tone)
      : local.tone,
  };
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
  if (getSupabase()) {
    runRemoteSiteWrite('ذخیره تنظیمات صدای دستیار', () => pushRemoteVoiceSettings(toRows(clean)));
    // پیش‌نمایش فوری روی همین دستگاه تا پاسخ دیتابیس برسد
    store.set(clean);
    return;
  }
  store.set(clean);
}

export function resetVoiceSettings(): void {
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
 */
export function useVoiceSettings(): AssistantVoiceSettings {
  const local = useLocalStore(store);
  void useRemoteSiteData();
  const rows = remoteRows();
  const hasRemote = getSupabase() !== null;
  if (!hasRemote) return local;
  return {
    voiceEnabled: asOnFlag(rows[ASSISTANT_VOICE_DB_KEYS.voiceEnabled], DEFAULT_ASSISTANT_VOICE.voiceEnabled),
    autoVoice: asOnFlag(rows[ASSISTANT_VOICE_DB_KEYS.autoVoice], DEFAULT_ASSISTANT_VOICE.autoVoice),
    cloudVoice: asOnFlag(rows[ASSISTANT_VOICE_DB_KEYS.cloudVoice], DEFAULT_ASSISTANT_VOICE.cloudVoice),
    voiceName: asVoiceName(rows[ASSISTANT_VOICE_DB_KEYS.voiceName] ?? local.voiceName),
    rate: clampRate(Number(rows[ASSISTANT_VOICE_DB_KEYS.rate] ?? local.rate)),
    suggestions: asOnFlag(rows[ASSISTANT_VOICE_DB_KEYS.suggestions], DEFAULT_ASSISTANT_VOICE.suggestions),
    tone: asTone(rows[ASSISTANT_VOICE_DB_KEYS.tone] ?? local.tone),
  };
}

/** آیا «خواندن خودکار» برای این بازدیدکننده اجازه دارد؟ (کلید مدیر) */
export function isAutoVoiceAllowed(): boolean {
  return getVoiceSettings().autoVoice;
}

/** آیا صدای ابری از نگاه تنظیمات مدیر فعال است؟ (بدون درخواست) */
export function isCloudVoiceEnabledByAdmin(): boolean {
  return getVoiceSettings().cloudVoice;
}
