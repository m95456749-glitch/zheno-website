// ============================================================
// ZHINO — home page (data-driven sections)
// ============================================================

import { Link } from 'react-router-dom';
import { FLAVORS, PRODUCTS, getFlavor } from '../data/products';
import { RECIPES } from '../data/recipes';
import { formatNumber } from '../utils/format';
import { soundService } from '../services/soundService';
import ProductCard from '../components/ProductCard';
import ProductVisual from '../components/ProductVisual';

const WHY_ITEMS = [
  {
    title: 'طعم‌های اصیل و متنوع',
    text: '۸ طعم پودر ژله و ۷ طعم پودر کاستارد، از انار و آلبالو تا محلبی وانیلی ویژه.',
    icon: (
      <path d="M12 3c-4 0-7 3-7 7 0 2.5 1.2 4.2 3 5.2V18a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.8c1.8-1 3-2.7 3-5.2 0-4-3-7-7-7Z" />
    ),
  },
  {
    title: 'بسته‌بندی ۲۵۰ گرمی',
    text: 'وزن استاندارد و به‌صرفه برای مصرف خانگی و مهمانی‌ها.',
    icon: (
      <path d="M4 8l8-4 8 4v8l-8 4-8-4V8Z M4 8l8 4 8-4 M12 12v8" />
    ),
  },
  {
    title: 'دستورهای اختصاصی',
    text: 'از ژله رنگین‌کمانی تا ترایفل محلبی؛ با دستورهای ژینو بدرخشید.',
    icon: (
      <path d="M5 3h11a1 1 0 0 1 1 1v16l-5-3.5L7 20l-2-1.4V4a1 1 0 0 1 1-1Z M9 8h6M9 12h6" />
    ),
  },
  {
    title: 'خرید آسان',
    text: 'سبد خرید سریع، پیگیری پیشرفت ارسال رایگان و تسویه قدم‌به‌قدم.',
    icon: (
      <path d="M3 4h2l2.4 9.2a1 1 0 0 0 1 .8h6.9a1 1 0 0 0 1-.8L17.5 7H6 M9.5 17h.01M15 17h.01" />
    ),
  },
];

export default function HomePage() {
  const jellyCount = PRODUCTS.filter((p) => p.category === 'jelly').length;
  const custardCount = PRODUCTS.filter((p) => p.category === 'custard').length;
  const featured = PRODUCTS.filter((p) => p.featured);
  const heroFlavors = ['strawberry-j', 'banana', 'mahlab-vanilla'] as const;
  const recipeTeaser = RECIPES.slice(0, 2);

  const playPrimary = () => soundService.play('primaryButton');

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-orange-200/40 blur-3xl" aria-hidden="true" />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-12 sm:px-6 lg:grid-cols-2 lg:pt-16">
          <div className="animate-fade-up">
            <span className="inline-block rounded-full bg-amber-100 px-4 py-1.5 text-xs font-extrabold text-amber-800">
              کیفیت واقعی، انتخاب ژینو
            </span>
            <h1 className="mt-4 text-3xl font-black leading-[1.4] text-slate-900 sm:text-4xl sm:leading-[1.5] lg:text-[2.75rem]">
              پودر ژله و کاستارد ژینو؛
              <span className="text-amber-600"> {formatNumber(Object.keys(FLAVORS).length)} طعم اصیل</span> برای
              لحظه‌های شیرین شما
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-8 text-slate-500 sm:text-base">
              {formatNumber(jellyCount)} طعم پودر ژله و {formatNumber(custardCount)} طعم پودر کاستارد در
              بسته‌بندی {formatNumber(250)} گرمی؛ از انار و آلبالو تا محلبی وانیلی ویژه.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/products"
                onClick={playPrimary}
                className="rounded-2xl bg-amber-500 px-7 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-amber-200 transition hover:bg-amber-600 active:scale-95"
              >
                مشاهده محصولات
              </Link>
              <Link
                to="/recipes"
                onClick={playPrimary}
                className="rounded-2xl bg-white px-7 py-3.5 text-sm font-extrabold text-slate-700 shadow-md shadow-stone-200 transition hover:bg-amber-50 hover:text-amber-800 active:scale-95"
              >
                دستورهای خوشمزه
              </Link>
            </div>
          </div>

          <div className="relative grid grid-cols-3 gap-3 sm:gap-4" aria-hidden="true">
            {heroFlavors.map((flavorId, i) => {
              const flavor = getFlavor(flavorId);
              return (
                <div
                  key={flavorId}
                  className={`animate-float ${i === 1 ? 'mt-8' : ''}`}
                  style={{ animationDelay: `${i * 0.7}s` }}
                >
                  <ProductVisual
                    color={flavor.color}
                    emoji={flavor.emoji}
                    name={flavor.name}
                    className="aspect-[3/4] w-full rounded-3xl shadow-xl"
                    emojiClassName="text-4xl sm:text-6xl"
                  />
                  <p className="mt-2 text-center text-xs font-bold text-slate-500">{flavor.name}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Categories ───────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6" aria-label="دسته‌بندی محصولات">
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            to="/products?category=jelly"
            onClick={playPrimary}
            className="group overflow-hidden rounded-3xl bg-gradient-to-l from-rose-600 to-pink-500 p-6 text-white shadow-lg transition hover:shadow-xl sm:p-8"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black sm:text-2xl">پودر ژله</h2>
                <p className="mt-1 text-sm text-white/85">{formatNumber(jellyCount)} طعم میوه‌ای</p>
              </div>
              <span className="text-5xl transition-transform duration-300 group-hover:scale-125" aria-hidden="true">🍓</span>
            </div>
            <span className="mt-4 inline-block rounded-full bg-white/20 px-4 py-2 text-xs font-bold backdrop-blur transition group-hover:bg-white/30">
              مشاهده طعم‌ها ←
            </span>
          </Link>
          <Link
            to="/products?category=custard"
            onClick={playPrimary}
            className="group overflow-hidden rounded-3xl bg-gradient-to-l from-amber-600 to-yellow-500 p-6 text-white shadow-lg transition hover:shadow-xl sm:p-8"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black sm:text-2xl">پودر کاستارد</h2>
                <p className="mt-1 text-sm text-white/85">{formatNumber(custardCount)} طعم لذیذ</p>
              </div>
              <span className="text-5xl transition-transform duration-300 group-hover:scale-125" aria-hidden="true">🍮</span>
            </div>
            <span className="mt-4 inline-block rounded-full bg-white/20 px-4 py-2 text-xs font-bold backdrop-blur transition group-hover:bg-white/30">
              مشاهده طعم‌ها ←
            </span>
          </Link>
        </div>
      </section>

      {/* ── Featured products ────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6" aria-label="پیشنهادهای ژینو">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900 sm:text-2xl">پیشنهادهای ژینو</h2>
            <p className="mt-1 text-sm text-slate-500">محبوب‌ترین طعم‌ها به انتخاب مشتریان</p>
          </div>
          <Link to="/products" className="shrink-0 rounded-full bg-stone-100 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-amber-100 hover:text-amber-800">
            همه محصولات ←
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* ── Why ZHINO ────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6" aria-label="چرا ژینو">
        <h2 className="mb-6 text-center text-xl font-black text-slate-900 sm:text-2xl">چرا ژینو؟</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WHY_ITEMS.map((item) => (
            <div key={item.title} className="rounded-3xl bg-white p-6 shadow-md shadow-stone-200/60 transition hover:-translate-y-1 hover:shadow-lg">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
                  {item.icon}
                </svg>
              </span>
              <h3 className="mb-1.5 font-extrabold text-slate-800">{item.title}</h3>
              <p className="text-xs leading-6 text-slate-500">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Recipes teaser ───────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6" aria-label="دستورهای پیشنهادی">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900 sm:text-2xl">با ژینو چی درست کنیم؟</h2>
            <p className="mt-1 text-sm text-slate-500">دستورهای اختصاصی دسر با محصولات ژینو</p>
          </div>
          <Link to="/recipes" className="shrink-0 rounded-full bg-stone-100 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-amber-100 hover:text-amber-800">
            همه دستورها ←
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {recipeTeaser.map((recipe) => (
            <Link
              key={recipe.id}
              to="/recipes"
              className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-md shadow-stone-200/60 transition hover:-translate-y-1 hover:shadow-lg"
            >
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-4xl" aria-hidden="true">
                {recipe.emoji}
              </span>
              <span>
                <span className="block font-extrabold text-slate-800">{recipe.title}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{recipe.subtitle}</span>
                <span className="mt-1.5 block text-[11px] font-bold text-amber-700">
                  {recipe.duration} · {recipe.servings}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6" aria-label="درباره ژینو">
        <div className="glass-dark overflow-hidden rounded-3xl p-8 text-center text-white sm:p-12">
          <h2 className="text-xl font-black sm:text-2xl">داستان ژینو را بشناسید</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-300">
            ما باور داریم کیفیت واقعی، انتخاب اول هر خانواده است. با ژینو، هر دسر یک خاطره شیرین می‌شود.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/about"
              onClick={playPrimary}
              className="rounded-2xl bg-amber-500 px-7 py-3 text-sm font-extrabold text-white transition hover:bg-amber-400 active:scale-95"
            >
              درباره ما
            </Link>
            <Link
              to="/contact"
              onClick={playPrimary}
              className="rounded-2xl border border-white/25 px-7 py-3 text-sm font-extrabold text-white transition hover:bg-white/10 active:scale-95"
            >
              تماس با ما
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
