// ============================================================
// ZHINO — about page
// ============================================================

import { Link } from 'react-router-dom';
import { FLAVORS, PRODUCTS } from '../data/products';
import { RECIPES } from '../data/recipes';
import { formatNumber } from '../utils/format';
import { soundService } from '../services/soundService';

const VALUES = [
  { title: 'کیفیت واقعی', text: 'بدون مصالحه؛ هر بسته ژینو با وسواس کیفیت تولید می‌شود.' },
  { title: 'طعم اصیل', text: 'طعم‌هایی که یادآور دسرهای خانگی و خاطرات شیرین هستند.' },
  { title: 'احترام به مشتری', text: 'از بسته‌بندی تا پشتیبانی، تجربه شما برای ما مهم است.' },
];

export default function AboutPage() {
  const flavors = Object.values(FLAVORS);
  const jellyCount = PRODUCTS.filter((p) => p.category === 'jelly').length;
  const custardCount = PRODUCTS.filter((p) => p.category === 'custard').length;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <div className="animate-fade-up mx-auto max-w-2xl text-center">
        <span className="inline-block rounded-full bg-amber-100 px-4 py-1.5 text-xs font-extrabold text-amber-800">
          داستان ما
        </span>
        <h1 className="mt-3 text-2xl font-black text-slate-900 sm:text-3xl">ژینو؛ کیفیت واقعی، انتخاب ژینو</h1>
        <p className="mt-3 text-sm leading-8 text-slate-500">
          ژینو با یک باور ساده شروع شد: دسر خوب، حق هر خانواده است. امروز با {formatNumber(jellyCount)} طعم
          پودر ژله و {formatNumber(custardCount)} طعم پودر کاستارد — از جمله محلبی وانیلی ویژه — کنار
          سفره‌های شما هستیم تا هر مهمانی و دورهمی، شیرین‌تر شود.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-3 sm:gap-5">
        {[
          { value: formatNumber(PRODUCTS.length), label: 'محصول' },
          { value: formatNumber(flavors.length), label: 'طعم اصیل' },
          { value: formatNumber(RECIPES.length), label: 'دستور اختصاصی' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-3xl bg-white p-4 text-center shadow-md shadow-stone-200/60 sm:p-6">
            <p className="text-2xl font-black text-amber-600 sm:text-3xl">{stat.value}</p>
            <p className="mt-1 text-xs font-bold text-slate-500 sm:text-sm">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {VALUES.map((value) => (
          <div key={value.title} className="rounded-3xl bg-white p-6 shadow-md shadow-stone-200/60">
            <h2 className="font-extrabold text-slate-800">{value.title}</h2>
            <p className="mt-1.5 text-sm leading-7 text-slate-500">{value.text}</p>
          </div>
        ))}
      </div>

      <section className="mt-10 rounded-3xl bg-white p-6 shadow-md shadow-stone-200/60 sm:p-8" aria-label="همه طعم‌های ژینو">
        <h2 className="text-center text-lg font-black text-slate-900">همه طعم‌های ژینو</h2>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {flavors.map((flavor) => (
            <span
              key={flavor.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-[#FAF8F5] px-3.5 py-2 text-xs font-bold text-slate-700"
            >
              <span aria-hidden="true">{flavor.emoji}</span>
              {flavor.name}
              <span className="text-[10px] font-semibold text-slate-400">
                ({flavor.category === 'jelly' ? 'ژله' : 'کاستارد'})
              </span>
            </span>
          ))}
        </div>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            to="/products"
            onClick={() => soundService.play('primaryButton')}
            className="rounded-2xl bg-amber-500 px-7 py-3 text-sm font-extrabold text-white shadow-lg shadow-amber-200 transition hover:bg-amber-600 active:scale-95"
          >
            مشاهده محصولات
          </Link>
          <Link
            to="/contact"
            onClick={() => soundService.play('primaryButton')}
            className="rounded-2xl bg-stone-100 px-7 py-3 text-sm font-extrabold text-slate-700 transition hover:bg-stone-200 active:scale-95"
          >
            تماس با ما
          </Link>
        </div>
      </section>
    </div>
  );
}
