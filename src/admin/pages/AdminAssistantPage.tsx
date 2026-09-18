// ============================================================
// ZHINO — admin: «ربات ژینو»
// The ONE place for everything about the store assistant:
// three collapsible subsections —
//   ۱) تنظیمات صدا (master switch, auto-read, cloud voice,
//      Persian voice, reading speed, test button)
//   ۲) تنظیمات رفتار ربات (starter suggestions, reply tone)
//   ۳) وضعیت سرویس (cloud health, browser fallback, last error)
// Playback controls (play / pause / stop / replay) are NOT
// duplicated here — they live inside the chat itself, by design.
// Nothing secret is stored or shown: the Azure key exists only
// in Supabase Edge Function Secrets and the panel manages only
// the public site_content switches (admin-write RLS as before).
// The voice test reuses the very same speech engine as the
// customer chat (useAssistantSpeech) — no duplicate engine.
// ============================================================

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ASSISTANT_TONE_OPTIONS,
  ASSISTANT_VOICE_OPTIONS,
  DEFAULT_ASSISTANT_VOICE,
  getVoiceSettings,
  resetVoiceSettings,
  saveVoiceSettings,
  useVoiceSettings,
  type AssistantVoiceSettings,
} from '../../services/voiceSettings';
import { probeCloudVoiceHealth, type CloudVoiceHealth } from '../../services/assistant/voice';
import { useAssistantSpeech, type AssistantVoiceProblem } from '../../components/assistant/useAssistantSpeech';
import { useAdminAuth } from '../auth/AuthContext';
import { Field, SavedFlash, Toggle } from '../components/ui';
import { cn } from '../../utils/cn';

const TEST_LINE = 'سلام! من ژینو هستم، دستیار فروشگاه ژینو؛ از شیرینی‌هامون چی دوست داری؟';

const RATE_OPTIONS = [
  { value: 0.85, label: 'آرام (۰٫۸۵×)' },
  { value: 1, label: 'معمولی (۱×)' },
  { value: 1.15, label: 'کمی تند (۱٫۱۵×)' },
  { value: 1.3, label: 'تند (۱٫۳×)' },
];

const PROBLEM_TEXT: Record<Exclude<AssistantVoiceProblem, null>, string> = {
  'no-persian-voice': 'صدای فارسی روی مرورگر پیدا نشد؛ می‌توانید صدای ابری را روشن کنید.',
  'engine-stalled': 'موتور صدای مرورگر در میانه راه متوقف شد؛ دوباره امتحان کنید.',
  'cloud-failed': 'صدای ابری در دسترس نبود و جایگزین مرورگر هم نشد؛ وضعیت سرویس را بررسی کنید.',
};

/* ── collapsible subsection ─────────────────────────────── */

function Accordion({
  title,
  desc,
  defaultOpen = false,
  children,
}: {
  title: string;
  desc: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="panel-lux rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-right transition hover:bg-cream-50/60 sm:px-6"
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.7rem] text-wine-900 ring-1 ring-espresso/15 transition-transform',
            open && 'rotate-90',
          )}
        >
          ◂
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.92rem] font-extrabold text-wine-950">{title}</span>
          <span className="mt-0.5 block text-[0.68rem] leading-5 text-mocha-light">{desc}</span>
        </span>
      </button>
      {open && <div className="space-y-4 border-t border-espresso/8 px-5 py-5 sm:px-6">{children}</div>}
    </section>
  );
}

/* ── one labelled switch row ────────────────────────────── */

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <span className="adm-field-label !mb-0">{label}</span>
        <p className="mt-1 text-[0.66rem] leading-5 text-mocha-light">{hint}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

/* ── page ───────────────────────────────────────────────── */

export default function AdminAssistantPage() {
  const { isDemo } = useAdminAuth();
  const liveSettings = useVoiceSettings();
  const speech = useAssistantSpeech();
  const [form, setForm] = useState<AssistantVoiceSettings>(() => getVoiceSettings());
  const [saved, setSaved] = useState(false);
  const [testNote, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  // service status (subsection ۳) — probed on demand, never auto-loops
  const [health, setHealth] = useState<CloudVoiceHealth | 'idle'>('idle');
  const [probing, setProbing] = useState(false);
  const [errorNote, setErrorNote] = useState<string | null>(null);

  useEffect(() => {
    setForm(liveSettings);
  }, [liveSettings]);

  const browserCapable = useMemo(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window,
    [],
  );

  const save = () => {
    saveVoiceSettings(form);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  /* تست صدا: همان موتور گفتگوست؛ ابتدا مقادیر روی فرم ذخیره می‌شود
     تا هوک همان چیزی را بشنوَد که مدیر روی صفحه می‌بیند */
  const pendingTest = useRef(false);

  useEffect(() => {
    if (!pendingTest.current) return;
    pendingTest.current = false;
    if (!liveSettings.voiceEnabled) {
      setNote({ tone: 'err', text: 'کلید «صدای ربات» خاموش است؛ ابتدا آن را روشن کنید.' });
      return;
    }
    setNote({ tone: 'ok', text: 'در حال پخش تست… اگر چیزی نشنیدید، «وضعیت سرویس» را باز کنید.' });
    speech.speak(TEST_LINE);
    // فقط هنگام بالاامدن تنظیمات تازهٔ ذخیره‌شده اجرا می‌شود
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSettings]);

  // خطاهای موتور صدا → پیام قابل‌فهم + ثبت در «وضعیت سرویس»
  useEffect(() => {
    if (!speech.voiceProblem) return;
    const text = PROBLEM_TEXT[speech.voiceProblem];
    setNote({ tone: 'err', text });
    setErrorNote(text);
  }, [speech.voiceProblem]);

  const testVoice = () => {
    speech.stop();
    saveVoiceSettings(form); // تست همان چیزی را می‌شنود که ذخیره می‌شود
    pendingTest.current = true;
    // اگر ذخیره هیچ تغییری نکرد، ممکن است افکت بالا اجرا نشود؛
    // یک لحظه بعد به‌صورت دستی پخش را آغاز می‌کنیم
    window.setTimeout(() => {
      if (!pendingTest.current) return;
      pendingTest.current = false;
      const now = getVoiceSettings();
      if (!now.voiceEnabled) {
        setNote({ tone: 'err', text: 'کلید «صدای ربات» خاموش است؛ ابتدا آن را روشن کنید.' });
        return;
      }
      setNote({ tone: 'ok', text: 'در حال پخش تست… اگر چیزی نشنیدید، «وضعیت سرویس» را باز کنید.' });
      speech.speak(TEST_LINE);
    }, 350);
  };

  const runProbe = async () => {
    setProbing(true);
    const result = await probeCloudVoiceHealth();
    setProbing(false);
    setHealth(result);
    if (result.state === 'ready' && result.enabled) {
      setErrorNote(null);
    } else if (result.state === 'ready') {
      setErrorNote('صدای ابری همین حالا از سمت سرویس خاموش است؛ کلید «صدای ابری» یا «صدای ربات» را بررسی کنید.');
    } else if (result.state === 'not-configured') {
      setErrorNote('Secret های سرویس صدای ابری روی سرور تنظیم نشده‌اند؛ مستندات استقرار Supabase را ببینید.');
    } else if (result.state === 'no-supabase') {
      setErrorNote('ارتباط Supabase در فرانت‌اند تعریف نشده است (حالت آفلاین/دمو)؛ فقط صدای مرورگر فعال است.');
    } else {
      setErrorNote('ارتباط با سرویس صدای ابری برقرار نشد؛ اتصال اینترنت یا وضعیت استقرار Edge Function را بررسی کنید.');
    }
  };

  /** برچسب و رنگ وضعیت سرویس ابری — بدون هیچ مقدار محرمانه */
  const healthBadge: { cls: string; label: string } = probing
    ? { cls: 'adm-badge-warning', label: 'در حال بررسی…' }
    : health === 'idle'
      ? { cls: 'adm-badge-ghost', label: 'بررسی نشده' }
      : health.state === 'ready' && health.enabled
        ? { cls: 'adm-badge-ok', label: 'متصل و سالم' }
        : health.state === 'ready'
          ? { cls: 'adm-badge-warning', label: 'خاموش از سمت سرویس' }
          : health.state === 'unreachable'
            ? { cls: 'adm-badge-cancelled', label: 'قطع یا خطا' }
            : { cls: 'adm-badge-cancelled', label: 'تنظیم نشده' };

  return (
    <div className="max-w-2xl">
      <SavedFlash show={saved} />

      {isDemo && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-[0.7rem] font-bold leading-6 text-amber-800 ring-1 ring-amber-200">
          در حالت نمایشی وارد شده‌اید؛ تغییرات فقط روی همین مرورگر ذخیره می‌شود.
        </p>
      )}

      <div className="space-y-4">
        {/* ─── ۱) تنظیمات صدا ─── */}
        <Accordion
          title="تنظیمات صدا"
          desc="کلید اصلی صدا، خواندن خودکار، صدای ابری فارسی، انتخاب صدا و سرعت خواندن"
          defaultOpen
        >
          <SwitchRow
            label="صدای ربات (کلید اصلی)"
            hint="با خاموش‌بودن این کلید، هیچ صدایی — نه ابری و نه مرورگر — پخش نمی‌شود و دکمه‌های صدا در گفتگو پنهان می‌شوند."
            checked={form.voiceEnabled}
            onChange={(v) => setForm((f) => ({ ...f, voiceEnabled: v }))}
          />
          <SwitchRow
            label="خواندن خودکار پاسخ‌های جدید"
            hint="با روشن‌بودن، هر پاسخ تازهٔ ربات یک‌بار خوانده می‌شود (مشتری دکمهٔ توقف را در گفتگو دارد)."
            checked={form.autoVoice}
            onChange={(v) => setForm((f) => ({ ...f, autoVoice: v }))}
          />
          <SwitchRow
            label="صدای ابری فارسی"
            hint="صدای طبیعی‌تر از سرور (Azure). اگر خاموش یا در دسترس نباشد، صدای مرورگر مشتری استفاده می‌شود."
            checked={form.cloudVoice}
            onChange={(v) => setForm((f) => ({ ...f, cloudVoice: v }))}
          />

          <Field label="صدای فارسی" hint="پیش‌فرض «دیلارا» است؛ هر دو صدای استاندارد فارسی Azure هستند.">
            <select
              className="adm-input"
              value={form.voiceName}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  voiceName: e.target.value === 'fa-IR-FaridNeural' ? 'fa-IR-FaridNeural' : 'fa-IR-DilaraNeural',
                }))
              }
            >
              {ASSISTANT_VOICE_OPTIONS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="سرعت خواندن" hint="روی خواندن دکمه‌ها و خواندن خودکار اعمال می‌شود.">
            <select
              className="adm-input"
              value={String(form.rate)}
              onChange={(e) => setForm((f) => ({ ...f, rate: Number(e.target.value) }))}
            >
              {RATE_OPTIONS.map((r) => (
                <option key={r.value} value={String(r.value)}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex flex-wrap items-center gap-3 border-t border-espresso/8 pt-4">
            <button
              type="button"
              onClick={testVoice}
              className="btn-lux btn-gold rounded-xl px-5 py-2.5 text-[0.78rem]"
            >
              تست صدا
            </button>
            {testNote && (
              <span
                role={testNote.tone === 'err' ? 'alert' : 'status'}
                className={cn(
                  'text-[0.7rem] font-bold',
                  testNote.tone === 'err' ? 'text-red-700' : 'text-emerald-700',
                )}
              >
                {testNote.text}
              </span>
            )}
          </div>

          <p className="rounded-xl bg-cream-50 px-4 py-3 text-[0.66rem] leading-5 text-mocha ring-1 ring-espresso/8">
            کنترل پخش (پخش، مکث و ادامه، توقف و پخش مجدد) همان دکمه‌هایی است که داخل گفتگو به
            مشتری نشان داده می‌شود؛ برای ساده‌ماندن پنل، اینجا تکرار نشده‌اند.
          </p>
        </Accordion>

        {/* ─── ۲) تنظیمات رفتار ربات ─── */}
        <Accordion
          title="تنظیمات رفتار ربات"
          desc="پیشنهادهای شروع گفتگو و لحن پاسخ‌ها — جدا از تنظیمات صدا"
        >
          <SwitchRow
            label="پیشنهادهای شروع گفتگو"
            hint="چیپ‌های آماده‌ای مثل «پرفروش‌ترین شیرینی‌ها» که مشتری با یک لمس شروع می‌کند؛ با خاموش‌بودن، دیگر نمایش داده نمی‌شوند."
            checked={form.suggestions}
            onChange={(v) => setForm((f) => ({ ...f, suggestions: v }))}
          />

          <Field
            label="لحن پاسخ‌های ربات"
            hint="لحن از سمت سرور اعمال می‌شود؛ حالت رسمی جمله‌ها را کوتاه‌تر و محتاط‌تر می‌کند."
          >
            <select
              className="adm-input"
              value={form.tone}
              onChange={(e) =>
                setForm((f) => ({ ...f, tone: e.target.value === 'formal' ? 'formal' : 'friendly' }))
              }
            >
              {ASSISTANT_TONE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </Accordion>

        {/* ─── ۳) وضعیت سرویس ─── */}
        <Accordion
          title="وضعیت سرویس"
          desc="سلامت صدای ابری و مسیر جایگزین مرورگر — بدون نمایش هیچ کلید یا مقدار محرمانه"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[0.74rem] font-bold text-wine-950">صدای ابری (سرور)</span>
              <span className={cn('adm-badge', healthBadge.cls)}>{healthBadge.label}</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-[0.74rem] font-bold text-wine-950">مسیر جایگزین (صدای مرورگر)</span>
              <span className={cn('adm-badge', browserCapable ? 'adm-badge-ok' : 'adm-badge-cancelled')}>
                {browserCapable ? 'فعال و آماده' : 'این مرورگر پشتیبانی نمی‌کند'}
              </span>
            </div>

            {errorNote && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[0.7rem] font-bold leading-6 text-red-700 ring-1 ring-red-200">
                {errorNote}
              </p>
            )}
            {!errorNote && health !== 'idle' && health.state === 'ready' && health.enabled && (
              <p className="rounded-xl bg-emerald-50 px-4 py-3 text-[0.7rem] font-bold leading-6 text-emerald-700 ring-1 ring-emerald-200">
                خطایی ثبت نشده است؛ سرویس صدا آماده است.
              </p>
            )}

            <button
              type="button"
              onClick={runProbe}
              disabled={probing}
              className="text-[0.72rem] font-bold text-mocha-light underline-offset-4 transition hover:text-wine-900 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            >
              بررسی وضعیت سرویس
            </button>

            <p className="text-[0.62rem] leading-5 text-mocha-light">
              توضیح: وضعیت «مسیر جایگزین» مرورگرِ همین مدیر را نشان می‌دهد؛ مرورگر مشتری ممکن است
              متفاوت باشد. در این بخش هیچ کلید یا مقدار محرمانه‌ای ذخیره یا نمایش داده نمی‌شود.
            </p>
          </div>
        </Accordion>

        {/* ─── save bar ─── */}
        <div className="flex flex-col gap-3 rounded-2xl border border-espresso/8 bg-cream-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={save} className="btn-lux btn-wine rounded-xl sm:min-w-48">
            ذخیره تنظیمات ربات
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('تنظیمات ربات به مقادیر اولیه بازگردد؟')) {
                resetVoiceSettings();
                setForm({ ...DEFAULT_ASSISTANT_VOICE });
                setNote(null);
              }
            }}
            className="text-[0.72rem] font-bold text-mocha-light underline-offset-4 transition hover:text-wine-900 hover:underline"
          >
            بازنشانی به مقادیر اولیه
          </button>
        </div>
      </div>

      <p className="mt-5 text-[0.7rem] leading-6 text-mocha">
        همهٔ امکانات «ربات ژینو» فقط در همین صفحه مدیریت می‌شود؛ کلید محرمانه Azure فقط در
        Secrets توابع لبه Supabase می‌ماند و این پنل هیچ مقدار محرمانه‌ای را ذخیره یا نمایش نمی‌دهد.
      </p>
    </div>
  );
}
