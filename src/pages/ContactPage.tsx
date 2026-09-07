// ============================================================
// ZHINO — contact page (frontend-only form with local confirmation)
// ============================================================

import { useState } from 'react';
import { soundService } from '../services/soundService';
import { cn } from '../utils/cn';

const inputClass = (hasError: boolean) =>
  cn(
    'w-full rounded-2xl border-2 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-normal placeholder:text-slate-400',
    hasError ? 'border-red-300 focus:border-red-400' : 'border-stone-200 focus:border-amber-400',
  );

export default function ContactPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  const submit = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'نام را وارد کنید';
    if (!phone.trim()) next.phone = 'راه ارتباطی (موبایل) را وارد کنید';
    if (message.trim().length < 10) next.message = 'پیام باید حداقل ۱۰ حرف باشد';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    soundService.play('primaryButton');
    setSent(true);
  };

  const reset = () => {
    setName('');
    setPhone('');
    setMessage('');
    setErrors({});
    setSent(false);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 sm:px-6">
      <div className="animate-fade-up text-center">
        <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">تماس با ژینو</h1>
        <p className="mt-2 text-sm leading-7 text-slate-500">
          سؤال، پیشنهاد یا انتقادی دارید؟ از طریق فرم زیر برای ما بنویسید؛ در ساعات کاری پاسخ می‌دهیم.
        </p>
      </div>

      <div className="mt-8 rounded-3xl bg-white p-5 shadow-md shadow-stone-200/60 sm:p-7">
        {sent ? (
          <div className="animate-fade-up py-6 text-center">
            <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <h2 className="text-lg font-black text-slate-800">پیام شما ثبت شد</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-7 text-slate-500">
              سپاس از همراهی شما! کارشناسان ژینو پس از بررسی، با شما در تماس خواهند بود.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-5 rounded-2xl bg-stone-100 px-6 py-3 text-sm font-extrabold text-slate-700 transition hover:bg-stone-200"
            >
              ارسال پیام دیگر
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="contact-name" className="mb-1.5 block text-xs font-bold text-slate-600">نام *</label>
                <input
                  id="contact-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="نام شما"
                  className={inputClass(Boolean(errors.name))}
                  autoComplete="name"
                />
                {errors.name && <p className="mt-1 text-[11px] font-bold text-red-600">{errors.name}</p>}
              </div>
              <div>
                <label htmlFor="contact-phone" className="mb-1.5 block text-xs font-bold text-slate-600">شماره موبایل *</label>
                <input
                  id="contact-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="09123456789"
                  inputMode="tel"
                  dir="ltr"
                  className={cn(inputClass(Boolean(errors.phone)), 'text-left')}
                  autoComplete="tel"
                />
                {errors.phone && <p className="mt-1 text-[11px] font-bold text-red-600">{errors.phone}</p>}
              </div>
            </div>
            <div>
              <label htmlFor="contact-message" className="mb-1.5 block text-xs font-bold text-slate-600">متن پیام *</label>
              <textarea
                id="contact-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="پیام خود را بنویسید…"
                rows={5}
                className={cn(inputClass(Boolean(errors.message)), 'resize-none')}
              />
              {errors.message && <p className="mt-1 text-[11px] font-bold text-red-600">{errors.message}</p>}
            </div>
            <button
              type="button"
              onClick={submit}
              className="w-full rounded-2xl bg-amber-500 px-6 py-4 text-sm font-extrabold text-white shadow-lg shadow-amber-200 transition hover:bg-amber-600 active:scale-[0.99]"
            >
              ارسال پیام
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
