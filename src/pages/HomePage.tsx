// ============================================================
// ZHINO — home page (data-driven sections)
// Hero: cinematic burgundy backdrop (public/images/hero-bg.jpg)
// + editorial dessert focal (public/images/hero-dish.jpg).
// When the photo files are absent, layered CSS treatments stand
// in so the Hero never looks broken.
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

const WHY_ITEMS = [
  {
    no: '۰۱',
    title: 'طعم‌های اصیل و متنوع',
    text: '۸ طعم پودر ژله و ۷ طعم پودر کاستارد، از انار و آلبالو تا محلبی وانیلی ویژه.',
  },
  {
    no: '۰۲',
    title: 'بسته‌بندی ۲۵۰ گرمی',
    text: 'وزن استاندارد و به‌صرفه برای مصرف خانگی و مهمانی‌ها.',
  },
  {
    no: '۰۳',
    title: 'دستورهای اختصاصی',
    text: 'از ژله رنگین‌کمانی تا ترایفل محلبی؛ با دستورهای ژینو بدرخشید.',
  },
  {
    no: '۰۴',
    title: 'خرید آسان',
    text: 'سبد خرید سریع، پیگیری پیشرفت ارسال رایگان و تسویه قدم‌به‌قدم.',
  },
];

const HERO_BG_URL = `url("${import.meta.env.BASE_URL}images/hero-bg.jpg")`;
const HERO_DISH_URL = `${import.meta.env.BASE_URL}images/hero-dish.jpg`;

export default function HomePage() {
  const jellyCount = PRODUCTS.filter((p) => p.category === 'jelly').length;
  const custardCount = PRODUCTS.filter((p) => p.category === 'custard').length;
  const featured = PRODUCTS.filter((p) => p.featured);
  const heroFlavors = ['strawberry-j', 'banana', 'mahlab-vanilla'] as const;
  const recipeTeaser = RECIPES.slice(0, 2);

  // If the production photo is not present, fall back to the CSS composition.
  const [dishPhoto, setDishPhoto] = useState(true);

  const flavorsReveal = useReveal<HTMLDivElement>();
  const featuredReveal = useReveal<HTMLDivElement>();
  const whyReveal = useReveal<HTMLDivElement>();
  const recipesReveal = useReveal<HTMLDivElement>();

  const playPrimary = () => soundService.play('primaryButton');

  return (
    <div>
      {/* ── Hero — cinematic ────────────────────────────── */}
      <section className="relative isolate overflow-hidden bg-noir text-cream-50" aria-label="معرفی ژینو">
        {/* IMAGE 1 slot: burgundy texture; silk gradient shows through if missing */}
        <div className="hero-silk grain absolute inset-0 -z-20" aria-hidden="true" />
        <div
          className="hero-photo absolute inset-0 -z-10"
          style={{ '--hero-img': HERO_BG_URL } as CSSProperties}
          aria-hidden="true"
        />
        {/* scrims for legibility + melt into the page */}
        <div className="absolute inset-0 bg-gradient-to-l from-noir/85 via-noir/30 to-noir/55" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-noir/70 to-transparent" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-cream-50 via-cream-50/60 to-transparent" aria-hidden="true" />

        <div className="relative mx-auto grid min-h-[92svh] max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-36 pt-28 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10 lg:pb-44 lg:pt-32">
          {/* copy */}
          <div className="order-2 text-center lg:order-1 lg:text-right">
            <p className="rise flex items-center justify-center gap-3 lg:justify-start" style={{ '--rise-delay': '0.05s' } as CSSProperties}>
              <span className="text-base font-bold text-cream-50">ژینو</span>
              <span className="h-4 w-px bg-cream-50/25" aria-hidden="true" />
              <span className="kicker kicker-dark font-display">Zhino</span>
            </p>
            <h1
              className="rise mt-5 text-[2.35rem] font-light leading-[1.5] text-cream-50 sm:text-5xl sm:leading-[1.5] lg:text-[3.4rem]"
              style={{ '--rise-delay': '0.15s' } as CSSProperties}
            >
              طعمِ اصیل،
              <span className="mx-3 inline-block h-[0.55em] w-[0.55em] translate-y-[-0.05em] rotate-45 bg-gold-400 align-middle" aria-hidden="true" />
              انتخابِ <span className="font-semibold text-gold-300">متفاوت</span>
            </h1>
            <p
              className="rise mx-auto mt-5 max-w-md text-sm font-light leading-8 text-cream-200/80 sm:text-base"
              style={{ '--rise-delay': '0.3s' } as CSSProperties}
            >
              یک تجربه متفاوت از دنیای ژله و کاستارد
            </p>
            <div
              className="rise mt-9 flex flex-wrap items-center justify-center gap-3.5 lg:justify-start"
              style={{ '--rise-delay': '0.45s' } as CSSProperties}
            >
              <Link
                to="/products"
                onClick={playPrimary}
                className="btn-lux btn-gold sheen min-w-[11rem]"
              >
                مشاهده محصولات
              </Link>
              <Link to="/#flavors" onClick={playPrimary} className="btn-lux btn-line-light min-w-[11rem]">
                کشف طعم‌ها
              </Link>
            </div>
            <p
              className="rise mt-10 text-[0.72rem] font-light text-cream-200/60"
              style={{ '--rise-delay': '0.6s' } as CSSProperties}
            >
              {formatNumber(jellyCount)} طعم ژله · {formatNumber(custardCount)} طعم کاستارد · بسته ۲۵۰ گرمی
            </p>
          </div>

          {/* IMAGE 2 slot: editorial focal */}
          <figure className="relative order-1 mx-auto w-full max-w-md lg:order-2 lg:ml-auto lg:max-w-lg">
            {dishPhoto ? (
              <div className="veil-up">
                <div className="frame-lux rounded-[1.75rem]">
                  <img
                    src={HERO_DISH_URL}
                    alt="سه دسر ژله‌ای ژینو در ظرف‌های شیشه‌ای، سروشده به سبک عکاسی خوراکی"
                    width={820}
                    height={1024}
                    loading="eager"
                    decoding="async"
                    onError={() => setDishPhoto(false)}
                    className="relative block h-auto w-full rounded-[1.75rem] object-cover object-[50%_42%] shadow-[0_45px_90px_-35px_rgba(0,0,0,0.85)] ring-1 ring-cream-50/15"
                  />
                </div>
              </div>
            ) : (
              <div className="veil-up drift">
                <div className="frame-lux relative grid grid-cols-3 gap-3 rounded-[1.75rem] border border-gold-400/25 bg-wine-950/55 p-6 shadow-[0_45px_90px_-35px_rgba(0,0,0,0.85)] backdrop-blur-md sm:gap-4">
                  {heroFlavors.map((flavorId, i) => {
                    const flavor = getFlavor(flavorId);
                    return (
                      <div key={flavorId} className={i === 1 ? 'mt-8' : undefined}>
                        <ProductVisual
                          color={flavor.color}
                          emoji={flavor.emoji}
                          name={flavor.name}
                          className="aspect-[3/4.4] w-full rounded-xl shadow-2xl ring-1 ring-cream-50/10"
                          emojiClassName="text-4xl sm:text-6xl"
                        />
                        <p className="mt-2.5 text-center text-[11px] font-medium text-cream-200/75">{flavor.name}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <figcaption className="sr-only">
              دسرهای ژله‌ای ژینو در ظرف‌های شیشه‌ای؛ عکاسی خوراکی به سبک ژورنالی.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ── Categories ───────────────────────────────────── */}
      <section className="relative z-10 mx-auto -mt-20 max-w-6xl px-4 sm:px-6" aria-label="دسته‌بندی محصولات">
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          <Link
            to="/products?category=jelly"
            onClick={playPrimary}
            className="grain group relative flex items-center justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-wine-800 via-wine-900 to-noir p-7 text-cream-50 ring-1 ring-gold-400/20 transition duration-300 hover:ring-gold-400/60 hover:shadow-[0_30px_60px_-30px_rgba(54,15,27,0.7)] sm:p-9"
          >
            <div>
              <p className="kicker kicker-dark font-display">Jelly</p>
              <h2 className="mt-2.5 text-2xl font-bold sm:text-[1.7rem]">پودر ژله</h2>
              <p className="mt-2 text-sm text-cream-200/70">{formatNumber(jellyCount)} طعم میوه‌ای، روشن و زنده</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold-300 transition group-hover:gap-3.5">
                مشاهده طعم‌ها <span aria-hidden="true">←</span>
              </span>
            </div>
            <span className="text-6xl opacity-90 transition duration-500 group-hover:scale-110 group-hover:-rotate-6 sm:text-7xl" aria-hidden="true">
              🍓
            </span>
          </Link>
          <Link
            to="/products?category=custard"
            onClick={playPrimary}
            className="group relative flex items-center justify-between overflow-hidden rounded-2xl bg-cream-100 p-7 text-wine-950 ring-1 ring-gold-500/25 transition duration-300 hover:ring-gold-500/70 hover:shadow-[0_30px_60px_-35px_rgba(154,118,52,0.45)] sm:p-9"
          >
            <div>
              <p className="font-display text-[0.68rem] uppercase tracking-[0.42em] text-gold-700">Custard</p>
              <h2 className="mt-2.5 text-2xl font-bold sm:text-[1.7rem]">پودر کاستارد</h2>
              <p className="mt-2 text-sm text-mocha">{formatNumber(custardCount)} طعم مخملی و گرم</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-wine-800 transition group-hover:gap-3.5">
                مشاهده طعم‌ها <span aria-hidden="true">←</span>
              </span>
            </div>
            <span className="text-6xl opacity-90 transition duration-500 group-hover:scale-110 group-hover:rotate-6 sm:text-7xl" aria-hidden="true">
              🍮
            </span>
          </Link>
        </div>
      </section>

      {/* ── Flavors showcase ─────────────────────────────── */}
      <section id="flavors" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-24 sm:px-6" aria-label="طعم‌های ژینو">
        <div className="mb-10 text-center">
          <p className="kicker font-display">The Fifteen Flavors</p>
          <h2 className="mt-3 text-2xl font-bold text-wine-950 sm:text-[1.9rem]">دنیای طعم‌های ژینو</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-8 text-mocha">
            هر طعم، یک شخصیت؛ از ترشیِ انار تا عطرِ محلب و وانیل.
          </p>
          <span className="rule-lux mt-5" aria-hidden="true" />
        </div>
        <div ref={flavorsReveal} className="grid gap-5 lg:grid-cols-2">
          {(['jelly', 'custard'] as const).map((cat) => (
            <div key={cat} className="panel-lux rounded-2xl p-6 sm:p-8">
              <h3 className="mb-5 flex items-center justify-between text-lg font-bold text-wine-900">
                {cat === 'jelly' ? 'پودر ژله' : 'پودر کاستارد'}
                <span className="font-display text-[0.62rem] uppercase tracking-[0.4em] text-gold-700">
                  {cat === 'jelly' ? 'Jelly' : 'Custard'}
                </span>
              </h3>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {Object.values(FLAVORS)
                  .filter((f) => f.category === cat)
                  .map((flavor) => {
                    const product = PRODUCTS.find((p) => p.flavorId === flavor.id);
                    const chip = (
                      <span className="group/chip flex items-center gap-2.5 rounded-xl border border-espresso/8 bg-cream-50 px-3.5 py-3 transition duration-300 hover:border-gold-500/60 hover:bg-cream-100">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full ring-2 ring-cream-50"
                          style={{ backgroundColor: flavor.color, boxShadow: 'inset 0 0 4px rgba(0,0,0,0.35)' }}
                          aria-hidden="true"
                        />
                        <span className="truncate text-[0.82rem] font-medium text-espresso">{flavor.name}</span>
                      </span>
                    );
                    return product ? (
                      <Link key={flavor.id} to={`/products/${product.id}`} aria-label={`${flavor.name} — مشاهده محصول`} className="min-w-0">
                        {chip}
                      </Link>
                    ) : (
                      <div key={flavor.id} className="min-w-0">
                        {chip}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Featured products ────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6" aria-label="پیشنهادهای ژینو">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="kicker font-display">Signature Selection</p>
            <h2 className="mt-3 text-2xl font-bold text-wine-950 sm:text-[1.9rem]">پیشنهادهای ژینو</h2>
            <p className="mt-2 text-sm text-mocha">محبوب‌ترین طعم‌ها به انتخاب مشتریان</p>
          </div>
          <Link
            to="/products"
            className="shrink-0 rounded-lg px-4 py-2 text-xs font-semibold text-mocha ring-1 ring-espresso/12 transition hover:text-wine-900 hover:ring-gold-500/60"
          >
            همه محصولات ←
          </Link>
        </div>
        <div ref={featuredReveal} className="grid grid-cols-2 gap-3.5 sm:gap-5 lg:grid-cols-3">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* ── Why ZHINO ────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6" aria-label="چرا ژینو">
        <div className="mb-10 text-center">
          <p className="kicker font-display">Why Zhino</p>
          <h2 className="mt-3 text-2xl font-bold text-wine-950 sm:text-[1.9rem]">چرا ژینو؟</h2>
        </div>
        <div ref={whyReveal} className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {WHY_ITEMS.map((item) => (
            <div key={item.title} className="relative border-t border-espresso/10 pt-6">
              <span className="absolute -top-px right-0 h-px w-14 bg-gold-500" aria-hidden="true" />
              <p className="font-display text-sm tracking-[0.3em] text-gold-700">{item.no}</p>
              <h3 className="mt-3 font-bold text-wine-950">{item.title}</h3>
              <p className="mt-2 text-[0.82rem] leading-7 text-mocha">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Recipes teaser ───────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6" aria-label="دستورهای پیشنهادی">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="kicker font-display">From The Kitchen</p>
            <h2 className="mt-3 text-2xl font-bold text-wine-950 sm:text-[1.9rem]">با ژینو چی درست کنیم؟</h2>
            <p className="mt-2 text-sm text-mocha">دستورهای اختصاصی دسر با محصولات ژینو</p>
          </div>
          <Link
            to="/recipes"
            className="shrink-0 rounded-lg px-4 py-2 text-xs font-semibold text-mocha ring-1 ring-espresso/12 transition hover:text-wine-900 hover:ring-gold-500/60"
          >
            همه دستورها ←
          </Link>
        </div>
        <div ref={recipesReveal} className="grid gap-4 sm:grid-cols-2">
          {recipeTeaser.map((recipe) => (
            <Link
              key={recipe.id}
              to="/recipes"
              className="card-lux group flex items-center gap-5 overflow-hidden rounded-2xl p-5 sm:p-6"
            >
              <span
                className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cream-100 to-cream-200 text-4xl ring-1 ring-gold-500/25 transition duration-300 group-hover:scale-105"
                aria-hidden="true"
              >
                {recipe.emoji}
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-wine-950">{recipe.title}</span>
                <span className="mt-1 block truncate text-xs text-mocha">{recipe.subtitle}</span>
                <span className="mt-2 block text-[0.66rem] font-medium text-gold-700">
                  {recipe.duration} · {recipe.servings}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── CTA band ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6" aria-label="درباره ژینو">
        <div className="grain relative overflow-hidden rounded-[1.75rem] bg-gradient-to-bl from-wine-800 via-wine-900 to-noir px-6 py-16 text-center text-cream-50 ring-1 ring-gold-400/20 sm:px-12 sm:py-20">
          <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-l from-transparent via-gold-400/50 to-transparent" aria-hidden="true" />
          <p className="kicker kicker-dark font-display">The Zhino Story</p>
          <h2 className={cn('mx-auto mt-4 max-w-2xl text-2xl font-light leading-[1.6] sm:text-[2.1rem]')}>
            ما باور داریم کیفیت واقعی، انتخاب اول هر خانواده است؛
            <span className="block font-semibold text-gold-300">با ژینو، هر دسر یک خاطره شیرین می‌شود.</span>
          </h2>
          <div className="mt-9 flex flex-wrap justify-center gap-3.5">
            <Link to="/about" onClick={playPrimary} className="btn-lux btn-gold">
              درباره ما
            </Link>
            <Link to="/contact" onClick={playPrimary} className="btn-lux btn-line-light">
              تماس با ما
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
