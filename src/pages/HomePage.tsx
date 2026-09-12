// ============================================================
// ZHINO — home page (compact, product-first)
// A short premium hero (burgundy backdrop + the real
// finished-dessert photo slideshow) flows
// straight into ALL 22 products — the real content of the
// page. Below the grid: a compact flavor index (#flavors),
// the official recipes, and a small about/contact seam.
// ============================================================

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { FLAVORS, getFlavor } from '../data/products';
// product list + recipe list go through the shared services
// (admin overlay aware — identical output until an admin changes something)
import { useCatalog } from '../services/catalog';
import { useActiveRecipes } from '../services/recipeStore';
import { formatNumber } from '../utils/format';
import { soundService } from '../services/soundService';
import ProductCard from '../components/ProductCard';
import ProductVisual from '../components/ProductVisual';
import { useReveal } from '../hooks/useReveal';
import { withSiteBase } from '../utils/siteBase';
import { cn } from '../utils/cn';

const HERO_BG_URL = `url("${withSiteBase('images/hero-bg.jpg')}")`;

// Hero slideshow — FINISHED / PREPARED desserts only.
// These are the owner's 9 real finished-dessert photos (audit-verified),
// shot in one Android session on 2026-09-03 00:17–00:19. They are the ONLY
// images used in the Hero frame. Four files had blank outer chrome baked
// in (002041's side bars + white strips; thin white edge bands on
// 002115/002139/002159) — only those empty outer bands were trimmed, the
// dessert photographs themselves are untouched (same pixels, same EXIF
// provenance, dimensions updated below).
// Never used here:
//   - images/products/*        → powder-in-glass package shots (product cards only)
//   - jelly-powder-hero.jpg    → no camera provenance; encoder fingerprint identical
//                                to the generated showcase set (excluded by the owner)
//   - hero-dish.jpg, showcase/ → generated stills, retired from the Hero
// Slides keep each file's true pixel size so the browser can reserve
// layout; the frame itself contain-fits them without cropping,
// stretching or re-encoding the files.
const HERO_SLIDES = [
  {
    src: withSiteBase('images/IMG_20260903_002041.jpg'),
    alt: 'دسر آمادهٔ کهربایی‌رنگ با جزئیات سفید؛ عکس واقعی از دسرهای ژینو',
    width: 890,
    height: 873,
  },
  {
    src: withSiteBase('images/IMG_20260903_002115.jpg'),
    alt: 'دسر زرد آماده؛ عکس واقعی از دسرهای ژینو',
    width: 880,
    height: 858,
  },
  {
    src: withSiteBase('images/IMG_20260903_002139.jpg'),
    alt: 'دسر دو رنگ سبز و کهربایی در صحنه‌ای تیره؛ عکس واقعی از دسرهای ژینو',
    width: 882,
    height: 863,
  },
  {
    src: withSiteBase('images/IMG_20260903_002159.jpg'),
    alt: 'دسر قرمز روشن آماده؛ عکس واقعی از دسرهای ژینو',
    width: 877,
    height: 868,
  },
  {
    src: withSiteBase('images/IMG_20260903_002226.jpg'),
    alt: 'دسر قرمز تیره در پس‌زمینه‌ای تیره؛ عکس واقعی از دسرهای ژینو',
    width: 870,
    height: 876,
  },
  {
    src: withSiteBase('images/IMG_20260903_002256.jpg'),
    alt: 'دسر نارنجی‌رنگ آماده؛ عکس واقعی از دسرهای ژینو',
    width: 835,
    height: 820,
  },
  {
    src: withSiteBase('images/IMG_20260903_002320.jpg'),
    alt: 'دسر کرمی‌رنگ با عنصر قرمز؛ عکس واقعی از دسرهای ژینو',
    width: 858,
    height: 853,
  },
  {
    src: withSiteBase('images/IMG_20260903_002353.jpg'),
    alt: 'دسر آبی‌رنگ آماده؛ عکس واقعی از دسرهای ژینو',
    width: 856,
    height: 835,
  },
  {
    src: withSiteBase('images/IMG_20260903_002418.jpg'),
    alt: 'دسر سرخ تیره در صحنه‌ای تاریک؛ عکس واقعی از دسرهای ژینو',
    width: 851,
    height: 862,
  },
] as const;

const HERO_SLIDE_MS = 3000;

export default function HomePage() {
  const products = useCatalog();
  const jellyProducts = products.filter((p) => p.category === 'jelly');
  const custardProducts = products.filter((p) => p.category === 'custard');
  const recipes = useActiveRecipes();
  const heroTrio = ['strawberry-j', 'banana', 'mahlab-vanilla'] as const;

  const jellyFlavors = Object.values(FLAVORS).filter((f) => f.category === 'jelly');
  const custardFlavors = Object.values(FLAVORS).filter((f) => f.category === 'custard');

  // Slideshow: one still at a time, rotating every 3 s automatically.
  // A slide that fails to load is dropped from the rotation; if none
  // remain, the compact tasting trio stands in (as before).
  const [activeSlide, setActiveSlide] = useState(0);
  const [brokenSlides, setBrokenSlides] = useState<ReadonlySet<string>>(new Set());
  const heroSlides = HERO_SLIDES.filter((slide) => !brokenSlides.has(slide.src));
  const slideCount = heroSlides.length;
  const slideIndex = slideCount > 0 ? activeSlide % slideCount : 0;

  useEffect(() => {
    if (slideCount < 2) return;
    const id = setInterval(() => setActiveSlide((i) => (i + 1) % slideCount), HERO_SLIDE_MS);
    return () => clearInterval(id);
  }, [slideCount]);

  const markSlideBroken = (src: string) =>
    setBrokenSlides((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));

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
        {/* IMAGE 1 — burgundy backdrop photo over silk */}
        <div className="hero-silk grain absolute inset-0 -z-30" aria-hidden="true" />
        <div
          className="hero-photo absolute -inset-[4%] -z-20"
          style={{ '--hero-img': HERO_BG_URL } as CSSProperties}
          aria-hidden="true"
        />
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

          {/* IMAGE 2 — finished-dessert slideshow (compact fixed frame).
              The frame is square because the 9 real photos are ~1:1
              (851×862 … 835×820): matching the frame aspect to the photo
              footprint lets object-contain fill it edge-to-edge, so no
              dead bands remain around the dessert at any breakpoint. */}
          <figure className="mt-5 lg:mt-0" style={{ '--rise-delay': '0.26s' } as CSSProperties}>
            {slideCount > 0 ? (
              <div className="frame-lux mx-auto w-full max-w-[15.5rem] sm:max-w-[18rem] lg:max-w-[26rem]">
                <div className="relative overflow-hidden rounded-2xl shadow-[0_24px_56px_-28px_rgba(0,0,0,0.55)]">
                  <div
                    role="group"
                    aria-label="دسرهای آماده‌شده از پودر ژله و کاستر ژینو"
                    className="relative aspect-square w-full bg-[radial-gradient(135%_110%_at_50%_0%,#4a1522_0%,#2a0b12_50%,#1d070c_100%)]"
                  >
                    {heroSlides.map((slide, i) => (
                      <img
                        key={slide.src}
                        src={slide.src}
                        alt={slide.alt}
                        width={slide.width}
                        height={slide.height}
                        loading={i === 0 ? 'eager' : 'lazy'}
                        decoding="async"
                        onError={() => markSlideBroken(slide.src)}
                        aria-hidden={i !== slideIndex}
                        className={cn(
                          'absolute inset-0 h-full w-full object-contain transition-opacity duration-700 ease-in-out motion-reduce:transition-none',
                          i === slideIndex ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    ))}
                    {slideCount > 1 && (
                      <>
                        {/* faint legibility seam under the dots only */}
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-black/30 to-transparent sm:h-10"
                        />
                        <div
                          aria-hidden="true"
                          className="absolute inset-x-0 bottom-2.5 z-10 flex items-center justify-center gap-2 sm:bottom-3.5"
                        >
                          {heroSlides.map((slide, i) => (
                            <span
                              key={slide.src}
                              className={cn(
                                'h-1 w-1 rounded-full transition-colors duration-500 motion-reduce:transition-none sm:h-1.5 sm:w-1.5',
                                i === slideIndex ? 'bg-cream-50/75' : 'bg-cream-50/30',
                              )}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="drift flex items-end justify-center gap-3 sm:gap-5">
                {heroTrio.map((flavorId, i) => {
                  const flavor = getFlavor(flavorId);
                  return (
                    <div
                      key={flavorId}
                      className={cn(
                        'frame-lux arch-sm overflow-hidden shadow-[0_40px_80px_-35px_rgba(0,0,0,0.85)]',
                        i === 1 ? 'h-44 w-[8.5rem] sm:h-56 sm:w-44' : 'h-36 w-[7rem] sm:h-48 sm:w-40',
                      )}
                    >
                      <ProductVisual
                        color={flavor.color}
                        emoji={flavor.emoji}
                        name={flavor.name}
                        className="h-full w-full"
                        emojiClassName="text-4xl sm:text-5xl"
                        compact
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <figcaption className="sr-only">
              دسرهای آماده‌شده از پودر ژله و کاستر ژینو؛ عکس‌های واقعی از دسرهای آماده.
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
            {recipes.map((recipe, i) => (
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
