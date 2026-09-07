// ============================================================
// ZHINO — free-shipping progress bar
// ============================================================

import { FREE_SHIPPING_THRESHOLD } from '../data/products';
import { formatPrice } from '../utils/format';
import { cn } from '../utils/cn';

export default function FreeShippingProgress({ subtotal }: { subtotal: number }) {
  const reached = subtotal >= FREE_SHIPPING_THRESHOLD;
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const pct = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));

  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        reached ? 'border-emerald-300/60 bg-emerald-50/80' : 'border-gold-500/30 bg-cream-100/80',
      )}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2 text-sm">
        <span className={cn('font-semibold', reached ? 'text-emerald-800' : 'text-wine-900')}>
          <span aria-hidden="true" className="ml-1.5">
            {reached ? '✦' : '◆'}
          </span>
          {reached ? 'تبریک! ارسال سفارش شما رایگان شد' : `${formatPrice(remaining)} تا ارسال رایگان`}
        </span>
        {!reached && (
          <span className="shrink-0 text-[0.62rem] font-semibold text-gold-700">
            {formatPrice(FREE_SHIPPING_THRESHOLD)}
          </span>
        )}
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-cream-200 ring-1 ring-inset ring-espresso/5"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="پیشرفت به سمت ارسال رایگان"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700 ease-out',
            reached ? 'bg-gradient-to-l from-emerald-400 to-emerald-600' : 'bg-gradient-to-l from-gold-400 to-wine-700',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
