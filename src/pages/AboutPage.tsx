// ============================================================
// ZHINO — about page (premium storytelling, no invented facts)
// ============================================================

import { Link } from 'react-router-dom';
import { FLAVORS, PRODUCTS } from '../data/products';
import { RECIPES } from '../data/recipes';
import { formatNumber } from '../utils/format';
import { soundService } from '../services/soundService';
import PagePlate from '../components/PagePlate';
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
      {/* wine plate carrying the story + facts */}
      <PagePlate
        kicker="Our Story"
        title={
          <>
            ژینو؛ کیفیت واقعی،
            <span className="block font-medium text-gold-300">انتخابِ متفاوت</span>
          </>
        }
        lead="ژینو با یک باور ساده شروع شد: دسر خوب، حق هر خانواده است. امروز با هر طعمی که انتخاب می‌کنید، بخشی از همین باور سر سفره‌ی شما می‌نشیند."
        ghost="Zhino"
      >
        <div className="mt-9 grid grid-cols-3 gap-4 border-t border-cream-50/10 pt-8">
          {[
            { value: formatNumber(PRODUCTS.length), label: 'محصول' },
            { value: formatNumber(flavors.length), label: 'طعم اصیل' },
            { value: formatNumber(RECIPES.length), label: 'دستور اختصاصی' },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-2xl font-bold text-cream-50 sm:text-4xl">{stat.value}</p>
              <p className="mt-1.5 text-[0.68rem] font-light text-cream-200/65 sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[0.72rem] font-light text-cream-200/55">
          {formatNumber(jellyCount)} طعم پودر ژله و {formatNumber(custardCount)} طعم پودر کاستر، از جمله محلبی وانیلی ویژه — در بسته‌بندی {formatNumber(250)} گرمی.
        </p>
      </PagePlate>

      {/* values */}
      <section className="mx-auto max-w-5xl px-4 pt-20 sm:px-6">
        <div ref={valuesReveal} className="grid gap-10 md:grid-cols-3">
          {VALUES.map((value) => (
            <div key={value.title} className="relative border-t border-espresso/10 pt-6 text-center md:text-start">
              <span className="absolute -top-px right-0 h-px w-12 bg-wine-700" aria-hidden="true" />
              <p className="font-display text-[0.62rem] tracking-[0.4em] text-wine-700">{value.no}</p>
              <h2 className="mt-3 text-lg font-bold text-wine-950">{value.title}</h2>
              <p className="mt-2.5 text-sm leading-8 text-mocha">{value.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* flavor atlas */}
      <section className="mx-auto max-w-5xl px-4 pt-20 pb-4 sm:px-6" aria-label="همه طعم‌های ژینو">
        <div className="panel-lux rounded-2xl p-7 text-center sm:p-10">
          <p className="kicker font-display">Flavor Atlas</p>
          <h2 className="mt-3 text-2xl font-light text-wine-950 sm:text-[1.7rem]">همه طعم‌های ژینو</h2>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            {flavors.map((flavor) => (
              <span
                key={flavor.id}
                className="inline-flex items-center gap-2 rounded-lg border border-espresso/8 bg-cream-100 px-3.5 py-2 text-[0.8rem] font-medium text-espresso transition hover:border-wine-700/50"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: flavor.color }} aria-hidden="true" />
                {flavor.name}
                <span className="text-[0.62rem] text-mocha-light">
                  ({flavor.category === 'jelly' ? 'ژله' : 'کاستر'})
                </span>
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/products" onClick={() => soundService.play('primaryButton')} className="btn-lux btn-wine">
              مشاهده محصولات
            </Link>
            <Link to="/contact" onClick={() => soundService.play('primaryButton')} className="btn-lux btn-line-dark">
              تماس با ما
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
