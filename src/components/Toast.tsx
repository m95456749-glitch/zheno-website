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
      className="animate-toast-in fixed bottom-6 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 overflow-hidden rounded-xl bg-noir px-4 py-3.5 text-cream-50 shadow-2xl shadow-wine-950/40 ring-1 ring-gold-400/30"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wine-800 text-gold-300 ring-1 ring-gold-400/40">
        <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
          <path
            d="M4 10.5 8.5 15 16 6"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <p className="flex-1 text-sm font-medium leading-7">{toast}</p>
      <button
        type="button"
        onClick={dismissToast}
        aria-label="بستن پیام"
        className="shrink-0 rounded-full p-1 text-cream-100/60 transition hover:bg-cream-50/10 hover:text-cream-50"
      >
        <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
