// ============================================================
// ZHINO — admin: settings
// Minimal on purpose: the shipping numbers the site already
// uses + the low-stock alert threshold. No payment gateways,
// no extra switches (src/services/settings.ts).
// UI: one form, one primary «ذخیره» button, quiet «بازنشانی».
// ============================================================

import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SITE_SETTINGS,
  getSettings,
  resetSettings,
  saveSettings,
  useSettings,
  type SiteSettings,
} from '../../services/settings';
import { Field, SavedFlash } from '../components/ui';
import { cn } from '../../utils/cn';

interface NumericField {
  key: keyof SiteSettings;
  label: string;
  hint: string;
  step: number;
}

const FIELDS: NumericField[] = [
  {
    key: 'freeShippingThreshold',
    label: 'آستانه ارسال رایگان (تومان)',
    hint: 'سفارش‌هایی که جمع اقلامشان به این عدد برسد، ارسال رایگان دارند.',
    step: 10000,
  },
  {
    key: 'standardShippingCost',
    label: 'هزینه ارسال استاندارد (تومان)',
    hint: 'هزینه ارسال معمول برای سفارش‌های زیر آستانه ارسال رایگان.',
    step: 5000,
  },
  {
    key: 'expressShippingCost',
    label: 'هزینه ارسال سریع (تومان)',
    hint: 'هزینه ارسال فوری برای سفارش‌های زیر آستانه ارسال رایگان.',
    step: 5000,
  },
  {
    key: 'lowStockThreshold',
    label: 'آستانه هشدار کم‌موجودی (عدد)',
    hint: 'اگر موجودی هر محصول به این عدد یا کمتر برسد، در موجودی و داشبورد هشدار می‌خورد.',
    step: 1,
  },
];

export default function AdminSettingsPage() {
  const liveSettings = useSettings();
  const [form, setForm] = useState<SiteSettings>(() => getSettings());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  /** While the admin is editing, a fresh remote snapshot must not replace the draft. */
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (dirtyRef.current) return;
    setForm(liveSettings);
  }, [liveSettings]);

  const canReset = FIELDS.some((f) => liveSettings[f.key] !== DEFAULT_SITE_SETTINGS[f.key]);

  const updateField = (key: keyof SiteSettings, value: number) => {
    dirtyRef.current = true;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    const next: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = form[f.key];
      if (!Number.isSafeInteger(v) || v < 0) {
        next[f.key] = 'یک عدد صحیحِ صفر یا بزرگ‌تر وارد کنید';
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    const ok = await saveSettings(form);
    setSaving(false);
    if (!ok) return; // keep the draft; the panel-wide banner carries the database error
    dirtyRef.current = false;
    setForm(getSettings());
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const reset = async () => {
    if (!window.confirm('تنظیمات به مقادیر اولیه سایت بازگردد؟')) return;
    setSaving(true);
    const ok = await resetSettings();
    setSaving(false);
    if (!ok) return;
    dirtyRef.current = false;
    setForm({ ...DEFAULT_SITE_SETTINGS });
  };

  return (
    <div className="max-w-2xl">
      <SavedFlash show={saved} />

      <div className="panel-lux space-y-5 rounded-2xl p-6 sm:p-7">
        {FIELDS.map((field) => (
          <Field key={field.key} label={field.label} hint={field.hint} error={errors[field.key]}>
            <input
              type="number"
              min={0}
              max={Number.MAX_SAFE_INTEGER}
              step={field.step}
              dir="ltr"
              className={cn('adm-input', errors[field.key] && 'err')}
              value={Number.isNaN(form[field.key]) ? '' : form[field.key]}
              disabled={saving}
              onChange={(e) => updateField(field.key, e.target.value === '' ? NaN : Number(e.target.value))}
            />
          </Field>
        ))}

        {Object.keys(errors).length > 0 && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-xs font-bold leading-6 text-red-700 ring-1 ring-red-200">
            مقادیر مشخص‌شده را بررسی کنید.
          </p>
        )}

        <div className="flex flex-col gap-3 border-t border-espresso/8 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => void save()} disabled={saving} className="btn-lux btn-wine rounded-xl sm:min-w-48">
            {saving ? 'در حال ذخیره…' : 'ذخیره تنظیمات'}
          </button>
          <button
            type="button"
            onClick={() => void reset()}
            disabled={!canReset || saving}
            className="text-[0.72rem] font-bold text-mocha-light underline-offset-4 transition hover:text-wine-900 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline"
          >
            بازنشانی به مقادیر اولیه
          </button>
        </div>
      </div>

      <p className="mt-5 text-[0.7rem] leading-6 text-mocha">
        این مقادیر دقیقاً همان اعدادی هستند که سبد خرید، نوار پیشرفت ارسال رایگان و
        تسویه‌حساب فروشگاه از آن‌ها استفاده می‌کنند؛ ذخیره تغییرات بلافاصله روی همین منطق
        اعمال می‌شود.
      </p>

    </div>
  );
}
