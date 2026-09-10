// ============================================================
// ZHINO — admin login
// An honest, ready-to-connect authentication shell: in this
// phase nothing is validated or stored (see authService.ts) and
// the page says so plainly instead of pretending to be secure.
// ============================================================

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../auth/AuthContext';
import { Field } from '../components/ui';
import { cn } from '../../utils/cn';

interface FormErrors {
  identifier?: string;
  secret?: string;
  form?: string;
}

export default function AdminLoginPage() {
  const { session, login } = useAdminAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [secret, setSecret] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);

  if (session) {
    return <Navigate to="/admin" replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: FormErrors = {};
    if (identifier.trim().length < 3) next.identifier = 'نام کاربری (حداقل ۳ حرف) را وارد کنید';
    if (secret.trim().length < 4) next.secret = 'گذرواژه (حداقل ۴ حرف) را وارد کنید';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      await login(identifier, secret);
      navigate('/admin', { replace: true });
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'ورود ممکن نشد؛ دوباره تلاش کنید.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-cream-page">
      {/* thin brand strip */}
      <header className="border-b border-espresso/8 bg-cream-50/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3" aria-label="ژینو — صفحه اصلی">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-wine-900 text-lg font-extrabold text-gold-300 ring-1 ring-wine-900/15">
              ژ
            </span>
            <span className="leading-none">
              <span className="block text-lg font-bold text-wine-950">ژینو</span>
              <span className="mt-1 block font-display text-[0.6rem] uppercase tracking-[0.4em] text-gold-700">
                Zhino
              </span>
            </span>
          </Link>
          <Link to="/" className="group flex items-center gap-1.5 text-xs font-bold text-mocha transition hover:text-wine-900">
            بازگشت به سایت
            <span aria-hidden="true">←</span>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:py-14">
        <div className="w-full max-w-md">
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-wine-900 text-2xl font-extrabold text-gold-300 shadow-lg shadow-wine-900/25 ring-1 ring-wine-900/15">
              ژ
            </span>
            <p className="kicker mt-5 font-display">Zhino · Admin</p>
            <h1 className="mt-2 text-2xl font-bold text-wine-950">ورود به پنل مدیریت</h1>
            <p className="mt-2 text-[0.8rem] leading-7 text-mocha">
              مدیریت محصولات، سفارش‌ها و محتوای فروشگاه ژینو.
            </p>
          </div>

          <form onSubmit={submit} noValidate className="panel-lux mt-6 space-y-4 rounded-2xl p-6 sm:p-7">
            {errors.form && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-xs font-bold leading-6 text-red-700 ring-1 ring-red-200">
                {errors.form}
              </p>
            )}
            <Field label="نام کاربری" error={errors.identifier}>
              <input
                className={cn('adm-input', errors.identifier && 'err')}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="مثلاً admin"
                autoComplete="username"
                autoFocus
              />
            </Field>
            <Field label="گذرواژه" error={errors.secret}>
              <input
                type="password"
                className={cn('adm-input', errors.secret && 'err')}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </Field>
            <button
              type="submit"
              disabled={busy}
              className="btn-lux btn-wine w-full rounded-xl text-base disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? 'در حال ورود…' : 'ورود'}
            </button>
          </form>

          {/* honest disclosure — no fake security */}
          <div className="mt-4 rounded-xl bg-cream-100 px-4 py-3.5 text-[0.7rem] leading-6 text-mocha ring-1 ring-espresso/8">
            <p className="font-bold text-wine-900">توجه — احراز هویت واقعی هنوز متصل نشده است.</p>
            <p>
              در این نسخه نمایشی هیچ گذرواژه‌ای بررسی یا ذخیره نمی‌شود و ورود فقط برای
              پیش‌نمایش پنل امکان‌پذیر است. برای امنیت واقعی، سرویس احراز هویت بک‌اند در
              فاز بعد متصل می‌شود (پیکربندی: <span dir="ltr" className="font-semibold">VITE_ADMIN_AUTH_MODE</span>).
            </p>
          </div>

          <p className="mt-6 text-center text-[0.7rem] text-mocha-light">
            © ژینو — پنل مدیریت
          </p>
        </div>
      </main>
    </div>
  );
}
