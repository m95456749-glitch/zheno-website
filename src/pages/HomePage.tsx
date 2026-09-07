// ============================================================
// ZHINO — home page (data-driven, cinematic art direction v2)
// The whole above-the-fold is a framed burgundy plate:
//   IMAGE 1 slot → public/images/hero-bg.jpg  (full-bleed backdrop)
//   IMAGE 2 slot → public/images/hero-dish.jpg (arched focal)
// Sections flow as dark→cream→dark bands (page rhythm, not
// isolated cards). No marketing filler — brand lines and data only.
// ============================================================

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { FLAVORS, PRODUCTS, getFlavor } from '../data/products';
import { RECIPES } from '../data/recipes';
import { formatNumber } from '../utils/format';
import { soundService } from '../services/soundService';
import ProductCard from '../components/ProductCard';
import ProductVisual from '../components/ProductVisual';
import { useReveal } from '../hooks/useReveal';
import { cn } from '../utils/cn';

const HERO_BG_URL = `url("${import.meta.env.BASE_URL}images/hero-bg.jpg")`;
const HERO_DISH_URL = `${import.meta.env.BASE_URL}images/hero-dish.jpg`;

export default function HomePage() {
  const jellyProducts = PRODUCTS.filter((p) => p.category === 'jelly');
  const custardProducts = PRODUCTS.filter((p) => p.category === 'custard');
  const jellyCount = jellyProducts.length;
  const custardCount = custardProducts.length;
  const featured = PRODUCTS.filter((p) => p.featured);
  const heroTrio = ['strawberry-j', 'banana', 'mahlab-vanilla'] as const;
  const tickerFlavors = Object.values(FLAVORS);

  // When the production photo is absent, the framed tasting triptych stands in.
  const [dishPhoto, setDishPhoto] = useState(true);

  const menuReveal = useReveal<HTMLDivElement>();
  const featuredReveal = useReveal<HTMLDivElement>();
  const recipesReveal = useReveal<HTMLDivElement>();

  const playPrimary = () => soundService.play('primaryButton');

  return (
    <div>
      {/* ══ HERO — a framed cinematic plate ══════════════════ */}
      <section
        className="dark-surface relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-wine-950 text-cream-50"
        aria-label="معرفی ژینو"
      >
        {/* IMAGE 1 slot — burgundy texture over a slow silk gradient */}
        <div className="hero-silk grain absolute inset-0 -z-30" aria-hidden="true" />
        <div
          className="hero-photo slow-burn absolute -inset-[4%] -z-20"
          style={{ '--hero-img': HERO_BG_URL } as CSSProperties}
          aria-hidden="true"
        />
        {/* legibility scrims */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-l from-wine-950/90 via-wine-950/25 to-wine-950/45" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b from-wine-950/85 to-transparent" aria-hidden="true" />

        {/* thin gold plate frame around the whole viewport */}
        <div className="pointer-events-none absolute inset-2.5 z-10 rounded-2xl border border-gold-300/20 sm:inset-4" aria-hidden="true" />

        <div className="relative z-20 mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-10 px-7 pb-6 pt-28 sm:px-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-8 lg:pt-32">
          {/* headline block */}
          <div className="order-2 pb-4 text-center lg:order-1 lg:pb-10 lg:text-right">
            <p className="rise flex items-center justify-center gap-3.5 lg:justify-start" style={{ '--rise-delay': '0.05s' } as CSSProperties}>
              <span className="text-[1.05rem] font-bold tracking-normal">ژینو</span>
              <span className="h-4 w-px bg-gold-300/40" aria-hidden="true" />
              <span className="kicker kicker-dark font-display">Zhino</span>
            </p>

            <h1
              className="rise mt-7 text-[2.6rem] font-light leading-[1.6] sm:text-6xl sm:leading-[1.58] lg:text-[4.25rem] lg:leading-[1.5]"
              style={{ '--rise-delay': '0.18s' } as CSSProperties}
            >
              طعمِ اصیل،
              <span className="mt-1 block">
                انتخابِ <span className="font-semibold text-gold-300">متفاوت</span>
              </span>
            </h1>

            <p
              className="rise mx-auto mt-6 max-w-md text-[0.95rem] font-light leading-8 text-cream-200/75 lg:mx-0"
              style={{ '--rise-delay': '0.34s' } as CSSProperties}
            >
              یک تجربه متفاوت از دنیای ژله و کاستارد
            </p>

            <div
              className="rise mt-10 flex flex-col items-center gap-6 sm:flex-row sm:justify-center lg:items-center lg:justify-start"
              style={{ '--rise-delay': '0.5s' } as CSSProperties}
            >
              <Link to="/products" onClick={playPrimary} className="btn-lux btn-gold sheen min-w-[13rem]">
                مشاهده محصولات
              </Link>
              <Link
                to="/#flavors"
                onClick={playPrimary}
                className="group inline-flex items-center gap-2.5 border-b border-gold-300/40 pb-1.5 text-sm font-medium text-cream-100 transition hover:border-gold-300 hover:text-gold-300"
              >
                کشف طعم‌ها
                <span className="transition-transform duration-300 group-hover:-translate-x-1.5" aria-hidden="true">←</span>
              </Link>
            </div>
          </div>

          {/* IMAGE 2 slot — the arched editorial focal */}
          <figure
            className="order-1 flex justify-center lg:order-2 lg:justify-end"
            style={{ '--rise-delay': '0.3s' } as CSSProperties}
          >
            {dishPhoto ? (
              <div className="arch-unveil">
                <div className="frame-lux arch overflow-hidden">
                  <img
                    src={HERO_DISH_URL}
                    alt="سه دسر ژله‌ای ژینو در ظرف‌های شیشه‌ای؛ عکاسی خوراکی به سبک ژورنالی"
                    width={900}
                    height={1200}
                    loading="eager"
                    decoding="async"
                    onError={() => setDishPhoto(false)}
                    className="block h-[44svh] w-auto max-w-[30rem] min-w-[15rem] object-cover object-[50%_38%] shadow-[0_50px_100px_-40px_rgba(0,0,0,0.9)] sm:h-[54svh] lg:h-[64svh] lg:max-h-[48rem]"
                  />
                </div>
              </div>
            ) : (
              <div className="arch-unveil drift flex items-end justify-center gap-3 pb-2 sm:gap-5">
                {heroTrio.map((flavorId, i) => {
                  const flavor = getFlavor(flavorId);
                  return (
                    <div
                      key={flavorId}
                      className={cn(
                        'frame-lux arch overflow-hidden shadow-[0_40px_80px_-35px_rgba(0,0,0,0.85)]',
                        i === 1 ? 'w-[7.5rem] sm:w-[9.5rem]' : 'w-[6.5rem] sm:w-[8rem]',
                      )}
                    >
                      <ProductVisual
                        color={flavor.color}
                        emoji={flavor.emoji}
                        name={flavor.name}
                        className={cn('w-full', i === 1 ? 'aspect-[3/4.5]' : 'aspect-[3/4]')}
                        emojiClassName="text-4xl sm:text-5xl"
                        compact
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <figcaption className="sr-only">
              دسرهای ژله‌ای ژینو در ظرف‌های شیشه‌ای؛ عکاسی خوراکی به سبک ژورنالی.
            </figcaption>
          </figure>
        </div>

        {/* scroll cue → ticker transition */}
        <div className="relative z-20 mx-auto hidden w-full max-w-6xl justify-center px-10 pb-6 lg:flex" aria-hidden="true">
          <span className="relative block h-12 w-px overflow-hidden bg-cream-50/15">
            <span className="scroll-cue-line absolute inset-x-0 top-0 block h-5 bg-gold-400" />
          </span>
        </div>

        {/* flavor ticker — the seam between hero and page */}
        <div className="ticker-mask relative z-20 overflow-hidden border-t border-cream-50/10 bg-noir/50 py-3 backdrop-blur-sm" aria-hidden="true">
          <div className="ticker-track items-center gap-7 text-[0.72rem] font-light text-cream-100/65">
            {[0, 1].map((copy) => (
              <span key={copy} className="flex items-center gap-7" aria-hidden={copy === 1}>
                {tickerFlavors.map((f) => (
                  <span key={`${copy}-${f.id}`} className="flex shrink-0 items-center gap-7">
                    {f.name}
                    <span className="text-[0.5rem] text-gold-500/80">◆</span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ══ TWO WORLDS — categories band ═════════════════════ */}
      <section className="dark-surface relative bg-wine-900 text-cream-50" aria-label="دسته‌بندی محصولات">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-gold-400/50 to-transparent" aria-hidden="true" />
        <div className="mx-auto grid max-w-6xl grid-cols-1 md:grid-cols-2">
          {[
            {
              cat: 'jelly' as const,
              kicker: 'Jelly',
              title: 'پودر ژله',
              lead: `${formatNumber(jellyCount)} طعم میوه‌ای؛ روشن، زنده، مجلسی`,
              flavorId: 'strawberry-j' as const,
            },
            {
              cat: 'custard' as const,
              kicker: 'Custard',
              title: 'پودر کاستارد',
              lead: `${formatNumber(custardCount)} طعم مخملی؛ گرم و نوستالژیک`,
              flavorId: 'chocolate' as const,
            },
          ].map((world, i) => {
            const flavor = getFlavor(world.flavorId);
            return (
              <Link
                key={world.cat}
                to={`/products?category=${world.cat}`}
                onClick={playPrimary}
                className={cn(
                  'group relative flex items-center gap-6 px-6 py-9 transition duration-300 hover:bg-wine-800/60 sm:gap-9 sm:px-10 sm:py-12',
                  i === 1 && 'border-t border-cream-50/10 md:border-s md:border-t-0',
                )}
              >
                <span className="arch-sm shrink-0 overflow-hidden shadow-[0_24px_44px_-20px_rgba(0,0,0,0.7)] ring-1 ring-cream-50/15">
                  <ProductVisual
                    color={flavor.color}
                    emoji={flavor.emoji}
                    name={flavor.name}
                    className="h-24 w-[4.5rem] transition-transform duration-500 group-hover:scale-105 sm:h-28 sm:w-[5.25rem]"
                    emojiClassName="text-3xl sm:text-4xl"
                    compact
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="kicker kicker-dark font-display">{world.kicker}</span>
                  <span className="mt-2 block text-2xl font-light sm:text-[1.8rem]">{world.title}</span>
                  <span className="mt-1.5 block text-[0.78rem] font-light text-cream-200/65">{world.lead}</span>
                </span>
                <span className="text-lg text-gold-400/70 transition-all duration-300 group-hover:-translate-x-1.5 group-hover:text-gold-300" aria-hidden="true">
                  ←
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ══ FLAVOR MENU — the restaurant index ═══════════════ */}
      <section id="flavors" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-8 pt-20 sm:px-6 sm:pt-24" aria-label="طعم‌های ژینو">
        <div className="mb-12 text-center">
          <p className="kicker font-display">The Fifteen Flavors</p>
          <h2 className="mt-4 text-3xl font-light text-wine-950 sm:text-[2.4rem]">دنیای طعم‌های ژینو</h2>
          <p className="mx-auto mt-3.5 max-w-lg text-sm leading-8 text-mocha">
            هر طعم، یک شخصیت؛ از ترشیِ انار تا عطرِ محلب و وانیل.
          </p>
          <span className="rule-lux mt-5" aria-hidden="true" />
        </div>

        <div ref={menuReveal} className="grid gap-x-16 gap-y-12 lg:grid-cols-2">
          {[
            { no: '۰۱', title: 'پودر ژله', list: jellyProducts },
            { no: '۰۲', title: 'پودر کاستارد', list: custardProducts },
          ].map((group) => (
            <div key={group.no}>
              <h3 className="mb-4 flex items-baseline justify-between border-b border-wine-900/25 pb-4">
                <span className="text-xl font-bold text-wine-950">{group.title}</span>
                <span className="font-display text-[0.62rem] tracking-[0.35em] text-gold-600">{group.no}</span>
              </h3>
              <ul>
                {group.list.map((product) => {
                  const flavor = getFlavor(product.flavorId);
                  const variant = product.variants[0];
                  return (
                    <li key={product.id}>
                      <Link
                        to={`/products/${product.id}`}
                        className="menu-row flex items-baseline border-b border-espresso/8 py-3.5"
                      >
                        <span className="h-2 w-2 shrink-0 rotate-45 rounded-[1px]" style={{ backgroundColor: flavor.color }} aria-hidden="true" />
                        <span className="mr-2.5 whitespace-nowrap text-[0.95rem] font-medium text-espresso transition-colors hover:text-wine-700">
                          {flavor.name}
                        </span>
                        <span className="leader" aria-hidden="true" />
                        <span className="whitespace-nowrap text-[0.7rem] text-mocha">
                          {variant.weight} <span className="mx-1 text-gold-500">·</span> {formatNumber(variant.price)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ══ FEATURED — signature selection on warm canvas ═══ */}
      <section className="mt-10 bg-cream-100 py-20 sm:py-24" aria-label="پیشنهادهای ژینو">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 flex items-end justify-between gap-6">
            <div>
              <p className="kicker font-display">Signature Selection</p>
              <h2 className="mt-3.5 text-3xl font-light text-wine-950 sm:text-[2.4rem]">پیشنهادهای ژینو</h2>
              <p className="mt-2.5 text-sm text-mocha">محبوب‌ترین طعم‌ها به انتخاب مشتریان</p>
            </div>
            <Link
              to="/products"
              className="group hidden shrink-0 items-center gap-2 text-sm font-medium text-wine-900 transition hover:text-wine-700 sm:inline-flex"
            >
              همه محصولات
              <span className="transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true">←</span>
            </Link>
          </div>

          <div
            ref={featuredReveal}
            className="snap-rail -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3"
          >
            {featured.map((product) => (
              <div key={product.id} className="w-[70%] shrink-0 sm:w-auto sm:shrink">
                <ProductCard product={product} />
              </div>
            ))}
          </div>

          <Link
            to="/products"
            className="group mt-8 inline-flex items-center gap-2 text-sm font-medium text-wine-900 transition hover:text-wine-700 sm:hidden"
          >
            همه محصولات
            <span className="transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true">←</span>
          </Link>
        </div>
      </section>

      {/* ══ RECIPES — two quiet menu lines ═══════════════════ */}
      <section className="mx-auto max-w-4xl px-4 pt-20 sm:px-6 sm:pt-24" aria-label="دستورهای پیشنهادی">
        <div className="mb-6 flex items-end justify-between gap-6">
          <div>
            <p className="kicker font-display">From The Kitchen</p>
            <h2 className="mt-3.5 text-3xl font-light text-wine-950 sm:text-[2.4rem]">با ژینو چی درست کنیم؟</h2>
          </div>
          <Link
            to="/recipes"
            className="group hidden shrink-0 items-center gap-2 text-sm font-medium text-wine-900 transition hover:text-wine-700 sm:inline-flex"
          >
            همه دستورها
            <span className="transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true">←</span>
          </Link>
        </div>
        <div ref={recipesReveal} className="panel-lux rounded-xl">
          {RECIPES.slice(0, 2).map((recipe, i) => (
            <Link
              key={recipe.id}
              to="/recipes"
              className={cn(
                'group flex items-center gap-5 px-5 py-5 transition hover:bg-cream-100/70 sm:px-7',
                i === 0 && 'border-b border-espresso/8',
              )}
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cream-100 to-cream-200 text-3xl ring-1 ring-gold-500/25 transition-transform duration-300 group-hover:scale-105" aria-hidden="true">
                {recipe.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.98rem] font-medium text-wine-950">{recipe.title}</span>
                <span className="mt-0.5 block truncate text-[0.72rem] text-mocha">
                  {recipe.subtitle} <span className="mx-1 text-gold-500">·</span> {recipe.duration}
                </span>
              </span>
              <span className="text-gold-600 transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true">←</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ══ CLOSING — a thin wine seam into the story ═══════ */}
      <section className="page-plate dark-surface grain relative mt-20 overflow-hidden px-4 py-16 text-center text-cream-50 sm:mt-24 sm:py-20" aria-label="درباره ژینو">
        <p className="kicker kicker-dark font-display">The Zhino Story</p>
        <p className="mx-auto mt-5 max-w-xl text-lg font-light leading-[1.9] sm:text-2xl">
          دسر خوب، حق هر خانواده است —{' '}
          <span className="font-semibold text-gold-300">کیفیت واقعی، انتخاب ژینو.</span>
        </p>
        <div className="mt-8 flex items-center justify-center gap-8">
          <Link to="/about" onClick={playPrimary} className="group inline-flex items-center gap-2 text-sm font-medium text-cream-100 transition hover:text-gold-300">
            درباره ما
            <span className="text-gold-400/70 transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true">←</span>
          </Link>
          <span className="h-4 w-px bg-cream-50/20" aria-hidden="true" />
          <Link to="/contact" onClick={playPrimary} className="group inline-flex items-center gap-2 text-sm font-medium text-cream-100 transition hover:text-gold-300">
            تماس با ما
            <span className="text-gold-400/70 transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true">←</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
