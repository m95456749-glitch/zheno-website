// ============================================================
// ZHINO — site header
// Transparent overlay on the home Hero; frosted cream elsewhere
// and after scroll. Sticky cart + sound toggle + mobile sheet.
// ============================================================

import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useCartContext } from '../context/CartContext';
import { soundService } from '../services/soundService';
import { formatNumber } from '../utils/format';
import { cn } from '../utils/cn';

const NAV_ITEMS = [
  { to: '/', label: 'خانه', end: true },
  { to: '/products', label: 'محصولات', end: false },
  { to: '/#flavors', label: 'طعم‌ها', end: false, hashScroll: true },
  { to: '/recipes', label: 'دستور تهیه', end: true },
  { to: '/about', label: 'درباره', end: true },
  { to: '/contact', label: 'تماس', end: true },
];

export default function Header() {
  const { totalItems } = useCartContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(() => soundService.isEnabled());
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  const isHome = pathname === '/';

  // The overlay (transparent) state only applies on the home hero, at top.
  useEffect(() => {
    if (!isHome) {
      setScrolled(false);
      return;
    }
    const onScroll = () => setScrolled(window.scrollY > 28);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHome]);

  // close the mobile sheet whenever the route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const overlay = isHome && !scrolled && !menuOpen;

  const toggleSound = () => {
    const next = soundService.toggle();
    setSoundOn(next);
    if (next) soundService.play('primaryButton');
  };

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,border-color] duration-500',
        overlay ? 'bg-transparent' : 'frost',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        {/* brand */}
        <Link to="/" className="group flex items-center gap-3" aria-label="ژینو — صفحه اصلی">
          <span
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl text-lg font-extrabold ring-1 transition duration-300',
              overlay
                ? 'bg-wine-900/60 text-gold-300 ring-gold-400/40 backdrop-blur-md group-hover:ring-gold-300/70'
                : 'bg-wine-900 text-gold-300 ring-gold-500/30 group-hover:ring-gold-400/60',
            )}
          >
            ژ
          </span>
          <span className="leading-none">
            <span className={cn('block text-lg font-bold transition-colors', overlay ? 'text-cream-50' : 'text-wine-950')}>
              ژینو
            </span>
            <span
              className={cn(
                'mt-1 block font-display text-[0.62rem] uppercase tracking-[0.42em] transition-colors',
                overlay ? 'text-gold-300/90' : 'text-gold-700',
              )}
            >
              Zhino
            </span>
          </span>
        </Link>

        {/* desktop nav */}
        <nav className="hidden items-center gap-0.5 md:flex" aria-label="ناوبری اصلی">
          {NAV_ITEMS.map((item) =>
            item.hashScroll ? (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'relative px-3.5 py-2 text-[0.82rem] font-medium transition-colors',
                  'after:absolute after:inset-x-3.5 after:bottom-0.5 after:h-px after:origin-center after:scale-x-0 after:bg-gold-400 after:transition-transform after:duration-300 hover:after:scale-x-100',
                  overlay ? 'text-cream-100/80 hover:text-gold-300' : 'text-mocha hover:text-wine-800',
                )}
              >
                {item.label}
              </Link>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'relative px-3.5 py-2 text-[0.82rem] font-medium transition-colors',
                    'after:absolute after:inset-x-3.5 after:bottom-0.5 after:h-px after:origin-center after:transition-transform after:duration-300',
                    isActive ? 'after:scale-x-100' : 'after:scale-x-0 hover:after:scale-x-100',
                    overlay
                      ? isActive
                        ? 'text-gold-300 after:bg-gold-300'
                        : 'text-cream-100/85 after:bg-gold-300/70 hover:text-gold-200'
                      : isActive
                        ? 'text-wine-900 after:bg-wine-700'
                        : 'text-mocha after:bg-gold-500 hover:text-wine-800',
                  )
                }
              >
                {item.label}
              </NavLink>
            ),
          )}
        </nav>

        {/* actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundOn ? 'بی‌صدا کردن' : 'روشن کردن صدا'}
            aria-pressed={soundOn}
            title={soundOn ? 'بی‌صدا کردن' : 'روشن کردن صدا'}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full ring-1 transition duration-300',
              overlay
                ? 'text-cream-100/90 ring-cream-50/20 hover:bg-cream-50/10 hover:text-gold-300 hover:ring-gold-300/50'
                : 'text-mocha ring-espresso/10 hover:bg-wine-900/5 hover:text-wine-800 hover:ring-gold-500/40',
            )}
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
            className={cn(
              'relative flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition duration-300',
              overlay
                ? 'bg-cream-50/10 text-cream-50 ring-1 ring-gold-300/40 backdrop-blur-md hover:bg-gold-400/15 hover:ring-gold-300/70'
                : 'bg-wine-900 text-cream-50 shadow-md shadow-wine-900/20 hover:bg-wine-800',
            )}
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
              <span className="absolute -left-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-gold-400 px-1 text-[0.7rem] font-extrabold text-wine-950 shadow ring-2 ring-cream-50">
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
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full ring-1 transition md:hidden',
              overlay
                ? 'text-cream-50 ring-cream-50/25 hover:bg-cream-50/10'
                : 'text-wine-900 ring-espresso/10 hover:bg-wine-900/5',
            )}
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
              {menuOpen ? (
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* mobile nav sheet */}
      {menuOpen && (
        <nav
          className="page-plate dark-surface grain relative border-t border-gold-400/25 px-4 pb-6 pt-3 md:hidden"
          aria-label="ناوبری موبایل"
        >
          {NAV_ITEMS.map((item) =>
            item.hashScroll ? (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className="block rounded-xl px-4 py-3.5 text-[1.02rem] font-light text-cream-100/85 transition hover:bg-cream-50/5 hover:text-gold-300"
              >
                {item.label}
              </Link>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center justify-between rounded-xl px-4 py-3.5 text-[1.02rem] font-light text-cream-100/85 transition hover:bg-cream-50/5 hover:text-gold-300',
                    isActive ? 'bg-cream-50/8 text-gold-300' : '',
                  )
                }
              >
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
      )}
    </header>
  );
}
