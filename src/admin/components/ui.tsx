// ============================================================
// ZHINO — small shared admin UI pieces
// ============================================================

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { orderStatusLabel, type OrderStatus } from '../../services/orderStore';
import { useCatalogSync } from '../../services/catalogSync';
import { cn } from '../../utils/cn';
import { IconClose } from '../Icons';

/* ── database connection status (admin panel) ─────────────── */

/**
 * Small honest status line for the panel header.
 * Connecting is invisible to the storefront; this is the operator's
 * only view of it, so it says exactly what is happening:
 * «متصل» / «در حال همگام‌سازی» / «خطا در اتصال» / «حالت محلی».
 */
export function SyncStatusBadge() {
  const sync = useCatalogSync();
  const connected = sync.source === 'remote';
  const label = !connected
    ? 'حالت محلی (بدون دیتابیس)'
    : sync.phase === 'error'
      ? 'خطا در اتصال به دیتابیس'
      : sync.phase === 'ready' && sync.pending === 0
        ? 'متصل به دیتابیس'
        : 'در حال همگام‌سازی…';
  const tone = !connected
    ? 'adm-badge-ghost'
    : sync.phase === 'error'
      ? 'adm-badge-cancelled'
      : sync.phase === 'ready' && sync.pending === 0
        ? 'adm-badge-ok'
        : 'adm-badge-warning';
  return (
    <span
      className={cn('adm-badge', tone)}
      title={connected ? sync.projectUrl : 'localStorage / داده‌های پایه'}
    >
      {label}
    </span>
  );
}

export function SyncErrorBanner() {
  const sync = useCatalogSync();
  if (sync.source !== 'remote' || !sync.error) return null;
  return (
    <p
      role="alert"
      className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-[0.72rem] font-bold leading-6 text-red-700 ring-1 ring-red-200"
    >
      ذخیره در دیتابیس انجام نشد — {sync.error}
    </p>
  );
}

/* ── field wrapper ────────────────────────────────────────── */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <span className="adm-field-label">{label}</span>
      {children}
      {hint && !error && <p className="mt-1.5 text-[0.66rem] leading-5 text-mocha-light">{hint}</p>}
      {error && <p className="adm-error" role="alert">{error}</p>}
    </div>
  );
}

/* ── order status badge ───────────────────────────────────── */

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={cn('adm-badge', `adm-badge-${status}`)}>{orderStatusLabel(status)}</span>;
}

/* ── toggle switch ────────────────────────────────────────── */

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="adm-toggle"
    />
  );
}

/* ── empty state ──────────────────────────────────────────── */

export function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cream-100 text-wine-900/40 ring-1 ring-espresso/8">
        {icon}
      </div>
      <h3 className="mt-4 text-[0.95rem] font-bold text-wine-950">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-[0.76rem] leading-7 text-mocha">{text}</p>
    </div>
  );
}

/* ── modal ────────────────────────────────────────────────── */

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="بستن پنجره"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-noir/55 backdrop-blur-[2px]"
      />
      <div className="adm-modal relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl shadow-wine-950/40 sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-espresso/8 bg-white/95 px-5 py-4 backdrop-blur">
          <h2 className="text-base font-bold text-wine-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-mocha transition hover:bg-cream-100 hover:text-espresso"
          >
            <IconClose className="h-[1.05rem] w-[1.05rem]" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ── saved flash ──────────────────────────────────────────── */

export function SavedFlash({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p role="status" className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
      <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="m3 8.5 3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      ذخیره شد
    </p>
  );
}
