// ============================================================
// ZHINO — quantity stepper (logic lives with the caller)
// ============================================================

import { formatNumber } from '../utils/format';

interface Props {
  quantity: number;
  onIncrease: () => void;
  onDecrease: () => void;
  label?: string;
}

export default function QuantitySelector({ quantity, onIncrease, onDecrease, label }: Props) {
  return (
    <div
      className="flex items-center gap-1 rounded-xl bg-cream-100 p-1 ring-1 ring-espresso/10"
      role="group"
      aria-label={label ?? 'تعداد'}
    >
      <button
        type="button"
        onClick={onIncrease}
        aria-label="زیاد کردن تعداد"
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-lg font-bold text-wine-900 shadow-sm ring-1 ring-espresso/8 transition hover:bg-gold-400 hover:text-wine-950 active:scale-95"
      >
        +
      </button>
      <span className="w-9 text-center text-sm font-bold tabular-nums text-wine-950" aria-live="polite">
        {formatNumber(quantity)}
      </span>
      <button
        type="button"
        onClick={onDecrease}
        aria-label="کم کردن تعداد"
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-lg font-bold text-wine-900 shadow-sm ring-1 ring-espresso/8 transition hover:bg-cream-200 active:scale-95"
      >
        −
      </button>
    </div>
  );
}
