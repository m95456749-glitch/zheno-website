// ============================================================
// ZHINO — admin shell
// Deep-wine navigation plate (desktop sidebar / mobile drawer)
// on a spacious ivory canvas. The storefront header, footer and
// sounds never appear inside the admin area.
// ============================================================

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAdminAuth } from './auth/AuthContext';
import { ADMIN_NAV } from './nav';
import { IconExternal, IconLogout, IconMenu } from './Icons';
import { cn } from '../utils/cn';

function Brand() {
  return (
    <Link to="/" className="group flex items-center gap-2.5" aria-label="ژینو — بازگشت به سایت">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-wine-900 text-base font-extrabold text-gold-300 ring-1 ring-cream-50/20 transition group-hover:ring-cream-50/45">
        ژ
      </span>
      <span className="leading-none">
        <span className="block text-[0.95rem] font-bold text-cream-50">ژینو</span>
        <span className="mt-1 block font-display text-[0.55rem] uppercase tracking-[0.35em] text-gold-400">
          Admin
        </span>
      </span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {ADMIN_NAV.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.to}>
            <NavLink
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) => cn('adm-nav-item', isActive && 'active')}
            >
              <Icon className="h-[1.05rem] w-[1.05rem] shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}

function DemoNote() {
  return (
    <p className="mx-1 mb-2 rounded-lg bg-gold-500/10 px-3 py-2 text-[0.64rem] leading-5 text-gold-300/90 ring-1 ring-gold-500/25">
      حالت نمایشی — احراز هویت واقعی هنوز متصل نشده است.
    </p>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { logout, isDemo } = useAdminAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();

  // scroll to top + close drawer on navigation
  useEffect(() => {
    window.scrollTo(0, 0);
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = ADMIN_NAV.find((n) => pathname.startsWith(n.to)) ?? ADMIN_NAV[0];

  return (
    <div className="min-h-screen bg-cream-page">
      {/* ── desktop sidebar ─────────────────────────────────── */}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-[17rem] lg:block" aria-label="ناوبری پنل مدیریت">
        <div className="adm-sidebar">
          <div className="px-5 pb-5 pt-6">
            <Brand />
          </div>
          <nav className="flex-1 overflow-y-auto px-3 pb-4">
            <NavList />
          </nav>
          <div className="space-y-1 border-t border-cream-50/10 px-3 py-4">
            {isDemo && <DemoNote />}
            <Link to="/" className="adm-nav-item">
              <IconExternal className="h-[1.05rem] w-[1.05rem] shrink-0" />
              <span>مشاهده سایت</span>
            </Link>
            <button type="button" onClick={logout} className="adm-nav-item">
              <IconLogout className="h-[1.05rem] w-[1.05rem] shrink-0" />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── mobile top bar ──────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-espresso/10 bg-cream-50/90 px-3 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="باز کردن منوی مدیریت"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-wine-900 ring-1 ring-espresso/12 transition hover:bg-wine-900/5"
        >
          <IconMenu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-wine-900 text-[0.8rem] font-extrabold text-gold-300">
            ژ
          </span>
          <span className="text-sm font-bold text-wine-950">پنل مدیریت</span>
        </div>
        <Link
          to="/"
          aria-label="مشاهده سایت"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-mocha ring-1 ring-espresso/12 transition hover:bg-wine-900/5 hover:text-wine-900"
        >
          <IconExternal className="h-[1.05rem] w-[1.05rem]" />
        </Link>
      </header>

      {/* ── mobile drawer ───────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="منوی مدیریت">
          <button
            type="button"
            aria-label="بستن منو"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 cursor-default bg-noir/55 backdrop-blur-[2px]"
          />
          <div className="adm-drawer">
            <div className="flex items-center justify-between px-5 pb-4 pt-5">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="بستن منو"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-cream-100/70 ring-1 ring-cream-50/15 transition hover:text-cream-50"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 pb-4">
              <NavList onNavigate={() => setDrawerOpen(false)} />
            </nav>
            <div className="space-y-1 border-t border-cream-50/10 px-3 py-4">
              {isDemo && <DemoNote />}
              <Link to="/" onClick={() => setDrawerOpen(false)} className="adm-nav-item">
                <IconExternal className="h-[1.05rem] w-[1.05rem] shrink-0" />
                <span>مشاهده سایت</span>
              </Link>
              <button type="button" onClick={logout} className="adm-nav-item">
                <IconLogout className="h-[1.05rem] w-[1.05rem] shrink-0" />
                <span>خروج</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── main content ────────────────────────────────────── */}
      <main className="lg:ms-[17rem]">
        <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-10">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-[1.45rem] font-bold text-wine-950 sm:text-[1.7rem]">{current.label}</h1>
              <span
                className="mt-2 block h-px w-14 bg-gradient-to-l from-gold-500 to-transparent"
                aria-hidden="true"
              />
            </div>
            {isDemo && (
              <span className="adm-badge-demo" title="احراز هویت واقعی متصل نیست — این نسخه فقط نمایشی است">
                نمایشی
              </span>
            )}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
