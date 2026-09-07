// ============================================================
// ZHINO — global success toast (e.g. add-to-cart feedback)
// ============================================================

import { useEffect } from 'react';
import { useCartContext } from '../context/CartContext';

export default function Toast() {
  const { toast, dismissToast } = useCartContext();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismissToast, 3200);
    return () => window.clearTimeout(timer);
  }, [toast, dismissToast]);

  if (!toast) return null;

  return (
    <div
      role="status"
      className="animate-toast-in fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-2xl"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500">
        <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
          <path
            d="M4 10.5 8.5 15 16 6"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <p className="flex-1 text-sm font-semibold leading-6">{toast}</p>
      <button
        type="button"
        onClick={dismissToast}
        aria-label="بستن پیام"
        className="shrink-0 rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
