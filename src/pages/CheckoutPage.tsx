// ============================================================
// ZHINO — checkout (customer -> address -> payment -> confirmation)
// Works frontend-only today; redirects to the payment gateway once
// VITE_API_BASE_URL is configured (see src/services/api.ts).
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useCartContext } from '../context/CartContext';
import {
  SHIPPING_COST_EXPRESS,
  SHIPPING_COST_STANDARD,
  getProductById,
  getVariantById,
} from '../data/products';
import { formatNumber, formatPrice } from '../utils/format';
import { initiatePayment, verifyPayment } from '../services/api';
import { soundService } from '../services/soundService';
import { cn } from '../utils/cn';
import FreeShippingProgress from '../components/FreeShippingProgress';
import type { Address, CheckoutStep, Customer, ShippingMethod } from '../types';

type FormStep = Exclude<CheckoutStep, 'cart'>;

const STEPS: { id: FormStep; label: string }[] = [
  { id: 'customer', label: 'مشخصات' },
  { id: 'address', label: 'نشانی' },
  { id: 'payment', label: 'پرداخت' },
  { id: 'confirmation', label: 'تأیید' },
];

/** Convert Persian/Arabic digits to Latin so validation accepts typed input. */
function toEnglishDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

const inputClass = (hasError: boolean) =>
  cn(
    'w-full rounded-2xl border-2 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-normal placeholder:text-slate-400',
    hasError ? 'border-red-300 focus:border-red-400' : 'border-stone-200 focus:border-amber-400',
  );

export default function CheckoutPage() {
  const { items, subtotal, isShippingFree, clearCart } = useCartContext();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<FormStep>('customer');
  const [customer, setCustomer] = useState<Customer>({ firstName: '', lastName: '', phone: '', email: '' });
  const [address, setAddress] = useState<Address>({ province: '', city: '', address: '', postalCode: '' });
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>('standard');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState(false);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  const apiConfigured = Boolean(import.meta.env.VITE_API_BASE_URL);

  const lines = useMemo(
    () =>
      items.flatMap((item) => {
        const product = getProductById(item.productId);
        const variant = getVariantById(item.productId, item.variantId);
        if (!product || !variant) return [];
        return [
          {
            key: `${item.productId}__${item.variantId}`,
            name: product.shortName,
            weight: variant.weight,
            qty: item.quantity,
            lineTotal: variant.price * item.quantity,
          },
        ];
      }),
    [items],
  );

  const shippingCost = shippingMethod === 'express' ? SHIPPING_COST_EXPRESS : SHIPPING_COST_STANDARD;
  const effectiveShipping = isShippingFree ? 0 : shippingCost;
  const total = subtotal + effectiveShipping;

  // Handle return from an external payment gateway (?orderId=...&token=...).
  useEffect(() => {
    const oid = searchParams.get('orderId');
    const token = searchParams.get('token');
    if (!oid || !token || orderId) return;
    let cancelled = false;
    setPlacing(true);
    verifyPayment(oid, token)
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setOrderId(oid);
          clearCart();
          soundService.play('orderComplete');
          setStep('confirmation');
          window.scrollTo({ top: 0 });
        } else {
          setGatewayError('پرداخت تأیید نشد. اگر مبلغی از حساب شما کسر شده، با پشتیبانی در میان بگذارید.');
        }
      })
      .catch(() => {
        if (!cancelled) setGatewayError('خطا در تأیید پرداخت. لطفاً دوباره تلاش کنید.');
      })
      .finally(() => {
        if (!cancelled) setPlacing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams, orderId, clearCart]);

  // Empty cart (e.g. after refresh) with no completed order -> back to cart.
  if (items.length === 0 && step !== 'confirmation') {
    return <Navigate to="/cart" replace />;
  }

  const validateCustomer = (): boolean => {
    const errors: Record<string, string> = {};
    if (!customer.firstName.trim()) errors.firstName = 'نام را وارد کنید';
    if (!customer.lastName.trim()) errors.lastName = 'نام خانوادگی را وارد کنید';
    const phone = toEnglishDigits(customer.phone.trim());
    if (!/^09\d{9}$/.test(phone)) errors.phone = 'شماره موبایل معتبر وارد کنید (مثل 09123456789)';
    if (customer.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) {
      errors.email = 'ایمیل معتبر وارد کنید';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateAddress = (): boolean => {
    const errors: Record<string, string> = {};
    if (!address.province.trim()) errors.province = 'استان را وارد کنید';
    if (!address.city.trim()) errors.city = 'شهر را وارد کنید';
    if (!address.address.trim()) errors.address = 'نشانی دقیق را وارد کنید';
    const postal = toEnglishDigits(address.postalCode.trim());
    if (!/^\d{10}$/.test(postal)) errors.postalCode = 'کد پستی ۱۰ رقمی وارد کنید';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const goNext = () => {
    soundService.play('primaryButton');
    if (step === 'customer' && validateCustomer()) {
      setStep('address');
      window.scrollTo({ top: 0 });
    } else if (step === 'address' && validateAddress()) {
      setStep('payment');
      window.scrollTo({ top: 0 });
    }
  };

  const goBack = () => {
    soundService.play('primaryButton');
    setGatewayError(null);
    if (step === 'address') setStep('customer');
    else if (step === 'payment') setStep('address');
    window.scrollTo({ top: 0 });
  };

  const placeOrder = async () => {
    setPlacing(true);
    setGatewayError(null);
    soundService.play('primaryButton');
    try {
      const res = await initiatePayment({ customer, address, items, shippingMethod, total });
      // Real backend mode: continue to the bank gateway.
      window.location.href = res.gatewayUrl;
    } catch (err) {
      if (err instanceof Error && err.message === 'PAYMENT_API_NOT_CONFIGURED') {
        // Frontend-only mode: record the order locally and confirm.
        const id = `ZH-${Date.now().toString(36).toUpperCase()}`;
        setOrderId(id);
        clearCart();
        soundService.play('orderComplete');
        setStep('confirmation');
        window.scrollTo({ top: 0 });
      } else {
        setGatewayError(err instanceof Error ? err.message : 'خطا در ثبت سفارش');
      }
    } finally {
      setPlacing(false);
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  if (step === 'confirmation' && orderId) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-14 text-center sm:px-6">
        <div className="animate-fade-up rounded-3xl bg-white p-8 shadow-md shadow-stone-200/60 sm:p-10">
          <span className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h1 className="text-xl font-black text-slate-800">سفارش شما با موفقیت ثبت شد</h1>
          <p className="mt-2 text-sm leading-7 text-slate-500">
            از خرید شما سپاسگزاریم! سفارش شما در حال آماده‌سازی است.
          </p>
          <p className="mt-4 rounded-2xl bg-stone-50 px-4 py-3 text-sm font-extrabold text-slate-700" dir="ltr">
            {orderId}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/products"
              className="flex-1 rounded-2xl bg-amber-500 px-6 py-3.5 text-sm font-extrabold text-white transition hover:bg-amber-600"
            >
              ادامه خرید
            </Link>
            <Link
              to="/"
              className="flex-1 rounded-2xl bg-stone-100 px-6 py-3.5 text-sm font-extrabold text-slate-700 transition hover:bg-stone-200"
            >
              بازگشت به خانه
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <h1 className="text-center text-2xl font-black text-slate-900">تسویه حساب</h1>

      {/* step indicator */}
      <ol className="mx-auto mt-6 flex max-w-xl items-center" aria-label="مراحل تسویه">
        {STEPS.map((s, i) => (
          <li key={s.id} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full text-sm font-black',
                  i < stepIndex && 'bg-emerald-500 text-white',
                  i === stepIndex && 'bg-amber-500 text-white shadow-md shadow-amber-200',
                  i > stepIndex && 'bg-stone-200 text-slate-500',
                )}
                aria-current={i === stepIndex ? 'step' : undefined}
              >
                {i < stepIndex ? '✓' : formatNumber(i + 1)}
              </span>
              <span className={cn('text-[11px] font-bold', i === stepIndex ? 'text-amber-700' : 'text-slate-400')}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('mx-2 mb-6 h-0.5 flex-1 rounded', i < stepIndex ? 'bg-emerald-400' : 'bg-stone-200')} aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* form */}
        <div className="h-fit rounded-3xl bg-white p-5 shadow-md shadow-stone-200/60 sm:p-6">
          {step === 'customer' && (
            <div className="animate-fade-up space-y-4">
              <h2 className="font-extrabold text-slate-800">مشخصات تحویل‌گیرنده</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="mb-1.5 block text-xs font-bold text-slate-600">نام *</label>
                  <input
                    id="firstName"
                    value={customer.firstName}
                    onChange={(e) => setCustomer({ ...customer, firstName: e.target.value })}
                    placeholder="مثلاً سارا"
                    className={inputClass(Boolean(fieldErrors.firstName))}
                    autoComplete="given-name"
                  />
                  {fieldErrors.firstName && <p className="mt-1 text-[11px] font-bold text-red-600">{fieldErrors.firstName}</p>}
                </div>
                <div>
                  <label htmlFor="lastName" className="mb-1.5 block text-xs font-bold text-slate-600">نام خانوادگی *</label>
                  <input
                    id="lastName"
                    value={customer.lastName}
                    onChange={(e) => setCustomer({ ...customer, lastName: e.target.value })}
                    placeholder="مثلاً محمدی"
                    className={inputClass(Boolean(fieldErrors.lastName))}
                    autoComplete="family-name"
                  />
                  {fieldErrors.lastName && <p className="mt-1 text-[11px] font-bold text-red-600">{fieldErrors.lastName}</p>}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="phone" className="mb-1.5 block text-xs font-bold text-slate-600">شماره موبایل *</label>
                  <input
                    id="phone"
                    value={customer.phone}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                    placeholder="09123456789"
                    inputMode="tel"
                    dir="ltr"
                    className={cn(inputClass(Boolean(fieldErrors.phone)), 'text-left')}
                    autoComplete="tel"
                  />
                  {fieldErrors.phone && <p className="mt-1 text-[11px] font-bold text-red-600">{fieldErrors.phone}</p>}
                </div>
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-xs font-bold text-slate-600">ایمیل (اختیاری)</label>
                  <input
                    id="email"
                    value={customer.email}
                    onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                    placeholder="you@example.com"
                    inputMode="email"
                    dir="ltr"
                    className={cn(inputClass(Boolean(fieldErrors.email)), 'text-left')}
                    autoComplete="email"
                  />
                  {fieldErrors.email && <p className="mt-1 text-[11px] font-bold text-red-600">{fieldErrors.email}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={goNext}
                className="w-full rounded-2xl bg-amber-500 px-6 py-4 text-sm font-extrabold text-white shadow-lg shadow-amber-200 transition hover:bg-amber-600 active:scale-[0.99]"
              >
                ادامه به مرحله نشانی
              </button>
            </div>
          )}

          {step === 'address' && (
            <div className="animate-fade-up space-y-4">
              <h2 className="font-extrabold text-slate-800">نشانی ارسال</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="province" className="mb-1.5 block text-xs font-bold text-slate-600">استان *</label>
                  <input
                    id="province"
                    value={address.province}
                    onChange={(e) => setAddress({ ...address, province: e.target.value })}
                    placeholder="مثلاً تهران"
                    className={inputClass(Boolean(fieldErrors.province))}
                    autoComplete="address-level1"
                  />
                  {fieldErrors.province && <p className="mt-1 text-[11px] font-bold text-red-600">{fieldErrors.province}</p>}
                </div>
                <div>
                  <label htmlFor="city" className="mb-1.5 block text-xs font-bold text-slate-600">شهر *</label>
                  <input
                    id="city"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    placeholder="مثلاً تهران"
                    className={inputClass(Boolean(fieldErrors.city))}
                    autoComplete="address-level2"
                  />
                  {fieldErrors.city && <p className="mt-1 text-[11px] font-bold text-red-600">{fieldErrors.city}</p>}
                </div>
              </div>
              <div>
                <label htmlFor="street" className="mb-1.5 block text-xs font-bold text-slate-600">نشانی دقیق *</label>
                <textarea
                  id="street"
                  value={address.address}
                  onChange={(e) => setAddress({ ...address, address: e.target.value })}
                  placeholder="خیابان، کوچه، پلاک، واحد"
                  rows={3}
                  className={cn(inputClass(Boolean(fieldErrors.address)), 'resize-none')}
                  autoComplete="street-address"
                />
                {fieldErrors.address && <p className="mt-1 text-[11px] font-bold text-red-600">{fieldErrors.address}</p>}
              </div>
              <div>
                <label htmlFor="postalCode" className="mb-1.5 block text-xs font-bold text-slate-600">کد پستی *</label>
                <input
                  id="postalCode"
                  value={address.postalCode}
                  onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                  placeholder="۱۰ رقم"
                  inputMode="numeric"
                  dir="ltr"
                  className={cn(inputClass(Boolean(fieldErrors.postalCode)), 'text-left sm:max-w-xs')}
                  autoComplete="postal-code"
                />
                {fieldErrors.postalCode && <p className="mt-1 text-[11px] font-bold text-red-600">{fieldErrors.postalCode}</p>}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={goBack}
                  className="rounded-2xl bg-stone-100 px-6 py-4 text-sm font-extrabold text-slate-700 transition hover:bg-stone-200 sm:w-40"
                >
                  بازگشت
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="flex-1 rounded-2xl bg-amber-500 px-6 py-4 text-sm font-extrabold text-white shadow-lg shadow-amber-200 transition hover:bg-amber-600 active:scale-[0.99]"
                >
                  ادامه به مرحله پرداخت
                </button>
              </div>
            </div>
          )}

          {step === 'payment' && (
            <div className="animate-fade-up space-y-4">
              <h2 className="font-extrabold text-slate-800">روش ارسال و پرداخت</h2>
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="روش ارسال">
                <button
                  type="button"
                  role="radio"
                  aria-checked={shippingMethod === 'standard'}
                  onClick={() => setShippingMethod('standard')}
                  className={cn(
                    'rounded-2xl border-2 p-4 text-right transition',
                    shippingMethod === 'standard' ? 'border-amber-500 bg-amber-50' : 'border-stone-200 hover:border-amber-300',
                  )}
                >
                  <span className="block text-sm font-extrabold text-slate-800">ارسال استاندارد</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {isShippingFree ? 'رایگان' : formatPrice(SHIPPING_COST_STANDARD)}
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={shippingMethod === 'express'}
                  onClick={() => setShippingMethod('express')}
                  className={cn(
                    'rounded-2xl border-2 p-4 text-right transition',
                    shippingMethod === 'express' ? 'border-amber-500 bg-amber-50' : 'border-stone-200 hover:border-amber-300',
                  )}
                >
                  <span className="block text-sm font-extrabold text-slate-800">ارسال سریع</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {isShippingFree ? 'رایگان' : formatPrice(SHIPPING_COST_EXPRESS)}
                  </span>
                </button>
              </div>

              <p className="rounded-2xl bg-stone-50 px-4 py-3 text-xs leading-6 text-slate-500">
                {apiConfigured
                  ? 'پس از ثبت سفارش، برای پرداخت امن به درگاه بانکی منتقل می‌شوید.'
                  : 'درگاه پرداخت اینترنتی هنوز متصل نشده است؛ سفارش شما به‌صورت آزمایشی ثبت و نمایش داده می‌شود.'}
              </p>

              {gatewayError && (
                <p className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-bold leading-6 text-red-600">{gatewayError}</p>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={placing}
                  className="rounded-2xl bg-stone-100 px-6 py-4 text-sm font-extrabold text-slate-700 transition hover:bg-stone-200 disabled:opacity-50 sm:w-40"
                >
                  بازگشت
                </button>
                <button
                  type="button"
                  onClick={placeOrder}
                  disabled={placing || lines.length === 0}
                  className="flex-1 rounded-2xl bg-emerald-600 px-6 py-4 text-sm font-extrabold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
                >
                  {placing ? 'در حال ثبت سفارش…' : `پرداخت و ثبت سفارش · ${formatPrice(total)}`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* summary */}
        <aside className="h-fit space-y-4 rounded-3xl bg-white p-5 shadow-md shadow-stone-200/60 lg:sticky lg:top-24">
          <h2 className="font-extrabold text-slate-800">خلاصه سفارش</h2>
          <FreeShippingProgress subtotal={subtotal} />
          <ul className="max-h-64 space-y-2.5 overflow-auto border-t border-stone-100 pt-4 text-xs">
            {lines.map((line) => (
              <li key={line.key} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-semibold text-slate-600">
                  {line.name} <span className="text-slate-400">({line.weight} × {formatNumber(line.qty)})</span>
                </span>
                <span className="shrink-0 font-bold text-slate-800">{formatPrice(line.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-2.5 border-t border-stone-100 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="font-semibold text-slate-500">جمع اقلام</dt>
              <dd className="font-bold text-slate-800">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="font-semibold text-slate-500">هزینه ارسال</dt>
              <dd className="font-bold text-slate-800">
                {effectiveShipping === 0 ? <span className="text-emerald-600">رایگان</span> : formatPrice(effectiveShipping)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-stone-100 pt-3 text-base">
              <dt className="font-extrabold text-slate-800">جمع کل</dt>
              <dd className="font-black text-amber-700">{formatPrice(total)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
