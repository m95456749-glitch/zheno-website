// ============================================================
// ZHINO — home page (compact, product-first)
// A short premium hero (both official photos kept) flows
// straight into ALL 22 products — the real content of the
// page. Below the grid: a compact flavor index (#flavors),
// the official recipes, and a small about/contact seam.
// ============================================================

import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { FLAVORS, PRODUCTS } from '../data/products';
import { RECIPES } from '../data/recipes';
import { formatNumber } from '../utils/format';
import { soundService } from '../services/soundService';
import ProductCard from '../components/ProductCard';
import DessertShowcase from '../components/DessertShowcase';
import { useReveal } from '../hooks/useReveal';
import { cn } from '../utils/cn';

// No hero photo layer — the CSS-only .hero-silk gradient carries the
// burgundy backdrop. Real dessert imagery lives in the showcase slider.

export default function HomePage() {
  const jellyProducts = PRODUCTS.filter((p) => p.category === 'jelly');
  const custardProducts = PRODUCTS.filter((p) => p.category === 'custard');

  const jellyFlavors = Object.values(FLAVORS).filter((f) => f.category === 'jelly');
  const custardFlavors = Object.values(FLAVORS).filter((f) => f.category === 'custard');

  const jellyReveal = useReveal<HTMLDivElement>();
  const custardReveal = useReveal<HTMLDivElement>();
  const recipesReveal = useReveal<HTMLDivElement>();

  const playPrimary = () => soundService.play('primaryButton');

  const groups = [
    {
      key: 'jelly',
      title: 'پودر ژله',
      count: jellyProducts.length,
      products: jellyProducts,
      reveal: jellyReveal,
    },
    {
      key: 'custard',
      title: 'پودر کاستر',
      count: custardProducts.length,
      products: custardProducts,
      reveal: custardReveal,
    },
  ] as const;

  return (
    <div>
      {/* ══ HERO — short cinematic opening ═══════════════════ */}
      <section
        className="hero-curve dark-surface relative isolate overflow-hidden bg-wine-950 text-cream-50"
        aria-label="معرفی ژینو"
      >
        {/* Burgundy backdrop — CSS-only silk gradient, no photo layer */}
        <div className="hero-silk grain absolute inset-0 -z-20" aria-hidden="true" />
        {/* legibility scrims */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-wine-950/85 via-wine-950/35 to-wine-950/90" aria-hidden="true" />

        {/* thin gold plate frame */}
        <div className="pointer-events-none absolute inset-2.5 z-[1] rounded-2xl border border-cream-50/12 sm:inset-4" aria-hidden="true" />

        <div className="relative z-20 mx-auto w-full max-w-6xl px-4 pb-[calc(var(--hero-curve)_+_1.75rem)] pt-[5.5rem] sm:px-6 lg:grid lg:grid-cols-[1.04fr_0.96fr] lg:items-center lg:gap-12 lg:pb-[calc(var(--hero-curve)_+_2.5rem)] lg:pt-28">
          {/* headline block */}
          <div className="text-center lg:text-right">
            <p className="rise flex items-center justify-center gap-3 lg:justify-start" style={{ '--rise-delay': '0.05s' } as CSSProperties}>
              <span className="text-[1rem] font-bold tracking-normal">ژینو</span>
              <span className="h-4 w-px bg-cream-50/35" aria-hidden="true" />
              <span className="kicker kicker-dark font-display">Zhino</span>
            </p>

            <h1
              className="rise mt-4 text-[1.8rem] font-light leading-[1.4] text-balance sm:text-4xl sm:leading-[1.35] lg:mt-5 lg:text-[3.2rem] lg:leading-[1.3]"
              style={{ '--rise-delay': '0.16s' } as CSSProperties}
            >
              طعمِ اصیل، انتخابِ <span className="font-semibold text-cream-50">متفاوت</span>
            </h1>

            <div
              className="rise mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 lg:mt-8 lg:justify-start"
              style={{ '--rise-delay': '0.42s' } as CSSProperties}
            >
              <Link to="/products" onClick={playPrimary} className="btn-lux btn-gold sheen min-w-[11rem] py-3 text-[0.85rem]">
                مشاهده محصولات
              </Link>
              <Link
                to="/#flavors"
                onClick={playPrimary}
                className="group inline-flex items-center gap-2 border-b border-cream-50/30 pb-1 text-[0.82rem] font-medium text-cream-100 transition hover:border-cream-50/70 hover:text-cream-50"
              >
                کشف طعم‌ها
                <span className="transition-transform duration-300 group-hover:-translate-x-1.5" aria-hidden="true">←</span>
              </Link>
            </div>
          </div>

          {/* IMAGE 2 — premium dessert showcase */}
          <figure className="mt-5 lg:mt-0" style={{ '--rise-delay': '0.26s' } as CSSProperties}>
            <DessertShowcase />
            <figcaption className="sr-only">
              ویترین دسرهای ژینو؛ عکاسی خوراکی به سبک ژورنالی.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ══ PRODUCTS — the main content: all 22 ══════════════ */}
      <section className="bg-cream-page" aria-label="محصولات ژینو">
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 sm:pb-16 sm:pt-16">
          <header className="text-center">
            <p className="kicker font-display">The Collection</p>
            <h2 className="mt-3 text-[1.65rem] font-light text-wine-950 sm:text-[2.1rem]">محصولات ژینو</h2>
            <span className="rule-lux mt-3.5" aria-hidden="true" />
          </header>

          {groups.map((group, gi) => (
            <div key={group.key} className={gi === 0 ? 'mt-8' : 'mt-10'}>
              <div className="flex items-center gap-3">
                <h3 className="text-[1.02rem] font-bold text-wine-950">{group.title}</h3>
                <span className="text-[0.7rem] font-medium text-mocha">{formatNumber(group.count)} طعم</span>
                <span className="h-px flex-1 bg-espresso/10" aria-hidden="true" />
              </div>

              <div
                ref={group.reveal}
                className="mt-4 grid grid-cols-2 gap-3.5 sm:gap-5 md:grid-cols-3 lg:grid-cols-4"
              >
                {group.products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ FLAVOR INDEX — compact discovery chips ══════════ */}
      <section
        id="flavors"
        className="mt-14 scroll-mt-24 bg-wine-800 py-8 text-cream-50 sm:py-10"
        aria-label="طعم‌های ژینو"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="text-[1.05rem] font-medium text-cream-50">کشف طعم‌های ژینو</h2>
            <p className="mt-1.5 text-[0.72rem] leading-6 text-cream-200/80">
              {formatNumber(jellyFlavors.length)} طعم پودر ژله
              <span className="mx-2 text-cream-200/45" aria-hidden="true">·</span>
              {formatNumber(custardFlavors.length)} طعم پودر کاستر
            </p>
          </div>

          <div className="mt-6 space-y-3.5">
            {[
              { label: 'پودر ژله', flavors: jellyFlavors },
              { label: 'پودر کاستر', flavors: custardFlavors },
            ].map((row) => (
              <div key={row.label} className="flex flex-wrap items-center justify-center gap-2">
                <span className="ml-1 text-[0.72rem] font-bold text-cream-50">{row.label}</span>
                {row.flavors.map((flavor) => (
                  <span
                    key={flavor.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-cream-50/15 bg-cream-50 px-3 py-1 text-[0.72rem] font-medium text-espresso transition hover:border-gold-400/55"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: flavor.color }}
                      aria-hidden="true"
                    />
                    {flavor.name}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ RECIPES — the two official methods ═══════════════ */}
      <section className="bg-wine-800 pb-14 pt-10 text-cream-50 sm:pb-16 sm:pt-12" aria-label="دستورهای پیشنهادی">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="kicker kicker-dark font-display">From The Kitchen</p>
              <h2 className="mt-3 text-[1.65rem] font-light text-cream-50 sm:text-[2.1rem]">دستور تهیه</h2>
            </div>
            <Link
              to="/recipes"
              className="group hidden shrink-0 items-center gap-2 text-sm font-medium text-cream-100 transition hover:text-cream-50 sm:inline-flex"
            >
              جزئیات دستورها
              <span className="transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true">←</span>
            </Link>
          </div>

          <div ref={recipesReveal} className="panel-lux mt-6 rounded-xl">
            {RECIPES.map((recipe, i) => (
              <Link
                key={recipe.id}
                to="/recipes"
                className={cn(
                  'group flex items-center gap-4 px-5 py-4 transition hover:bg-cream-100/70 sm:gap-5 sm:px-7 sm:py-5',
                  i === 0 && 'border-b border-espresso/8',
                )}
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cream-100 to-cream-200 text-2xl ring-1 ring-espresso/8 transition-transform duration-300 group-hover:scale-105 sm:h-14 sm:w-14 sm:text-3xl"
                  aria-hidden="true"
                >
                  {recipe.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.95rem] font-semibold text-wine-950 sm:text-[1rem]">{recipe.title}</span>
                  <span className="mt-0.5 block truncate text-[0.74rem] leading-6 text-mocha">
                    {recipe.summary}
                  </span>
                </span>
                <span className="text-wine-700 transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true">←</span>
              </Link>
            ))}
          </div>

          <Link
            to="/recipes"
            className="group mt-5 inline-flex items-center gap-2 text-sm font-medium text-cream-100 transition hover:text-cream-50 sm:hidden"
          >
            جزئیات دستورها
            <span className="transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true">←</span>
          </Link>
        </div>
      </section>

      {/* ══ CLOSING — a thin wine seam into the story ═══════ */}
      <section
        className="page-plate dark-surface grain relative mt-14 overflow-hidden px-4 py-10 text-center text-cream-50 sm:py-12"
        aria-label="درباره ژینو"
      >
        <p className="kicker kicker-dark font-display">The Zhino Story</p>
        <p className="mx-auto mt-4 max-w-xl text-[1.15rem] font-light leading-9 sm:text-xl sm:leading-10">
          <span className="font-semibold text-cream-50">کیفیت خوب،انتخاب ما.</span>
        </p>
        <div className="mt-6 flex items-center justify-center gap-8">
          <Link to="/about" onClick={playPrimary} className="group inline-flex items-center gap-2 text-sm font-medium text-cream-100 transition hover:text-cream-50">
            درباره ما
            <span className="text-cream-200/45 transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true">←</span>
          </Link>
          <span className="h-4 w-px bg-cream-50/20" aria-hidden="true" />
          <Link to="/contact" onClick={playPrimary} className="group inline-flex items-center gap-2 text-sm font-medium text-cream-100 transition hover:text-cream-50">
            تماس با ما
            <span className="text-cream-200/45 transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true">←</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
