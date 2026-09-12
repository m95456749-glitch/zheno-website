// ============================================================
// ZHINO — admin: site content
// Only the strings the site already shows are editable (see
// src/services/siteContent.ts). Defaults are the exact current
// texts, so the storefront renders identically until changed.
// UI: one form, one primary «ذخیره» button, quiet «بازنشانی».
// ============================================================

import { useState } from 'react';
import {
  DEFAULT_SITE_CONTENT,
  getSiteContent,
  resetSiteContent,
  saveSiteContent,
  type SiteContent,
} from '../../services/siteContent';
import { Field, SavedFlash } from '../components/ui';

const FIELDS: Array<{ key: keyof SiteContent; label: string; hint: string; multiline?: boolean; ltr?: boolean }> = [
  {
    key: 'aboutLead',
    label: 'متن «درباره ما»',
    hint: 'پاراگراف معرفی زیر عنوان صفحه درباره.',
    multiline: true,
  },
  {
    key: 'contactLead',
    label: 'متن «تماس با ما»',
    hint: 'پاراگراف زیر عنوان صفحه تماس.',
    multiline: true,
  },
  {
    key: 'recipesLead',
    label: 'متن «دستور تهیه»',
    hint: 'پاراگراف زیر عنوان صفحه دستور تهیه.',
  },
  {
    key: 'footerCopyright',
    label: 'پاورقی کپی‌رایت',
    hint: 'متن بعد از «© سال ژینو —» در پایین صفحه.',
  },
  {
    key: 'footerTagline',
    label: 'شعار انگلیسی پاورقی',
    hint: 'شعار لاتین در گوشه پایین صفحه.',
    ltr: true,
  },
];

export default function AdminSiteContentPage() {
  const [form, setForm] = useState<SiteContent>(() => getSiteContent());
  const [saved, setSaved] = useState(false);

  const changed = FIELDS.some((f) => form[f.key] !== DEFAULT_SITE_CONTENT[f.key]);

  const save = () => {
    void saveSiteContent(form)
      .then(() => setSaved(true))
      .catch(() => window.alert('ذخیره محتوا در پایگاه داده ممکن نشد.'));
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl">
      <SavedFlash show={saved} />

      <div className="panel-lux space-y-5 rounded-2xl p-6 sm:p-7">
        {FIELDS.map((field) => (
          <Field key={field.key} label={field.label} hint={field.hint}>
            {field.multiline ? (
              <textarea
                rows={3}
                dir={field.ltr ? 'ltr' : 'rtl'}
                className="adm-input resize-none text-start"
                value={form[field.key]}
                onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              />
            ) : (
              <input
                dir={field.ltr ? 'ltr' : 'rtl'}
                className="adm-input text-start"
                value={form[field.key]}
                onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              />
            )}
          </Field>
        ))}

        <div className="flex flex-col gap-3 border-t border-espresso/8 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={save} className="btn-lux btn-wine rounded-xl sm:min-w-48">
            ذخیره تغییرات
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('همه متن‌ها به حالت اولیه سایت بازگردد؟')) {
                resetSiteContent();
                setForm({ ...DEFAULT_SITE_CONTENT });
              }
            }}
            disabled={!changed}
            className="text-[0.72rem] font-bold text-mocha-light underline-offset-4 transition hover:text-wine-900 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline"
          >
            بازنشانی به متن‌های اولیه
          </button>
        </div>
      </div>

      <p className="mt-5 text-[0.7rem] leading-6 text-mocha">
        این بخش فقط متن‌هایی را که سایت فعلاً نمایش می‌دهد ویرایش می‌کند؛ ساختار و طرح‌بندی صفحات
        دست‌نخورده می‌ماند.
      </p>
    </div>
  );
}
