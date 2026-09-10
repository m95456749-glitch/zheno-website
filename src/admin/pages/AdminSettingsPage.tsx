// ============================================================
// ZHINO — admin: settings
// Minimal on purpose: the shipping numbers the site already
// uses + the low-stock alert threshold. No payment gateways,
// no extra switches (src/services/settings.ts).
// UI: one form, one primary «ذخیره» button, quiet «بازنشانی».
// ============================================================

import { useState } from 'react';
import {
  DEFAULT_SITE_SETTINGS,
  getSettings,
  resetSettings,
  saveSettings,
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
  const [form, setForm] = useState<SiteSettings>(() => getSettings());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const changed = FIELDS.some((f) => form[f.key] !== DEFAULT_SITE_SETTINGS[f.key]);

  const save = () => {
    const next: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = form[f.key];
      if (!Number.isInteger(v) || v < 0) {
        next[f.key] = 'مقدار صحیح (عدد منفی یا بزرگ‌تر) وارد کنید';
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    saveSettings(form);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
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
              step={field.step}
              dir="ltr"
              className={cn('adm-input', errors[field.key] && 'err')}
              value={Number.isNaN(form[field.key]) ? '' : form[field.key]}
              onChange={(e) =>
                setForm((f) => ({ ...f, [field.key]: e.target.value === '' ? NaN : Number(e.target.value) }))
              }
            />
          </Field>
        ))}

        {Object.keys(errors).length > 0 && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-xs font-bold leading-6 text-red-700 ring-1 ring-red-200">
            مقادیر مشخص‌شده را بررسی کنید.
          </p>
        )}

        <div className="flex flex-col gap-3 border-t border-espresso/8 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={save} className="btn-lux btn-wine rounded-xl sm:min-w-48">
            ذخیره تنظیمات
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('تنظیمات به مقادیر اولیه سایت بازگردد؟')) {
                resetSettings();
                setForm({ ...DEFAULT_SITE_SETTINGS });
              }
            }}
            disabled={!changed}
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
