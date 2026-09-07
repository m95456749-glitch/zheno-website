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
import PagePlate from '../components/PagePlate';
import type { Address, CheckoutStep, Customer, ShippingMethod } from '../types';

type FormStep = Exclude<CheckoutStep, 'cart'>;

const STEPS: { id: FormStep; label: string; en: string }[] = [
  { id: 'customer', label: 'مشخصات', en: 'Details' },
  { id: 'address', label: 'نشانی', en: 'Address' },
  { id: 'payment', label: 'پرداخت', en: 'Payment' },
  { id: 'confirmation', label: 'تأیید', en: 'Confirm' },
];

/** Convert Persian/Arabic digits to Latin so validation accepts typed input. */
function toEnglishDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

const inputClass = (hasError: boolean) =>
  cn(
    'w-full rounded-xl border-2 bg-white px-4 py-3 text-sm font-semibold text-espresso outline-none transition placeholder:font-normal placeholder:text-mocha-light',
    hasError
      ? 'border-red-300 focus:border-red-400'
      : 'border-espresso/12 focus:border-gold-500 hover:border-gold-500/60',
  );

const fieldLabelClass = 'mb-1.5 block text-xs font-bold text-wine-900';
const fieldErrorClass = 'mt-1.5 text-[0.68rem] font-bold text-red-700';

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
      <div className="mx-auto max-w-xl px-4 pt-20 text-center sm:px-6">
        <div className="animate-fade-up panel-lux rounded-2xl p-8 sm:p-10">
          <span className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-300/60">
            <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#047857" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="kicker font-display">Order Confirmed</p>
          <h1 className="mt-2.5 text-xl font-bold text-wine-950">سفارش شما با موفقیت ثبت شد</h1>
          <p className="mt-2.5 text-sm leading-8 text-mocha">
            از خرید شما سپاسگزاریم! سفارش شما در حال آماده‌سازی است.
          </p>
          <p className="mt-5 rounded-xl bg-cream-100 px-4 py-3 font-display text-sm tracking-[0.2em] text-wine-900 ring-1 ring-gold-500/30" dir="ltr">
            {orderId}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link to="/products" className="btn-lux btn-wine flex-1 rounded-xl">
              ادامه خرید
            </Link>
            <Link to="/" className="btn-lux btn-line-dark flex-1 rounded-xl">
              بازگشت به خانه
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PagePlate
        kicker="Checkout"
        title="تسویه حساب"
        lead="سه گامِ کوتاه تا میزِ دسر — سریع، مطمئن، بدون شلوغی."
        ghost="Checkout"
      />
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-9 sm:px-6">
      {/* step indicator */}
      <ol className="mx-auto flex max-w-xl items-start" aria-label="مراحل تسویه">
        {STEPS.map((s, i) => (
          <li key={s.id} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full font-display text-sm transition duration-300',
                  i < stepIndex && 'bg-emerald-600 text-white ring-4 ring-emerald-100',
                  i === stepIndex && 'bg-wine-900 text-gold-300 ring-4 ring-gold-400/25 shadow-lg shadow-wine-900/25',
                  i > stepIndex && 'bg-cream-100 text-mocha ring-1 ring-espresso/10',
                )}
                aria-current={i === stepIndex ? 'step' : undefined}
              >
                {i < stepIndex ? '✓' : formatNumber(i + 1)}
              </span>
              <span className={cn('text-[0.68rem] font-bold', i === stepIndex ? 'text-wine-900' : 'text-mocha-light')}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('mx-2 mt-[0.625rem] h-0.5 flex-1 rounded', i < stepIndex ? 'bg-emerald-500' : 'bg-cream-200')} aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>

      <div className="mt-9 grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* form */}
        <div className="panel-lux h-fit rounded-2xl p-5 sm:p-7">
          {step === 'customer' && (
            <div className="animate-fade-up space-y-5">
              <h2 className="flex items-baseline gap-3 text-lg font-bold text-wine-950">
                مشخصات تحویل‌گیرنده
                <span className="font-display text-[0.6rem] uppercase tracking-[0.35em] text-gold-600">Details</span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className={fieldLabelClass}>نام *</label>
                  <input
                    id="firstName"
                    value={customer.firstName}
                    onChange={(e) => setCustomer({ ...customer, firstName: e.target.value })}
                    placeholder="مثلاً سارا"
                    className={inputClass(Boolean(fieldErrors.firstName))}
                    autoComplete="given-name"
                  />
                  {fieldErrors.firstName && <p className={fieldErrorClass}>{fieldErrors.firstName}</p>}
                </div>
                <div>
                  <label htmlFor="lastName" className={fieldLabelClass}>نام خانوادگی *</label>
                  <input
                    id="lastName"
                    value={customer.lastName}
                    onChange={(e) => setCustomer({ ...customer, lastName: e.target.value })}
                    placeholder="مثلاً محمدی"
                    className={inputClass(Boolean(fieldErrors.lastName))}
                    autoComplete="family-name"
                  />
                  {fieldErrors.lastName && <p className={fieldErrorClass}>{fieldErrors.lastName}</p>}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="phone" className={fieldLabelClass}>شماره موبایل *</label>
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
                  {fieldErrors.phone && <p className={fieldErrorClass}>{fieldErrors.phone}</p>}
                </div>
                <div>
                  <label htmlFor="email" className={fieldLabelClass}>ایمیل (اختیاری)</label>
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
                  {fieldErrors.email && <p className={fieldErrorClass}>{fieldErrors.email}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={goNext}
                className="btn-lux btn-wine w-full rounded-xl text-base"
              >
                ادامه به مرحله نشانی
              </button>
            </div>
          )}

          {step === 'address' && (
            <div className="animate-fade-up space-y-5">
              <h2 className="flex items-baseline gap-3 text-lg font-bold text-wine-950">
                نشانی ارسال
                <span className="font-display text-[0.6rem] uppercase tracking-[0.35em] text-gold-600">Address</span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="province" className={fieldLabelClass}>استان *</label>
                  <input
                    id="province"
                    value={address.province}
                    onChange={(e) => setAddress({ ...address, province: e.target.value })}
                    placeholder="مثلاً تهران"
                    className={inputClass(Boolean(fieldErrors.province))}
                    autoComplete="address-level1"
                  />
                  {fieldErrors.province && <p className={fieldErrorClass}>{fieldErrors.province}</p>}
                </div>
                <div>
                  <label htmlFor="city" className={fieldLabelClass}>شهر *</label>
                  <input
                    id="city"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    placeholder="مثلاً تهران"
                    className={inputClass(Boolean(fieldErrors.city))}
                    autoComplete="address-level2"
                  />
                  {fieldErrors.city && <p className={fieldErrorClass}>{fieldErrors.city}</p>}
                </div>
              </div>
              <div>
                <label htmlFor="street" className={fieldLabelClass}>نشانی دقیق *</label>
                <textarea
                  id="street"
                  value={address.address}
                  onChange={(e) => setAddress({ ...address, address: e.target.value })}
                  placeholder="خیابان، کوچه، پلاک، واحد"
                  rows={3}
                  className={cn(inputClass(Boolean(fieldErrors.address)), 'resize-none')}
                  autoComplete="street-address"
                />
                {fieldErrors.address && <p className={fieldErrorClass}>{fieldErrors.address}</p>}
              </div>
              <div>
                <label htmlFor="postalCode" className={fieldLabelClass}>کد پستی *</label>
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
                {fieldErrors.postalCode && <p className={fieldErrorClass}>{fieldErrors.postalCode}</p>}
              </div>
              <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                <button
                  type="button"
                  onClick={goBack}
                  className="btn-lux btn-line-dark rounded-xl sm:w-40"
                >
                  بازگشت
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="btn-lux btn-wine flex-1 rounded-xl text-base"
                >
                  ادامه به مرحله پرداخت
                </button>
              </div>
            </div>
          )}

          {step === 'payment' && (
            <div className="animate-fade-up space-y-5">
              <h2 className="flex items-baseline gap-3 text-lg font-bold text-wine-950">
                روش ارسال و پرداخت
                <span className="font-display text-[0.6rem] uppercase tracking-[0.35em] text-gold-600">Payment</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="روش ارسال">
                <button
                  type="button"
                  role="radio"
                  aria-checked={shippingMethod === 'standard'}
                  onClick={() => setShippingMethod('standard')}
                  className={cn(
                    'rounded-xl border-2 p-4 text-right transition duration-300',
                    shippingMethod === 'standard'
                      ? 'border-gold-500 bg-gold-400/10 shadow-md shadow-gold-500/10'
                      : 'border-espresso/12 hover:border-gold-500/50 hover:bg-cream-100/60',
                  )}
                >
                  <span className="block text-sm font-bold text-wine-950">ارسال استاندارد</span>
                  <span className="mt-1.5 block text-xs text-mocha">
                    {isShippingFree ? <span className="font-bold text-emerald-700">رایگان</span> : formatPrice(SHIPPING_COST_STANDARD)}
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={shippingMethod === 'express'}
                  onClick={() => setShippingMethod('express')}
                  className={cn(
                    'rounded-xl border-2 p-4 text-right transition duration-300',
                    shippingMethod === 'express'
                      ? 'border-gold-500 bg-gold-400/10 shadow-md shadow-gold-500/10'
                      : 'border-espresso/12 hover:border-gold-500/50 hover:bg-cream-100/60',
                  )}
                >
                  <span className="block text-sm font-bold text-wine-950">ارسال سریع</span>
                  <span className="mt-1.5 block text-xs text-mocha">
                    {isShippingFree ? <span className="font-bold text-emerald-700">رایگان</span> : formatPrice(SHIPPING_COST_EXPRESS)}
                  </span>
                </button>
              </div>

              <p className="rounded-xl bg-cream-100 px-4 py-3.5 text-xs leading-6 text-mocha ring-1 ring-espresso/8">
                {apiConfigured
                  ? 'پس از ثبت سفارش، برای پرداخت امن به درگاه بانکی منتقل می‌شوید.'
                  : 'درگاه پرداخت اینترنتی هنوز متصل نشده است؛ سفارش شما به‌صورت آزمایشی ثبت و نمایش داده می‌شود.'}
              </p>

              {gatewayError && (
                <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-xs font-bold leading-6 text-red-700 ring-1 ring-red-200">
                  {gatewayError}
                </p>
              )}

              <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={placing}
                  className="btn-lux btn-line-dark rounded-xl disabled:opacity-50 sm:w-40"
                >
                  بازگشت
                </button>
                <button
                  type="button"
                  onClick={placeOrder}
                  disabled={placing || lines.length === 0}
                  className="btn-lux btn-gold sheen flex-1 rounded-xl text-base disabled:cursor-wait disabled:opacity-60"
                >
                  {placing ? 'در حال ثبت سفارش…' : `پرداخت و ثبت سفارش · ${formatPrice(total)}`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* summary */}
        <aside className="panel-lux h-fit space-y-4 rounded-2xl p-5 lg:sticky lg:top-24 lg:p-6">
          <h2 className="flex items-center justify-between text-base font-bold text-wine-950">
            خلاصه سفارش
            <span className="rule-lux !w-10" aria-hidden="true" />
          </h2>
          <FreeShippingProgress subtotal={subtotal} />
          <ul className="max-h-64 space-y-2.5 overflow-auto border-t border-espresso/10 pt-4 text-xs">
            {lines.map((line) => (
              <li key={line.key} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-semibold text-espresso">
                  {line.name} <span className="text-mocha-light">({line.weight} × {formatNumber(line.qty)})</span>
                </span>
                <span className="shrink-0 font-bold text-wine-900">{formatPrice(line.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-3 border-t border-espresso/10 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-mocha">جمع اقلام</dt>
              <dd className="font-bold text-espresso">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mocha">هزینه ارسال</dt>
              <dd className="font-bold text-espresso">
                {effectiveShipping === 0 ? <span className="text-emerald-700">رایگان</span> : formatPrice(effectiveShipping)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-espresso/10 pt-4">
              <dt className="font-bold text-wine-950">جمع کل</dt>
              <dd className="text-xl font-extrabold text-wine-900">{formatPrice(total)}</dd>
            </div>
          </dl>
        </aside>
      </div>
      </div>
    </div>
  );
}
