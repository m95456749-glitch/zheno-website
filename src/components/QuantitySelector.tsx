import { formatNumber } from '../utils/format';

interface Props {
  quantity: number;
  onIncrease: () => void;
  onDecrease: () => void;
  label?: string;
}

export default function QuantitySelector({ quantity, onIncrease, onDecrease, label }: Props) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-stone-100 p-1" role="group" aria-label={label ?? 'تعداد'}>
      <button
        type="button"
        onClick={onDecrease}
        aria-label="کم کردن تعداد"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg font-black text-slate-700 shadow-sm transition hover:bg-amber-100 hover:text-amber-800 active:scale-95"
      >
        −
      </button>
      <span className="w-8 text-center text-sm font-extrabold tabular-nums text-slate-800">
        {formatNumber(quantity)}
      </span>
      <button
        type="button"
        onClick={onIncrease}
        aria-label="زیاد کردن تعداد"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg font-black text-slate-700 shadow-sm transition hover:bg-amber-100 hover:text-amber-800 active:scale-95"
      >
        +
      </button>
    </div>
  );
}
