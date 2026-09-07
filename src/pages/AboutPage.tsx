// ============================================================
// ZHINO — about page (premium storytelling, no invented facts)
// ============================================================

import { Link } from 'react-router-dom';
import { FLAVORS, PRODUCTS } from '../data/products';
import { RECIPES } from '../data/recipes';
import { formatNumber } from '../utils/format';
import { soundService } from '../services/soundService';
import { useReveal } from '../hooks/useReveal';

const VALUES = [
  {
    no: '۰۱',
    title: 'کیفیت واقعی',
    text: 'بدون مصالحه؛ هر بسته ژینو با وسواس کیفیت تولید می‌شود.',
  },
  {
    no: '۰۲',
    title: 'طعم اصیل',
    text: 'طعم‌هایی که یادآور دسرهای خانگی و خاطرات شیرین هستند.',
  },
  {
    no: '۰۳',
    title: 'احترام به مشتری',
    text: 'از بسته‌بندی تا پشتیبانی، تجربه شما برای ما مهم است.',
  },
];

export default function AboutPage() {
  const flavors = Object.values(FLAVORS);
  const jellyCount = PRODUCTS.filter((p) => p.category === 'jelly').length;
  const custardCount = PRODUCTS.filter((p) => p.category === 'custard').length;
  const valuesReveal = useReveal<HTMLDivElement>();

  return (
    <div>
      {/* statement */}
      <section className="mx-auto max-w-3xl px-4 pt-16 text-center sm:px-6">
        <p className="kicker font-display">Our Story</p>
        <h1 className="mt-5 text-3xl font-light leading-[1.6] text-wine-950 sm:text-[2.6rem] sm:leading-[1.6]">
          ژینو؛ کیفیت واقعی،
          <span className="block font-bold">انتخابِ متفاوت</span>
        </h1>
        <span className="rule-lux mt-7" aria-hidden="true" />
        <p className="mt-7 text-[0.95rem] font-light leading-9 text-mocha">
          ژینو با یک باور ساده شروع شد: دسر خوب، حق هر خانواده است. امروز با {formatNumber(jellyCount)} طعم
          پودر ژله و {formatNumber(custardCount)} طعم پودر کاستارد — از جمله محلبی وانیلی ویژه — کنار
          سفره‌های شما هستیم تا هر مهمانی و دورهمی، شیرین‌تر شود.
        </p>
      </section>

      {/* dark stat band */}
      <section className="mt-14 bg-noir text-cream-50 grain relative overflow-hidden py-12" aria-label="آمار ژینو">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-gold-400/50 to-transparent" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-gold-400/50 to-transparent" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-5xl grid-cols-3 gap-4 px-4 text-center sm:px-6">
          {[
            { value: formatNumber(PRODUCTS.length), label: 'محصول' },
            { value: formatNumber(flavors.length), label: 'طعم اصیل' },
            { value: formatNumber(RECIPES.length), label: 'دستور اختصاصی' },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl font-extrabold text-gold-300 sm:text-5xl">{stat.value}</p>
              <p className="mt-2 text-[0.72rem] font-medium text-cream-200/70 sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* values */}
      <section className="mx-auto max-w-5xl px-4 pt-16 sm:px-6">
        <div ref={valuesReveal} className="grid gap-10 md:grid-cols-3">
          {VALUES.map((value) => (
            <div key={value.title} className="relative border-t border-espresso/10 pt-6 text-center md:text-right">
              <span className="absolute -top-px right-0 h-px w-12 bg-gold-500" aria-hidden="true" />
              <p className="font-display text-[0.62rem] uppercase tracking-[0.4em] text-gold-600">{value.no}</p>
              <h2 className="mt-3 text-lg font-bold text-wine-950">{value.title}</h2>
              <p className="mt-2.5 text-sm leading-8 text-mocha">{value.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* flavor atlas */}
      <section className="mx-auto max-w-5xl px-4 pt-16 sm:px-6" aria-label="همه طعم‌های ژینو">
        <div className="panel-lux rounded-2xl p-7 text-center sm:p-10">
          <p className="kicker font-display">Flavor Atlas</p>
          <h2 className="mt-3 text-xl font-bold text-wine-950 sm:text-2xl">همه طعم‌های ژینو</h2>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            {flavors.map((flavor) => (
              <span
                key={flavor.id}
                className="inline-flex items-center gap-2 rounded-lg border border-espresso/8 bg-cream-50 px-3.5 py-2 text-[0.8rem] font-medium text-espresso transition hover:border-gold-500/50"
              >
                <span className="h-2.5 w-2.5 rounded-full ring-1 ring-espresso/10" style={{ backgroundColor: flavor.color }} aria-hidden="true" />
                {flavor.name}
                <span className="text-[0.62rem] text-mocha-light">
                  ({flavor.category === 'jelly' ? 'ژله' : 'کاستارد'})
                </span>
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/products"
              onClick={() => soundService.play('primaryButton')}
              className="btn-lux btn-wine"
            >
              مشاهده محصولات
            </Link>
            <Link
              to="/contact"
              onClick={() => soundService.play('primaryButton')}
              className="btn-lux btn-line-dark"
            >
              تماس با ما
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
