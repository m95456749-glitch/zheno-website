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
    <div className={cn('rounded-2xl border p-4', reached ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')}>
      <div className="mb-2 flex items-center justify-between gap-2 text-sm">
        <span className={cn('font-bold', reached ? 'text-emerald-700' : 'text-amber-800')}>
          {reached ? 'تبریک! ارسال سفارش شما رایگان شد' : `${formatPrice(remaining)} تا ارسال رایگان`}
        </span>
        {!reached && (
          <span className="shrink-0 text-xs font-semibold text-amber-700/70">{formatPrice(FREE_SHIPPING_THRESHOLD)}</span>
        )}
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-white/80"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="پیشرفت به سمت ارسال رایگان"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            reached ? 'bg-gradient-to-l from-emerald-400 to-emerald-600' : 'bg-gradient-to-l from-amber-400 to-orange-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
