// ============================================================
// ZHINO — site header (sticky glass nav + cart badge + sound toggle)
// ============================================================

import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useCartContext } from '../context/CartContext';
import { soundService } from '../services/soundService';
import { formatNumber } from '../utils/format';
import { cn } from '../utils/cn';

const NAV_ITEMS = [
  { to: '/', label: 'خانه', end: true },
  { to: '/products', label: 'محصولات', end: false },
  { to: '/recipes', label: 'دستورها', end: true },
  { to: '/about', label: 'درباره ما', end: true },
  { to: '/contact', label: 'تماس', end: true },
];

export default function Header() {
  const { totalItems } = useCartContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(() => soundService.isEnabled());

  const toggleSound = () => {
    const next = soundService.toggle();
    setSoundOn(next);
    if (next) soundService.play('primaryButton');
  };

  return (
    <header className="glass-panel sticky top-0 z-40 shadow-sm shadow-stone-200/50">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        {/* brand */}
        <Link to="/" className="flex items-center gap-2.5" aria-label="ژینو — صفحه اصلی">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 text-xl font-black text-white shadow-md shadow-amber-200">
            ژ
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-black text-slate-800">ژینو</span>
            <span className="block text-[11px] font-semibold text-amber-700">کیفیت واقعی، انتخاب ژینو</span>
          </span>
        </Link>

        {/* desktop nav */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="ناوبری اصلی">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'rounded-full px-4 py-2 text-sm font-bold transition',
                  isActive ? 'bg-amber-100 text-amber-900' : 'text-slate-600 hover:bg-stone-100 hover:text-slate-900',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundOn ? 'بی‌صدا کردن' : 'روشن کردن صدا'}
            aria-pressed={soundOn}
            title={soundOn ? 'بی‌صدا کردن' : 'روشن کردن صدا'}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-slate-600 transition hover:bg-amber-100 hover:text-amber-800"
          >
            {soundOn ? (
              <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                <path d="M3 8v4h3l4 3.5v-11L6 8H3Z" fill="currentColor" />
                <path d="M13 7.5a3.5 3.5 0 0 1 0 5M15 5.5a6.5 6.5 0 0 1 0 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                <path d="M3 8v4h3l4 3.5v-11L6 8H3Z" fill="currentColor" />
                <path d="M13.5 8.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            )}
          </button>

          <Link
            to="/cart"
            aria-label={`سبد خرید، ${formatNumber(totalItems)} کالا`}
            className="relative flex h-10 items-center gap-2 rounded-full bg-slate-900 px-4 text-sm font-bold text-white shadow-md transition hover:bg-slate-800"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
              <path
                d="M3 4h2l2.4 9.2a1 1 0 0 0 1 .8h6.9a1 1 0 0 0 1-.8L17.5 7H6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="9.5" cy="17" r="1.2" fill="currentColor" />
              <circle cx="15" cy="17" r="1.2" fill="currentColor" />
            </svg>
            <span className="hidden sm:inline">سبد خرید</span>
            {totalItems > 0 && (
              <span className="absolute -left-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-black text-amber-950 shadow">
                {formatNumber(totalItems)}
              </span>
            )}
          </Link>

          {/* mobile menu button */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'بستن منو' : 'باز کردن منو'}
            aria-expanded={menuOpen}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-slate-700 transition hover:bg-amber-100 md:hidden"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
              {menuOpen ? (
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* mobile nav */}
      {menuOpen && (
        <nav className="border-t border-stone-200/60 bg-white/95 px-4 pb-4 pt-2 backdrop-blur md:hidden" aria-label="ناوبری موبایل">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                cn(
                  'block rounded-2xl px-4 py-3 text-sm font-bold transition',
                  isActive ? 'bg-amber-100 text-amber-900' : 'text-slate-600 hover:bg-stone-100',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}
