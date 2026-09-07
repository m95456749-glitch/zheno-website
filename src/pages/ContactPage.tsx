// ============================================================
// ZHINO — contact page (frontend-only form with local confirmation)
// ============================================================

import { useState } from 'react';
import { soundService } from '../services/soundService';
import { cn } from '../utils/cn';

const inputClass = (hasError: boolean) =>
  cn(
    'w-full rounded-xl border-2 bg-white px-4 py-3 text-sm font-semibold text-espresso outline-none transition placeholder:font-normal placeholder:text-mocha-light',
    hasError
      ? 'border-red-300 focus:border-red-400'
      : 'border-espresso/12 focus:border-gold-500 hover:border-gold-500/60',
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
    <div className="mx-auto max-w-5xl px-4 pt-14 sm:px-6">
      <div className="animate-fade-up text-center">
        <p className="kicker font-display">Get in Touch</p>
        <h1 className="mt-4 text-3xl font-bold text-wine-950 sm:text-4xl">تماس با ژینو</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-8 text-mocha">
          سؤال، پیشنهاد یا انتقادی دارید؟ از طریق فرم زیر برای ما بنویسید؛ در ساعات کاری پاسخ می‌دهیم.
        </p>
        <span className="rule-lux mt-6" aria-hidden="true" />
      </div>

      <div className="mt-10 grid items-start gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        {/* quiet side panel — brand voice only, no invented contact data */}
        <div className="grain relative hidden overflow-hidden rounded-2xl bg-gradient-to-bl from-wine-800 via-wine-900 to-noir p-8 text-cream-50 ring-1 ring-gold-400/25 lg:block">
          <p className="font-display text-[0.62rem] uppercase tracking-[0.4em] text-gold-400">Zhino Atelier</p>
          <p className="mt-5 text-xl font-light leading-[1.8]">
            هر پیام شما، یک قدم به دسرِ بهترِ فردا.
          </p>
          <span className="rule-lux mt-7" aria-hidden="true" />
          <p className="mt-6 text-xs leading-7 text-cream-200/70">
            صدای مشتریان برای ژینو ارزشمند است؛ پیشنهادها و پرسش‌های شما با دقت خوانده و پاسخ داده می‌شود.
          </p>
        </div>

        <div className="panel-lux rounded-2xl p-6 sm:p-8">
          {sent ? (
            <div className="animate-fade-up py-6 text-center">
              <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-300/60">
                <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#047857" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h2 className="text-lg font-bold text-wine-950">پیام شما ثبت شد</h2>
              <p className="mx-auto mt-2.5 max-w-sm text-sm leading-8 text-mocha">
                سپاس از همراهی شما! کارشناسان ژینو پس از بررسی، با شما در تماس خواهند بود.
              </p>
              <button
                type="button"
                onClick={reset}
                className="btn-lux btn-line-dark mt-6"
              >
                ارسال پیام دیگر
              </button>
            </div>
          ) : (
            <div className="space-y-4.5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="contact-name" className="mb-1.5 block text-xs font-bold text-wine-900">نام *</label>
                  <input
                    id="contact-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="نام شما"
                    className={inputClass(Boolean(errors.name))}
                    autoComplete="name"
                  />
                  {errors.name && <p className="mt-1.5 text-[0.68rem] font-bold text-red-700">{errors.name}</p>}
                </div>
                <div>
                  <label htmlFor="contact-phone" className="mb-1.5 block text-xs font-bold text-wine-900">شماره موبایل *</label>
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
                  {errors.phone && <p className="mt-1.5 text-[0.68rem] font-bold text-red-700">{errors.phone}</p>}
                </div>
              </div>
              <div>
                <label htmlFor="contact-message" className="mb-1.5 block text-xs font-bold text-wine-900">متن پیام *</label>
                <textarea
                  id="contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="پیام خود را بنویسید…"
                  rows={5}
                  className={cn(inputClass(Boolean(errors.message)), 'resize-none')}
                />
                {errors.message && <p className="mt-1.5 text-[0.68rem] font-bold text-red-700">{errors.message}</p>}
              </div>
              <button
                type="button"
                onClick={submit}
                className="btn-lux btn-wine w-full rounded-xl text-base"
              >
                ارسال پیام
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
