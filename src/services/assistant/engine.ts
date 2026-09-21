// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۵ و ۶) — موتور پاسخ محلی
//
// این موتور «حالت آفلاین» دستیار است: بدون هیچ درخواست شبکه‌ای و
// بدون هیچ کلیدی، پرسش فارسی کاربر را می‌فهمد و از کارت اطلاعات
// واقعی فروشگاه (knowledge.ts) پاسخ می‌سازد.
//
// قواعد ثابت این فایل:
//   ۱) قیمت، موجودی و دستور تهیه فقط از دادهٔ واقعی فروشگاه
//      خوانده می‌شود (getVisibleProducts / getSettings / recipes).
//   ۲) اگر داده‌ای در فروشگاه نباشد، پاسخ «نمی‌دانم» است —
//      هیچ عدد، محصول یا دستوری از خودمان ساخته نمی‌شود.
//   ۳) پرسش‌های بیرون از حوزهٔ ژینو با احترام و شفافیت رد می‌شوند.
//   ۴) لحن پاسخ‌ها (فاز ۸): مهربان، خودمانی و کوتاه — مثل یک فروشندهٔ
//      خوش‌برخورد. بدون توضیح فنی و بدون نام بردن از «دیتابیس»، «کاتالوگ»
//      یا «موتور محلی»: مشتری فقط جوابش را می‌شنود.
//
// قابلیت‌های آمادهٔ امروز (و «ابزار»های آیندهٔ مدل هوش مصنوعی):
//   راهنمای انتخاب، معرفی کاتالوگ، جست‌وجوی طعم، قیمت/موجودی،
//   دستور مرحله‌به‌مرحله، برآورد مقدار برای تعداد نفرات،
//   پیشنهاد بر اساس بودجه، ترکیب طعم‌ها، پیشنهاد شخصی‌سازی‌شده،
//   ارسال/کرایه، و راهنمای سفارش.
//
// افزودن قابلیت تازه = یک ردیف در ASSISTANT_CAPABILITIES و یک
// تابع پاسخ؛ بقیهٔ گفتگو (UI، تاریخچه، اتصال به مدل) تغییری لازم
// ندارد.
// ============================================================

import type { ProductCategory } from '../../types';
import { formatNumber, formatPrice, toPersianDigits } from '../../utils/format';
import {
  availableFlavors,
  cheapestVariant,
  describeProduct,
  freeShippingLine,
  isAvailable,
  productsOf,
  searchProducts,
  sellableVariants,
} from './knowledge';
import type {
  AssistantCapabilityId,
  AssistantCartOffer,
  AssistantContext,
  AssistantLink,
  AssistantProductFact,
  AssistantReply,
  AssistantSuggestion,
} from './types';

/* ── کارت قابلیت‌ها (مستندسازی فنی؛ در فاز ۷ از UI صفحه حذف شده) ──
   این فهرست همچنان مرجع «چه چیزی پشتیبانی می‌شود» است و در
   ASSISTANT_AI.md هم آمده؛ صفحهٔ دستیار دیگر ستون معرفی قابلیت‌ها
   ندارد تا محیط چت خلوت بماند. */

export interface AssistantCapabilityCard {
  id: AssistantCapabilityId | 'ai';
  title: string;
  description: string;
  /** نمونهٔ پرسشی که این قابلیت را فعال می‌کند */
  example: string;
  /** ready = همین حالا کار می‌کند */
  status: 'ready';
  /** true یعنی برای پاسخ به مدل هوش مصنوعی نیاز دارد (در غیر این صورت آفلاین هم کار می‌کند) */
  needsModel?: boolean;
}

export const ASSISTANT_CAPABILITIES: AssistantCapabilityCard[] = [
  {
    id: 'guide',
    title: 'راهنمای انتخاب محصول',
    description: 'تفاوت پودر ژله و کاستر، سرد یا گرم، و انتخاب برای مهمانی یا دسر خانگی.',
    example: 'برای انتخاب محصول راهنمایی می‌کنید؟',
    status: 'ready',
  },
  {
    id: 'recipe-jelly',
    title: 'دستور تهیهٔ مرحله‌به‌مرحله',
    description: 'همان دستور رسمی روی بستهٔ ژینو، در سه مرحلهٔ کوتاه.',
    example: 'طرز تهیه ژله چطور است؟',
    status: 'ready',
  },
  {
    id: 'price-stock',
    title: 'قیمت و موجودی واقعی',
    description: 'پاسخ فقط از کاتالوگ همین فروشگاه؛ اگر محصولی نباشد، صریح گفته می‌شود.',
    example: 'قیمت ژله توت فرنگی چند است؟',
    status: 'ready',
  },
  {
    id: 'add-to-cart',
    title: 'افزودن به سبد خرید با تأیید مشتری',
    description:
      'محصول را با قیمت و موجودی واقعی پیشنهاد می‌دهد و فقط بعد از تأیید مشتری به همان سبد فروشگاه اضافه می‌کند؛ هیچ پرداخت یا تسویه‌حسابی خودکار اجرا نمی‌شود.',
    example: 'ژله توت فرنگی را به سبد خرید اضافه کن',
    status: 'ready',
  },
  {
    id: 'suggestion',
    title: 'پیشنهاد دسر شخصی‌سازی‌شده',
    description: 'بر اساس سرد/گرم، شکلاتی/میوه‌ای و مناسبتی که می‌خواهید.',
    example: 'یک دسر سرد و میوه‌ای پیشنهاد بده',
    status: 'ready',
  },
  {
    id: 'budget',
    title: 'پیشنهاد بر اساس بودجه',
    description: 'بهترین ترکیب واقعی فروشگاه در محدودهٔ بودجهٔ شما.',
    example: 'با ۵۰۰ هزار تومان چه ترکیبی بگیرم؟',
    status: 'ready',
  },
  {
    id: 'pairing',
    title: 'ترکیب طعم‌ها',
    description: 'طعم‌هایی که کنار هم خوب می‌نشینند، از بین محصولات موجود.',
    example: 'چه ترکیب طعمی پیشنهاد می‌کنید؟',
    status: 'ready',
  },
  {
    id: 'servings',
    title: 'محاسبهٔ مقدار برای تعداد نفرات',
    description: 'برآورد تقریبی تعداد بسته بر پایهٔ دستور رسمی روی بسته.',
    example: 'برای ۱۰ نفر چند بسته لازم است؟',
    status: 'ready',
  },
  {
    id: 'flavors',
    title: 'معرفی طعم‌های موجود',
    description: 'فهرست تازهٔ طعم‌های ژله و کاستر، دقیقاً همان چیزی که در دیتابیس فروشگاه فعال است.',
    example: 'چه طعم‌هایی دارید؟',
    status: 'ready',
  },
  {
    id: 'catalog',
    title: 'اتصال به کاتالوگ و موجودی فروشگاه',
    description: 'همهٔ پاسخ‌ها زنده از همان دادهٔ فروشگاه و پنل مدیریت خوانده می‌شود.',
    example: 'محصولات ژینو را معرفی می‌کنید؟',
    status: 'ready',
  },
  {
    id: 'ai',
    title: 'گفتگوی هوشمند با مدل زبانی',
    description:
      'با فعال‌کردن Backend یا Supabase Edge Function، پاسخ‌ها از مدل زبانی می‌آید؛ کلید API فقط سمت سرور می‌ماند.',
    example: 'یک دسر خانگی با ژله و کاستر برای مهمانی می‌خواهم',
    status: 'ready',
    needsModel: true,
  },
];

/* ── پیشنهادهای آمادهٔ پیش‌فرض ─────────────────────────────── */

export const DEFAULT_SUGGESTIONS: AssistantSuggestion[] = [
  { label: 'راهنمای انتخاب محصول', prompt: 'برای انتخاب محصول راهنمایی می‌کنید؟' },
  { label: 'طرز تهیه ژله', prompt: 'طرز تهیه ژله چطور است؟' },
  { label: 'طرز تهیه کاستر', prompt: 'طرز تهیه کاستر چطور است؟' },
  { label: 'معرفی محصولات', prompt: 'محصولات ژینو را معرفی می‌کنید؟' },
  { label: 'طعم‌های موجود', prompt: 'چه طعم‌هایی دارید؟' },
  { label: 'پیشنهاد دسر', prompt: 'یک دسر مناسب مهمانی پیشنهاد بده' },
  { label: 'ترکیب طعم‌ها', prompt: 'چه ترکیب طعمی پیشنهاد می‌کنید؟' },
  { label: 'قیمت و موجودی', prompt: 'قیمت محصولات چقدر است؟' },
];

export const ASSISTANT_INTRO =
  'سلام، خوش اومدید! من دستیار ژینو هستم؛ چطور می‌تونم کمکتون کنم؟';

/** پیام وقتی گفتگو پاک می‌شود (شروع تازه) */
export const ASSISTANT_RESTART =
  'گفتگو تازه شد. در خدمتم — بپرسید یا یکی از پیشنهادها را انتخاب کنید.';

/**
 * «برآورد تقریبی» مقدار لازم برای هر نفر.
 * مبنا: دستور رسمی روی بسته —
 *   ژله: ۳ قاشق پودر (حدود ۳۰ گرم) برای ۱.۵ لیوان آب → حدود ۲ تا ۳ پرس
 *   کاستر: ۱ قاشق پودر (حدود ۱۰ گرم) + ۱ لیوان شیر → حدود ۱ تا ۲ پرس
 * این اعداد همیشه با قید «برآورد تقریبی» بیان می‌شوند.
 */
const GRAMS_PER_SERVING: Record<ProductCategory, number> = { jelly: 12, custard: 7 };

/** ترکیب‌های طعم (محتوای تحریریه، نه ادعای قیمت/موجودی) */
const FLAVOR_COMPLEMENTS: { flavor: string; partners: string[]; note: string }[] = [
  { flavor: 'توت فرنگی', partners: ['کاستر محلبی وانیلی', 'کاستر کاکائو'], note: 'توت فرنگی با وانیل یا کاکائو کلاسیک‌ترین ترکیب دسر است.' },
  { flavor: 'انار', partners: ['کاستر محلبی وانیلی', 'کاستر هفت میوه'], note: 'مایهٔ انار با کاستر وانیلی لایهٔ رنگی و مقبولی می‌سازد.' },
  { flavor: 'آلبالو', partners: ['کاستر کاکائو', 'کاستر محلبی وانیلی'], note: 'مهِ آلبالو با کاستر شکلاتی یا وانیلی متعادل می‌شود.' },
  { flavor: 'هلو', partners: ['کاستر هفت میوه', 'کاستر موز'], note: 'هلوی ملایم با کاستر میوه‌ای هم‌خانواده است.' },
  { flavor: 'پرتقال', partners: ['کاستر کاکائو', 'کاستر توت فرنگی'], note: 'مرکبات با کاکائو یا توت فرنگی کنتراست خوبی می‌سازد.' },
  { flavor: 'انبه', partners: ['کاستر موز', 'کاستر هفت میوه'], note: 'انبه با کاستر موز، دسر استوایی می‌شود.' },
  { flavor: 'لیمو', partners: ['کاستر محلبی وانیلی'], note: 'لیمو با وانیل ترکیبی خنک و بهاری می‌دهد.' },
  { flavor: 'کیوی', partners: ['کاستر توت فرنگی'], note: 'کیوی کمی ترش است؛ کاستر توت فرنگی آن را متعادل می‌کند.' },
  { flavor: 'هندوانه', partners: ['کاستر طالبی'], note: 'هندوانه و طالبی، دسر تابستانی و خنک می‌سازند.' },
  { flavor: 'شاتوت', partners: ['کاستر محلبی وانیلی'], note: 'شاتوت با وانیل لایهٔ مخملی و خوشرنگی می‌دهد.' },
  { flavor: 'تمشک', partners: ['کاستر کاکائو'], note: 'ترشی تمشک با کاستر شکلاتی متعادل می‌شود.' },
  { flavor: 'بلوبری', partners: ['کاستر محلبی وانیلی'], note: 'بلوبری با وانیل ترکیبی نرم و اروپایی است.' },
  { flavor: 'آناناس', partners: ['کاستر موز'], note: 'آناناس و موز، طعم استوایی موردعلاقهٔ بچه‌هاست.' },
  { flavor: 'انگور', partners: ['کاستر طالبی'], note: 'انگور با کاستر طالبی سبک و خوش‌عطر می‌شود.' },
  { flavor: 'کاکائو', partners: ['ژله موز', 'ژله توت فرنگی'], note: 'کاستر شکلاتی با ژلهٔ موز یا توت فرنگی، دسر لایه‌ای معروفی است.' },
  { flavor: 'محلبی', partners: ['ژله توت فرنگی', 'ژله انار'], note: 'کاستر محلبی وانیلی پایهٔ خوبی برای لایه‌های ژله است.' },
  { flavor: 'موز', partners: ['کاستر کاکائو', 'کاستر محلبی وانیلی'], note: 'موز با کاکائو یا وانیل ترکیب کلاسیک بستنی‌فروشی است.' },
  { flavor: 'هفت میوه', partners: ['ژله پرتقال', 'ژله هلو'], note: 'کاستر هفت میوه با ژلهٔ پرتقال یا هلو، دسر مهمانی می‌شود.' },
];

/* ── نرمال‌سازی متن فارسی ──────────────────────────────────── */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** یکسان‌سازی متن کاربر: ارقام فارسی/عربی، ی و ک عربی، نیم‌فاصله */
export function normalizePersian(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[ىي]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[؟?!.,،؛:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** تبدیل عدد لاتین به رقم فارسی برای متن پاسخ */
function fa(value: number): string {
  return toPersianDigits(formatNumber(value));
}

/** مبلغ را با ارقام فارسی می‌نویسد: «۲۰۰٬۰۰۰ تومان» */
function price(value: number): string {
  return formatPrice(value);
}

/** عددهای متن را می‌خواند: «۳۰۰ هزار» ، «۱.۵ میلیون» ، «500000» */
function parseAmount(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(میلیون|هزار|تومان|تومن)?/);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base) || base <= 0) return null;
  const unit = match[2] ?? '';
  if (unit === 'میلیون') return Math.round(base * 1_000_000);
  if (unit === 'هزار') return Math.round(base * 1_000);
  // «۱۵۰ تومان» یعنی ۱۵۰ هزار تومان (رایج در گفتار روزمره)
  if ((unit === 'تومان' || unit === 'تومن') && base <= 1000) return Math.round(base * 1000);
  return Math.round(base);
}

/** تعداد نفرات از متن: «برای ۸ نفر» / «۱۰ نفره» */
function parsePeople(text: string): number | null {
  const match = text.match(/(\d+)\s*(?:نفر|نفره|پرس|نفرآدم)/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0 || value > 500) return null;
  return Math.round(value);
}

/* ── تطبیق طعم‌های واقعی در متن کاربر ─────────────────────── */

/** محصولاتی که نام طعمشان در متن کاربر آمده (بلندترین عنوان اول) */
function matchFlavorProducts(context: AssistantContext, normalized: string): AssistantProductFact[] {
  const matched: AssistantProductFact[] = [];
  for (const product of context.products) {
    if (product.flavorLabel.length >= 3 && normalized.includes(product.flavorLabel)) {
      matched.push(product);
    }
  }
  matched.sort((a, b) => b.flavorLabel.length - a.flavorLabel.length);

  // اگر کاربر صریحاً «ژله» یا «کاستر» گفته، همان دسته مقدم است
  // (مثلاً «قیمت ژله توت فرنگی» نباید کاستر توت فرنگی را جلو بیندازد).
  const wantsCustard = normalized.includes('کاستر');
  const wantsJelly = normalized.includes('ژله');
  if (wantsCustard !== wantsJelly) {
    const preferred = matched.filter((product) =>
      wantsCustard ? product.category === 'custard' : product.category === 'jelly',
    );
    if (preferred.length > 0) return preferred;
  }
  return matched;
}

/** آیا متن کاربر «طعم‌نما»یی دارد که در فروشگاه نیست؟ */
const FLAVOR_HINTS = [
  'انار', 'توت فرنگی', 'هلو', 'تمشک', 'بلوبری', 'پرتقال', 'آناناس', 'آلبالو',
  'هندوانه', 'طالبی', 'شاتوت', 'انبه', 'انگور', 'کیوی', 'لیمو', 'موز', 'کاکائو',
  'شکلات', 'وانیل', 'محلبی', 'هفت میوه', 'کارامل', 'قهوه', 'نارگیل', 'زعفران',
  'گیلاس', 'سیب', 'خیار', 'بستنی', 'پسته',
];

/* ── ابزارهای مشترک پاسخ ───────────────────────────────────── */

function link(label: string, to: string): AssistantLink {
  return { label, to };
}

function productLinks(products: AssistantProductFact[], max = 3): AssistantLink[] {
  return products
    .slice(0, max)
    .map((product) => link(`صفحهٔ ${product.shortName}`, product.to));
}

/**
 * پیشنهاد «افزودن به سبد» برای همان محصولاتی که در متن پاسخ آمده‌اند.
 *
 * این فقط یک *پیشنهاد* است: رابط کاربری تا وقتی مشتری دکمهٔ تأیید را
 * نزده هیچ چیزی به سبد اضافه نمی‌کند و هیچ تسویه‌حسابی اجرا نمی‌شود.
 * گزینهٔ پیشنهادی، ارزان‌ترین گزینهٔ قابل فروش همان محصول است — همان
 * عددی که در متن پاسخ هم نوشته شده، پس قیمت کارت و متن هرگز جدا نمی‌افتند.
 */
export function cartOffersFor(
  products: AssistantProductFact[],
  max = 3,
): AssistantCartOffer[] {
  const offers: AssistantCartOffer[] = [];
  for (const product of products) {
    if (offers.length >= max) break;
    const variant = cheapestVariant(product);
    if (!variant) continue; // ناموجود → پیشنهادی ساخته نمی‌شود
    offers.push({
      productId: product.id,
      variantId: variant.id,
      label: `${product.shortName}${variant.weight ? ` ${variant.weight}` : ''}`.trim(),
      price: variant.price,
      stock: variant.stock,
    });
  }
  return offers;
}

/** گزینه‌های قابل فروش یک محصول — برای کارت محصول در گفتگو */
export function sellableOptionsOf(product: AssistantProductFact) {
  return sellableVariants(product);
}

function bubble(...lines: (string | null | undefined)[]): string {
  return lines.filter((line): line is string => typeof line === 'string' && line.length > 0).join('\n');
}

/** پاسخ محلی، پیش از آنکه منبع داده به آن پیوست شود (تنها در answerLocally) */
type LocalReply = Omit<AssistantReply, 'dataSource'>;

function reply(
  capability: AssistantReply['capability'],
  text: string,
  extra: {
    links?: AssistantLink[];
    suggestions?: AssistantSuggestion[];
    grounded?: boolean;
    /** کارت‌های محصول همین پاسخ (همان داده‌ای که در متن آمده) */
    products?: AssistantProductFact[];
    /** پیشنهاد افزودن به سبد — منتظر تأیید مشتری می‌ماند */
    cartOffer?: AssistantCartOffer;
  } = {},
): LocalReply {
  return {
    capability,
    text,
    links: extra.links,
    suggestions: extra.suggestions,
    products: extra.products,
    cartOffer: extra.cartOffer,
    source: 'local',
    grounded: extra.grounded ?? false,
  };
}

/* ── حافظهٔ گفتگو + لایهٔ تنوع پاسخ (فاز ۱۲) ──────────────────
   چرا لازم است؟ تا دیروز هر موقعیت فقط «یک جملهٔ» آماده داشت؛
   دو بار یک سؤال یعنی دو بار همان جمله. حالا:
     • pick() برای هر «جایگاه متن» چند واریانت طبیعی دارد و هیچ
       واریانتی دو بار پشت‌سرهم تکرار نمی‌شود (آخرین‌ها را به‌خاطر
       می‌سپارد).
     • memory چیزی که گفتگو تا الان دیده را نگه می‌دارد: آخرین
       محصولاتِ موضوعِ بحث (برای پیگیریِ «قیمتش چنده؟»)، سلام
       اول است یا دوباره، و چند نوبت رد و بدل شده.
   مهم: حافظه فقط «قالب حرف‌زدن» را عوض می‌کند؛ عدد و دادهٔ پاسخ
   همیشه از همان کارت اطلاعات زندهٔ فروشگاه خوانده می‌شود.        */

export interface AssistantConversationMemory {
  /** جایگاه متن → اندیس واریانت‌هایی که به‌تازگی استفاده شده‌اند */
  recent: Map<string, number[]>;
  /** موضوع (قابلیت) پاسخ قبلی */
  lastIntent: AssistantReply['capability'] | null;
  /** محصولاتی که اخیراً موضوع حرف بودند — برای پیگیریِ طبیعی گفتگو */
  lastProducts: AssistantProductFact[];
  /** آیا در این گفتگو قبلاً خودمان را معرفی کرده‌ایم؟ */
  greeted: boolean;
  /** تعداد نوبت‌های رد و بدل شده */
  turns: number;
}

export function createAssistantMemory(): AssistantConversationMemory {
  return {
    recent: new Map(),
    lastIntent: null,
    lastProducts: [],
    greeted: false,
    turns: 0,
  };
}

/**
 * یک واریانت از میان گزینه‌ها برمی‌دارد — بدون تکرارِ فوری.
 * اگر حافظه نباشد (مثلاً تست‌ها) فقط تصادفی انتخاب می‌کند.
 * متن‌های «داده‌ای» (قیمت، موجودی، مرحلهٔ دستور) از این مسیر
 * رد نمی‌شوند؛ این تابع فقط برای جمله‌بندی‌هاست.
 */
function pick(memory: AssistantConversationMemory, slot: string, variants: string[]): string {
  if (variants.length === 0) return '';
  if (variants.length === 1) return variants[0];
  const recent = memory.recent.get(slot) ?? [];
  const fresh = variants.map((_, index) => index).filter((index) => !recent.includes(index));
  const pool = fresh.length > 0 ? fresh : variants.map((_, index) => index);
  const index = pool[Math.floor(Math.random() * pool.length)];
  const keep = Math.max(1, Math.min(3, variants.length - 1));
  memory.recent.set(slot, [...recent, index].slice(-keep));
  return variants[index];
}

/* ── بانک‌های جمله‌بندی (بدون هیچ داده) ──────────────────────
   هر جایگاه چند واریانت طبیعی دارد؛ pick() تکرارِ فوری را می‌گیرد.
   هیچ عدد، قیمت یا محصولی اینجا نوشته نشده — داده‌ها فقط از
   کارت اطلاعات واقعی فروشگاه به متن می‌پیوندند. */

const SCOPE_VARIANTS = [
  bubble(
    'راستش تخصص من همین قفسهٔ ژینوئه: پودر ژله، پودر کاستر، طعم‌ها و دسرهای خونگی.',
    'همین موضوع‌ها بپرسید تا دقیق جواب بدم؛ بقیه‌اش را ترجیح می‌دهم از خودم نسازم.',
  ),
  bubble(
    'این یکی از حوزهٔ من خارجه! من فقط تو دنیای ژله و کاستر دستم پر است.',
    'برگردیم به دسر؟ انتخاب طعم، دستور تهیه، قیمت یا یه پیشنهاد برای مهمانی — هرکدوم خواستید.',
  ),
  bubble(
    'وای، این از دستم خارجه! چیزی که بلد نیستم را از خودم نمی‌گویم.',
    'ولی دربارهٔ ژله، کاستر و خرید از ژینو هر چه بپرسید در خدمتم.',
  ),
];

const CLARIFY_VARIANTS = [
  bubble('کامل متوجه نشدم؛ ساده‌تر بگویید؟ مثلاً «قیمت ژله انار» یا «یه دسر برای مهمانی».'),
  bubble('این‌بار نگرفتم چی پرسیدید! کوتاه‌تر بنویسید، یا از پیشنهادهای پایین یکی را بزنید.'),
  bubble('راستش سؤالتون را خوب نگرفتم. بگید دنبال چه طعم یا دسری‌اید تا سریع پیدایش کنم.'),
];

const GREETING_FIRST_VARIANTS = [
  ASSISTANT_INTRO,
  'سلام و خوش اومدید! من دستیار ژینو هستم. دنبال ژله‌اید یا کاستر؟ کمکتون می‌کنم انتخاب کنید.',
  'سلام! خوشحالم که این‌جایید. بگویید چه دسری تو ذهن‌تونه تا از قفسهٔ ژینو براتون پیدا کنم.',
];

const GREETING_AGAIN_VARIANTS = [
  'باز هم سلام! بفرمایید، این‌بار در چه کمکی باشم؟',
  'سلام دوباره! گوش می‌دم — طعم خاصی تو ذهن‌ست یا یه پیشنهاد تازه می‌خواید؟',
  'در خدمتم! سؤال یا درخواستتون رو بگید، همین‌جا رسیدگی می‌کنم.',
];

const THANKS_VARIANTS = [
  'خواهش می‌کنم! کار ما همین دیگه. اگر چیز دیگه‌ای خواستید، من همین‌جام.',
  'قربانت! هر وقت دسر خواستید، من آماده‌ام.',
  'ممنون از شما! چیز دیگه‌ای از قفسهٔ ژینو خواستید، در خدمتم.',
];

const BYE_VARIANTS = [
  'خدانگهدار! هر وقت برگشتید، قفسهٔ ژینو همین‌جاست.',
  'به امید دیدار! دسر خوبی داشته باشید.',
  'موفق باشید! برای خرید بعدی من دوباره همین‌جام.',
];

const AFFIRM_NUDGE_VARIANTS = [
  bubble('چه خوب! پس بگویید از کجا شروع کنیم: طعم خاصی مدنظرتونه، بودجه‌ای دارید، یا یه پیشنهاد آماده بخواید؟'),
  bubble('عالیه! حالا بگید سلیقه‌تون چیه — سرد و میوه‌ای؟ شکلاتی و مخملی؟ یا مناسبتی خاص در راهه؟'),
];

const DECLINE_VARIANTS = [
  bubble('باشه! هیچ عجله‌ای نیست. هر وقت آماده بودید، من همین‌جام.'),
  bubble('چشم! هر وقت دل‌تون دسر خواست، یه سلام کافیه.'),
];

/** پرسش کوتاه فروشندگی بعد از معرفی محصول — بسته به موقعیت چرخیده می‌شود */
const FLAVOR_FOLLOWUP_VARIANTS = [
  'بپرسم چند نفره می‌خواید؟ مقدار دقیقش را همین‌جا براتون حساب می‌کنم.',
  'برای مهمانی می‌خواید یا دسر خونگی؟ بگید تا مقدار و ترکیب مناسبش رو بگم.',
  'اگر بخواید، همون حالا با تأیید خودتون به سبد خرید اضافه‌ش می‌کنم.',
];

/* ── پرسش «اطلاعاتت را از کجا می‌آوری؟» ────────────────────── */

const SOURCE_INFO_KEYWORDS = [
  // «منبع»، «اطلاعاتت»، «داده هات»، «دیتابیس»، «وصل هستی» و صرف‌های محاوره‌ای
  'منبع اطلاعات',
  'منبع داد',
  'اطلاعاتت',
  'اطلاعات تو',
  'داده هات',
  'داده ها رو',
  'دیتابیس',
  'دیتا بیس',
  'سوپابیس',
  'supabase',
  'وصل هستی',
  'وصل شدی',
  'از کجا میاری',
  'از کجا میاری',
  'از کجا میدونی',
  'از کجا میگیری',
  'از کجا اوردی',
  'آپدیت هستی',
  'اپدیت هستی',
  'به روز هستی',
];

function sourceInfoReply(context: AssistantContext, memory: AssistantConversationMemory): LocalReply {
  const lines: string[] = [];
  if (context.dataSource === 'database') {
    // صادقانه، ولی بدون واژه‌های فنی: مشتری می‌فهمد عدد «همین حالا» گرفته شده
    lines.push(
      pick(memory, 'source-live', [
        'بله — قیمت‌ها، موجودی، طعم‌ها و دستورهای تهیه را لحظه‌ای از خودِ فروشگاه می‌گیرم؛ همان چیزی که همین حالا در سایت ثبت شده.',
        'بله، همین حالا از خود فروشگاه نگاه می‌کنم؛ چیزی که می‌گم همان است که الان توی سایت ثبت شده.',
      ]),
    );
  } else {
    lines.push(
      pick(memory, 'source-local', [
        'قیمت‌ها، موجودی و دستورهای تهیه را از همان فهرست فروشگاه می‌گیرم، نه از حافظهٔ خودم.',
        'همهٔ اعدادم از فهرست خودِ ژینو می‌آید؛ چیزی از حفظ نمی‌گویم.',
      ]),
    );
  }
  lines.push(`ارسال رایگان از ${formatPrice(context.settings.freeShippingThreshold)} شروع می‌شه؛ همان چیزی که در سبد خرید می‌بینید.`);
  lines.push('هیچ عددی را از خودم نمی‌سازم؛ چیزی که نباشد، می‌گویم پیدا نمی‌کنم.');

  return reply(
    'catalog',
    bubble(...lines),
    {
      grounded: true,
      links: [link('مشاهدهٔ محصولات', '/products')],
      suggestions: [
        { label: 'قیمت و موجودی', prompt: 'قیمت محصولات چقدر است؟' },
        { label: 'طعم‌های موجود', prompt: 'چه طعم‌هایی دارید؟' },
      ],
    },
  );
}

/* ── قابلیت‌ها ─────────────────────────────────────────────── */

function catalogReply(context: AssistantContext, memory: AssistantConversationMemory): LocalReply {
  const weights = new Set(context.products.flatMap((product) => product.variants.map((v) => v.weight)));
  const weightLine = weights.size === 1 ? `همه در بستهٔ ${[...weights][0]} عرضه می‌شه.` : '';
  const priceLine = context.priceRange
    ? `قیمت‌ها از ${price(context.priceRange.min)} شروع می‌شه.`
    : '';
  return reply(
    'catalog',
    bubble(
      pick(memory, 'catalog-open', [
        `الان ${fa(context.counts.total)} محصول داریم: ${fa(context.counts.jelly)} طعم پودر ژله و ${fa(context.counts.custard)} طعم پودر کاستر.`,
        `قفسهٔ ژینو الان ${fa(context.counts.total)} محصول دارد — ${fa(context.counts.jelly)} ژله و ${fa(context.counts.custard)} کاستر.`,
      ]),
      weightLine,
      priceLine,
      freeShippingLine(context),
      pick(memory, 'catalog-close', [
        'بگید مناسبتی که دارید چیه، تا از بین همین‌ها دقیق پیشنهاد بدم.',
        'قیمت و موجودی هر محصول توی صفحهٔ خودش هست؛ از صفحهٔ محصولات شروع کنید.',
      ]),
    ),
    {
      links: [link('مشاهدهٔ محصولات', '/products'), link('دستور تهیه', '/recipes')],
      grounded: true,
      products: context.products.filter(isAvailable).slice(0, 4),
      suggestions: [
        { label: 'قیمت و موجودی', prompt: 'قیمت محصولات چقدر است؟' },
        { label: 'پیشنهاد دسر', prompt: 'یک دسر مناسب مهمانی پیشنهاد بده' },
      ],
    },
  );
}

/**
 * فهرست طعم‌های واقعی فروشگاه.
 *
 * قبلاً این پرسش («چه طعم‌هایی دارید؟») به پاسخ راهنما می‌رفت؛ از
 * فاز ۶ پاسخ مستقیم و کوتاه می‌دهد و فقط از دادهٔ همین لحظه می‌گوید.
 */
function flavorsReply(context: AssistantContext, memory: AssistantConversationMemory): LocalReply {
  const flavors = availableFlavors(context);
  if (flavors.jelly.length === 0 && flavors.custard.length === 0) {
    return reply(
      'flavors',
      bubble(
        'الان طعم فعالی در فروشگاه نمی‌بینم؛ احتمالاً هنوز محصولی منتشر نشده است.',
        'صفحهٔ محصولات را ببینید یا کمی بعد دوباره بپرسید.',
      ),
      {
        links: [link('مشاهدهٔ محصولات', '/products')],
        grounded: true,
      },
    );
  }

  const lines: string[] = [];
  if (flavors.jelly.length > 0) {
    lines.push(`• ژله (${fa(flavors.jelly.length)} طعم): ${flavors.jelly.join('، ')}`);
  }
  if (flavors.custard.length > 0) {
    lines.push(`• کاستر (${fa(flavors.custard.length)} طعم): ${flavors.custard.join('، ')}`);
  }

  return reply(
    'flavors',
    bubble(
      pick(memory, 'flavors-open', [
        'طعم‌های موجود در فروشگاه ژینو:',
        'الان این طعم‌ها روی قفسهٔ ژینو هست:',
        'فهرست طعم‌های همین لحظهٔ فروشگاه:',
      ]),
      ...lines,
      pick(memory, 'flavors-close', [
        'طعم خاصی مدنظرتان است؟ نامش را بنویسید تا قیمت و موجودی همان را بگویم.',
        'کدومش به دلتون نشست؟ اسمش را بگویید تا همان را دقیق نگاه کنم.',
        'اگر وسواس طعم دارید، بگویید عاشق چه میوه‌ای هستید — من نزدیک‌ترش را پیدا می‌کنم.',
      ]),
    ),
    {
      links: [link('همهٔ محصولات', '/products')],
      grounded: true,
      suggestions: [
        { label: 'قیمت و موجودی', prompt: 'قیمت محصولات چقدر است؟' },
        { label: 'ترکیب طعم‌ها', prompt: 'چه ترکیب طعمی پیشنهاد می‌کنید؟' },
      ],
    },
  );
}

function guideReply(context: AssistantContext, memory: AssistantConversationMemory): LocalReply {
  return reply(
    'guide',
    bubble(
      pick(memory, 'guide-open', [
        'اول ببینید دسرتان سرد می‌خواهید یا گرم:',
        'راه انتخاب خیلی ساده است — ببینید چه حال‌وهوایی می‌خواهید:',
      ]),
      '• پودر ژله: سبک و لرزان، سرو سرد — مناسب مهمانی، تابستان و لایه‌های رنگی.',
      '• پودر کاستر: مخملی و خامه‌ای، سرد یا گرم — روی میوه، لایهٔ میانی کیک و دسر خانگی.',
      `الان ${fa(context.counts.jelly)} طعم ژله و ${fa(context.counts.custard)} طعم کاستر داریم.`,
      pick(memory, 'guide-close', [
        'تازه‌کارید؟ با یک طعم آشنا شروع کنید، بعد سراغ طعم‌های خاص بروید.',
        'بگید سرد می‌خواید یا گرم، میوه‌ای یا شکلاتی — من دقیق‌تر راهنمایی‌تون می‌کنم.',
        'اگر بگید برای چه مناسبتی می‌خواید، خودم دو سه تا گزینهٔ درست‌وحسابی جلوتون می‌چینم.',
      ]),
    ),
    {
      links: [link('مشاهدهٔ محصولات', '/products'), link('دستور تهیه', '/recipes')],
      grounded: true,
      suggestions: [
        { label: 'ژله یا کاستر؟', prompt: 'تفاوت ژله و کاستر چیست؟' },
        { label: 'پیشنهاد دسر', prompt: 'یک دسر سرد و میوه‌ای پیشنهاد بده' },
      ],
    },
  );
}

function flavorReply(
  context: AssistantContext,
  memory: AssistantConversationMemory,
  products: AssistantProductFact[],
): LocalReply {
  if (products.length === 0) {
    // طعم‌نمای ناموجود: پاسخ ساختگی داده نمی‌شود
    const available = context.products.slice(0, 4).map((product) => product.shortName);
    return reply(
      'flavor',
      bubble(
        pick(memory, 'flavor-miss', [
          'این طعم را الان در فروشگاه نداریم؛ نمی‌خواهم چیزی از خودم اضافه کنم.',
          'راستش را بخواهید، این طعم فعلاً روی قفسهٔ ژینو نیست — و من از خودم محصول نمی‌سازم.',
          'این طعم را الان نداریم؛ دستِ خودم نیست. ولی ناامید نشید:',
        ]),
        available.length > 0
          ? `طعم‌های موجود الان: ${available.join('، ')}${context.products.length > 4 ? ' و …' : ''}.`
          : null,
        pick(memory, 'flavor-miss-close', [
          'اگر طعم خاصی مدنظرتان است، از صفحهٔ محصولات فهرست کامل را ببینید.',
          'از بین همین‌ها چیزی به دلتون نشست؟ بگید تا دقیق نگاهش کنم.',
        ]),
      ),
      {
        links: [link('همهٔ محصولات', '/products')],
        grounded: true,
        products: [],
        suggestions: [
          { label: 'معرفی محصولات', prompt: 'محصولات ژینو را معرفی می‌کنید؟' },
          { label: 'طعم‌های موجود', prompt: 'چه طعم‌هایی دارید؟' },
          { label: 'راهنمای انتخاب', prompt: 'برای انتخاب محصول راهنمایی می‌کنید؟' },
        ],
      },
    );
  }

  const lines = products.slice(0, 4).map((product) => `• ${describeProduct(product)}`);
  const anyAvailable = products.some(isAvailable);
  const followUp =
    products.length === 1 && anyAvailable
      ? pick(memory, 'flavor-followup', FLAVOR_FOLLOWUP_VARIANTS)
      : '';
  return reply(
    'flavor',
    bubble(
      pick(memory, 'flavor-hit', [
        products.length === 1 ? 'این محصول در فروشگاه موجود است:' : 'این گزینه‌ها را در فروشگاه داریم:',
        products.length === 1 ? 'پیدا شد! همین الان روی قفسه هست:' : 'از این‌ها که می‌پسندید:',
        products.length === 1 ? 'بله، این را داریم:' : 'این‌ها نزدیک‌ترین گزینه‌های قفسهٔ ژینو هستند:',
      ]),
      ...lines,
      anyAvailable
        ? pick(memory, 'flavor-hit-close', [
            'قیمت و موجودی بالا دقیق همونه؛ روی صفحهٔ محصول هم همین را می‌بینید.',
            'همین اعداد را از خود فروشگاه خواندم — قیمت صفحهٔ محصول هم همین است.',
          ])
        : 'این محصول الان توی فروشگاه موجود نیست.',
      followUp,
    ),
    {
      links: productLinks(products),
      grounded: true,
      products: products.slice(0, 4),
      suggestions: [
        { label: 'طرز تهیه', prompt: `طرز تهیه ${products[0].shortName} چطور است؟` },
        { label: 'ترکیب طعم‌ها', prompt: `${products[0].flavorLabel} با چه طعمی خوب می‌شود؟` },
      ],
    },
  );
}

function priceStockReply(
  context: AssistantContext,
  memory: AssistantConversationMemory,
  products: AssistantProductFact[],
  refersBack = false,
): LocalReply {
  if (products.length > 0) {
    const lines = products.slice(0, 5).map((product) => {
      const variant = cheapestVariant(product);
      if (!variant) return `• ${product.shortName} — فعلاً موجود نیست`;
      const stock =
        variant.stock <= context.settings.lowStockThreshold
          ? `موجودی: ${fa(variant.stock)} عدد (کم)`
          : `موجود در انبار`;
      return `• ${product.shortName} — ${variant.weight}: ${price(variant.price)} — ${stock}`;
    });
    const intro = refersBack
      ? pick(memory, 'price-back', [
          'اگه منظورتون همون‌هایی است که چند لحظه پیش گفتیم، قیمت و موجودی‌شان الان این است:',
          'آهان، همون قبلی‌ها! وضعیت همین الان‌شان این است:',
        ])
      : pick(memory, 'price-open', [
          'قیمت و موجودی امروز:',
          'این اعداد مستقیم از خود فروشگاه است:',
          'همین الان نگاه کردم:',
        ]);
    return reply('price-stock', bubble(intro, ...lines), {
      links: [...productLinks(products), link('همهٔ محصولات', '/products')],
      grounded: true,
      products: products.slice(0, 5),
      suggestions: [
        {
          // نام دستهٔ کوتاه («ژله»/«کاستر») و نه نام کامل محصول، تا پرسش
          // دقیقاً به همان دستور رسمی روی بسته برسد.
          label: `طرز تهیه ${products[0].category === 'jelly' ? 'ژله' : 'کاستر'}`,
          prompt: `طرز تهیه ${products[0].category === 'jelly' ? 'ژله' : 'کاستر'} چطور است؟`,
        },
        { label: 'افزودن به سبد', prompt: `می‌شود ${products[0].shortName} را به سبد خرید اضافه کنی؟` },
      ],
    });
  }

  const cheapest = context.priceRange ? price(context.priceRange.min) : null;
  return reply(
    'price-stock',
    bubble(
      pick(memory, 'price-ask', [
        'اسم طعم یا محصول را بفرمایید تا قیمت و موجودی همان را بگویم (مثلاً «قیمت ژله انار»).',
        'بگید کدام طعم را می‌خواید تا قیمت و موجودی همان را همین‌جا بگویم — مثلاً «ژله انار».',
        'کدام یک از محصولات را نگاه می‌کنید؟ اسمش را بنویسید تا عدد دقیقش را بگویم.',
      ]),
      cheapest ? `قیمت‌ها از ${cheapest} شروع می‌شود.` : null,
      freeShippingLine(context),
    ),
    {
      links: [link('مشاهدهٔ محصولات', '/products')],
      grounded: true,
      suggestions: [
        { label: 'قیمت ژله توت فرنگی', prompt: 'قیمت ژله توت فرنگی چند است؟' },
        { label: 'موجودی کاستر کاکائو', prompt: 'کاستر کاکائو موجود است؟' },
      ],
    },
  );
}

function recipeReply(
  context: AssistantContext,
  memory: AssistantConversationMemory,
  category: ProductCategory | null,
): LocalReply {
  const wanted: ProductCategory[] = category ? [category] : ['jelly', 'custard'];
  const found = wanted
    .map((item) => context.recipes.find((recipe) => recipe.category === item))
    .filter((recipe): recipe is AssistantContext['recipes'][number] => Boolean(recipe));

  if (found.length === 0) {
    return reply(
      category === 'custard' ? 'recipe-custard' : 'recipe-jelly',
      bubble(
        'دستور رسمی این دسته را الان ندارم؛ نمی‌خواهم دستور اشتباه به شما بدهم.',
        'صفحهٔ دستور تهیه را ببینید یا با پشتیبانی ژینو در تماس باشید.',
      ),
      {
        links: [link('صفحهٔ دستور تهیه', '/recipes'), link('تماس با ژینو', '/contact')],
        grounded: true,
      },
    );
  }

  const blocks = found.map((recipe) =>
    bubble(
      `${recipe.title} — ${recipe.summary}`,
      ...recipe.steps.map((step, index) => `${fa(index + 1)}. ${step}`),
    ),
  );

  const relatedProducts = found
    .flatMap((recipe) => productsOf(context, recipe.category).slice(0, 2))
    .filter((product, index, list) => list.findIndex((item) => item.id === product.id) === index);

  return reply(
    category === 'custard' ? 'recipe-custard' : 'recipe-jelly',
    bubble(
      pick(memory, 'recipe-open', [
        'این دستور، همان دستور رسمی روی بستهٔ ژینو است:',
        'با کمال میل! همان مراحل ساده‌ای که روی بسته چاپ شده:',
        'حتماً — مراحل کوتاه و رسمی، همان که ژینو روی بسته نوشته:',
      ]),
      ...blocks,
      'همین دستوری است که روی بستهٔ ژینو نوشته شده.',
      pick(memory, 'recipe-close', [
        'برای لایه‌های رنگی، هر لایه را جدا درست کنید و کمی در یخچال بگذارید تا ببندد.',
        'ترفند کوچک: برای دسر لایه‌ای، صبر کنید هر لایه در یخچال ببندد بعد لایهٔ بعد را بریزید.',
        'اگر مهمانی دارید، از شب قبل بسازید — صبح کاملاً جا افتاده و آماده است.',
      ]),
    ),
    {
      links: [link('صفحهٔ دستور تهیه', '/recipes'), ...productLinks(relatedProducts, 2)],
      grounded: true,
      suggestions: [
        { label: 'برای ۱۰ نفر چقدر لازم است؟', prompt: 'برای ۱۰ نفر چند بسته لازم است؟' },
        { label: 'ترکیب طعم‌ها', prompt: 'چه ترکیب طعمی پیشنهاد می‌کنید؟' },
      ],
    },
  );
}

function servingsReply(
  context: AssistantContext,
  memory: AssistantConversationMemory,
  people: number,
  category: ProductCategory | null,
): LocalReply {
  const wanted: ProductCategory[] = category ? [category] : ['jelly', 'custard'];
  const lines: string[] = [];
  const usedProducts: AssistantProductFact[] = [];

  for (const item of wanted) {
    const candidates = productsOf(context, item).filter(isAvailable);
    const products = candidates.length > 0 ? candidates : productsOf(context, item);
    const product = products[0];
    if (!product) continue;
    const variant = cheapestVariant(product) ?? product.variants[0];
    if (!variant) continue;
    const gramsNeeded = people * GRAMS_PER_SERVING[item];
    const packs = Math.max(1, Math.ceil(gramsNeeded / variant.weightGrams));
    const servingsPerPack = Math.floor(variant.weightGrams / GRAMS_PER_SERVING[item]);
    lines.push(
      `• ${item === 'jelly' ? 'ژله' : 'کاستر'}: حدود ${fa(packs)} بستهٔ ${variant.weight} (هر بسته تقریباً ${fa(servingsPerPack)} پرس کوچک)`,
    );
    usedProducts.push(product);
  }

  if (lines.length === 0) {
    return reply('servings', CLARIFY_VARIANTS[0], {
      grounded: true,
      suggestions: DEFAULT_SUGGESTIONS.slice(0, 4),
    });
  }

  return reply(
    'servings',
    bubble(
      pick(memory, 'servings-open', [
        `برای ${fa(people)} نفر، برآورد تقریبی این مقدار است:`,
        `حساب کردم؛ برای ${fa(people)} نفر تقریباً این‌ها لازم است:`,
        `برای ${fa(people)} نفر، این برآورد بر پایهٔ دستور روی بسته است:`,
      ]),
      ...lines,
      'این برآورد تقریبی است — به اندازهٔ کاسه‌ها و لایه‌های شما کم و زیاد می‌شود.',
      pick(memory, 'servings-close', [
        'هر دو دسر را سرو می‌کنید؟ برای هر نفر یک پرس از هر کدام کافی است.',
        'اگر بخواید، همین بسته‌ها را با تأیید خودتون به سبد اضافه می‌کنم.',
        'بگید کدوم دسته را برمی‌دارید تا دقیق‌تر و با قیمت واقعی بچینمش.',
      ]),
    ),
    {
      links: [...productLinks(usedProducts, 2), link('دستور تهیه', '/recipes')],
      grounded: true,
      suggestions: [
        { label: 'طرز تهیه', prompt: 'طرز تهیه ژله چطور است؟' },
        { label: 'پیشنهاد ترکیب', prompt: 'چه ترکیب طعمی پیشنهاد می‌کنید؟' },
      ],
    },
  );
}

function budgetReply(context: AssistantContext, memory: AssistantConversationMemory, budget: number): LocalReply {
  const candidates = context.products
    .map((product) => ({ product, variant: cheapestVariant(product) }))
    .filter(
      (item): item is { product: AssistantProductFact; variant: NonNullable<ReturnType<typeof cheapestVariant>> } =>
        item.variant !== null && item.variant.price <= budget,
    )
    .sort((a, b) => a.variant.price - b.variant.price);

  if (candidates.length === 0) {
    const cheapest = context.priceRange?.min ?? null;
    return reply(
      'budget',
      bubble(
        `با ${price(budget)} فعلاً محصولی در فروشگاه جا نمی‌شود.`,
        cheapest
          ? `ارزان‌ترین گزینهٔ موجود ${price(cheapest)} است؛ اگر بودجه را کمی بالاتر ببرید، پیشنهاد بهتری دارم.`
          : 'فهرست محصولات را ببینید و اگر بودجه را بگویید، ترکیب پیشنهادی می‌سازم.',
      ),
      {
        links: [link('مشاهدهٔ محصولات', '/products')],
        grounded: true,
      },
    );
  }

  // انتخاب از ارزان به گران؛ حداکثر ۴ قلم و حداکثر ۲ ژله،
  // با اولویت این که از هر دو دسته (ژله و کاستر) در سبد باشد.
  const picked: { product: AssistantProductFact; variant: (typeof candidates)[number]['variant'] }[] = [];
  let total = 0;
  let jellyCount = 0;

  // مرحلهٔ ۱: ارزان‌ترین گزینهٔ هر دسته (اگر در بودجه جا شود)
  for (const category of ['jelly', 'custard'] as const) {
    const item = candidates.find((candidate) => candidate.product.category === category);
    if (!item || total + item.variant.price > budget) continue;
    picked.push(item);
    total += item.variant.price;
    if (category === 'jelly') jellyCount += 1;
  }

  // مرحلهٔ ۲: افزودن گزینه‌های تنوع‌دهنده تا سقف بودجه
  for (const item of candidates) {
    if (picked.length >= 4) break;
    if (picked.some((entry) => entry.product.id === item.product.id)) continue;
    if (item.product.category === 'jelly' && jellyCount >= 2) continue;
    if (total + item.variant.price > budget) continue;
    picked.push(item);
    total += item.variant.price;
    if (item.product.category === 'jelly') jellyCount += 1;
  }

  if (picked.length === 0) {
    const cheapest = candidates[0];
    picked.push(cheapest);
    total = cheapest.variant.price;
  }

  const remaining = budget - total;
  return reply(
    'budget',
    bubble(
      pick(memory, 'budget-open', [
        `با بودجهٔ ${price(budget)} این ترکیب را از محصولات موجود پیشنهاد می‌کنم:`,
        `بودجهٔ ${price(budget)} را که نگاه کنم، این سبد از قفسهٔ ژینو جواب می‌دهد:`,
      ]),
      ...picked.map(
        (item, index) =>
          `${fa(index + 1)}. ${item.product.shortName} — ${item.variant.weight}: ${price(item.variant.price)}`,
      ),
      `جمع: ${price(total)}${remaining > 0 ? ` — ${price(remaining)} از بودجه باقی می‌ماند` : ''}`,
      remaining >= context.settings.standardShippingCost
        ? 'با باقی‌ماندهٔ بودجه، کرایهٔ ارسال هم حساب می‌شه.'
        : freeShippingLine(context),
      pick(memory, 'budget-close', [
        'اگر دوست داشتید، همین‌ها را با یک تأیید خودتان به سبد اضافه می‌کنم.',
        'موردی از این فهرست را نخواستید؟ بگید تا جایگزین واقعیِ هم‌قیمتش را پیشنهاد بدم.',
      ]),
    ),
    {
      links: [...productLinks(picked.map((item) => item.product)), link('سبد خرید', '/cart')],
      grounded: true,
      products: picked.map((item) => item.product),
      suggestions: [
        { label: 'دستور تهیه', prompt: 'طرز تهیه کاستر چطور است؟' },
        { label: 'ترکیب طعم‌ها', prompt: 'چه ترکیب طعمی پیشنهاد می‌کنید؟' },
      ],
    },
  );
}

function pairingReply(context: AssistantContext, memory: AssistantConversationMemory, products: AssistantProductFact[]): LocalReply {
  const anchor = products[0];
  const suggestions: AssistantProductFact[] = [];
  let note = '';

  if (anchor) {
    // ۱) طعم مشترک در دو دسته: ژله + کاستر هم‌نام (لایه‌ای)
    const sameFlavor = context.products.filter(
      (product) => product.flavorLabel === anchor.flavorLabel && product.id !== anchor.id,
    );
    if (sameFlavor.length > 0) {
      suggestions.push(sameFlavor[0], anchor);
      note = 'همین طعم در دو دسته موجود است؛ دسر لایه‌ای با ژله و کاستر هم‌نام، مطمئن‌ترین انتخاب برای مهمانی است.';
    } else {
      const rule = FLAVOR_COMPLEMENTS.find((entry) => entry.flavor === anchor.flavorLabel);
      const partners = (rule?.partners ?? []).flatMap((name) => searchProducts(context, name));
      if (partners.length > 0) {
        suggestions.push(anchor, partners[0]);
        note = rule?.note ?? 'این دو طعم در کنار هم متعادل می‌شوند.';
      }
    }
  }

  if (suggestions.length === 0) {
    // ۲) طعمی که در هر دو دسته موجود است → مطمئن‌ترین ترکیب لایه‌ای
    for (const jelly of productsOf(context, 'jelly')) {
      if (!isAvailable(jelly)) continue;
      const partner = productsOf(context, 'custard').find(
        (product) => product.flavorLabel === jelly.flavorLabel && isAvailable(product),
      );
      if (partner) {
        suggestions.push(jelly, partner);
        note = 'همین طعم در دو دسته موجود است؛ ژله و کاستر هم‌طعم، دسر لایه‌ای خوش‌رنگی می‌سازند.';
        break;
      }
    }
  }

  if (suggestions.length === 0) {
    // ۳) پیشنهادهای پیش‌فرض از ترکیب‌های تحریریه، فقط اگر در فروشگاه موجود باشند
    for (const rule of FLAVOR_COMPLEMENTS) {
      const base = searchProducts(context, `ژله ${rule.flavor}`)[0] ?? searchProducts(context, rule.flavor)[0];
      const partner = rule.partners.flatMap((name) => searchProducts(context, name))[0];
      if (base && partner && isAvailable(base) && isAvailable(partner)) {
        suggestions.push(base, partner);
        note = rule.note;
        break;
      }
    }
  }

  if (suggestions.length === 0) {
    return reply(
      'pairing',
      bubble(
        'برای پیشنهاد ترکیب، فعلاً محصول کافی در فروشگاه نمی‌بینم؛ ترجیح می‌دهم چیزی از خودم نسازم.',
        'طعم‌های موجود را از صفحهٔ محصولات ببینید.',
      ),
      { links: [link('مشاهدهٔ محصولات', '/products')], grounded: true },
    );
  }

  return reply(
    'pairing',
    bubble(
      pick(memory, 'pairing-open', [
        'این ترکیب را پیشنهاد می‌کنم:',
        'جفت خوبی که به ذهنم می‌رسد این است:',
        'کنار هم که بگذاریم، این دو تا عالی می‌شینند:',
      ]),
      ...suggestions.map((product) => `• ${describeProduct(product)}`),
      note,
      pick(memory, 'pairing-close', [
        'اگر دوست داشتید، همین‌جا با تأیید خودتان به سبد اضافه‌شان می‌کنم.',
        'هرکدام را خواستید بگویید تا با قیمت و موجودی دقیق براتون بچینمش.',
      ]),
    ),
    {
      links: [...productLinks(suggestions, 3), link('سبد خرید', '/cart')],
      grounded: true,
      products: suggestions.slice(0, 3),
      suggestions: [
        { label: 'مقدار برای ۸ نفر', prompt: 'برای ۸ نفر چند بسته لازم است؟' },
        { label: 'دستور تهیه', prompt: 'طرز تهیه ژله چطور است؟' },
      ],
    },
  );
}

/** نشانه‌های سلیقه در متن کاربر → پیشنهاد شخصی‌سازی‌شده */
type Preference = 'cold' | 'warm' | 'chocolate' | 'fruity' | 'creamy' | 'quick' | 'party';

const PREFERENCE_RULES: { preference: Preference; keywords: string[] }[] = [
  { preference: 'cold', keywords: ['سرد', 'خنک', 'یخچال', 'تابستان', 'تابستانی', 'بستنی'] },
  { preference: 'warm', keywords: ['گرم', 'داغ', 'زمستان', 'شب یلدا', 'یلدا'] },
  { preference: 'chocolate', keywords: ['شکلات', 'کاکائو', 'شکلاتی'] },
  { preference: 'fruity', keywords: ['میوه', 'میوه‌ای', 'میوهای', 'ترش', 'کم شیرین'] },
  { preference: 'creamy', keywords: ['خامه', 'خامه‌ای', 'مخملی', 'شیری', 'محلبی'] },
  { preference: 'quick', keywords: ['سریع', 'آسان', 'وقت ندارم', 'فوری', 'کم‌زحمت'] },
  { preference: 'party', keywords: ['مهمانی', 'مهمان', 'جشن', 'تولد', 'میزبان', 'پذیرایی', 'ولنتاین'] },
];

function detectPreferences(normalized: string): Preference[] {
  return PREFERENCE_RULES.filter((rule) =>
    rule.keywords.some((keyword) => normalized.includes(normalizePersian(keyword))),
  ).map((rule) => rule.preference);
}

function suggestionReply(context: AssistantContext, memory: AssistantConversationMemory, preferences: Preference[]): LocalReply {
  if (preferences.length === 0) {
    return reply(
      'suggestion',
      bubble(
        pick(memory, 'suggestion-ask', [
          'دو چیز بگویید تا دقیق پیشنهاد بدهم: سرد می‌خواهید یا گرم؟ شکلاتی یا میوه‌ای؟',
          'برای اینکه واقعاً پیشنهاد خوبی بدهم، دو سؤال کوچک دارم: سرد یا گرم؟ میوه‌ای یا شکلاتی؟',
          'بگذارید درست پیشنهاد بدهم — چه حال‌وهوایی می‌خواهید؟ خنک و سبک، یا مخملی و شکلاتی؟',
        ]),
        'بعد از محصولات موجود، ترکیب مناسب را با قیمت واقعی برایتان می‌چینم.',
      ),
      {
        suggestions: [
          { label: 'سرد و میوه‌ای', prompt: 'یک دسر سرد و میوه‌ای پیشنهاد بده' },
          { label: 'شکلاتی', prompt: 'یک دسر شکلاتی پیشنهاد بده' },
          { label: 'گرم و مخملی', prompt: 'یک دسر گرم و مخملی پیشنهاد بده' },
          { label: 'سریع و آسان', prompt: 'یک دسر سریع و آسان پیشنهاد بده' },
        ],
      },
    );
  }

  const wantsCold = preferences.includes('cold') || preferences.includes('fruity') || preferences.includes('party');
  const wantsWarm = preferences.includes('warm') || preferences.includes('creamy') || preferences.includes('chocolate');

  const picks: AssistantProductFact[] = [];
  const reasons: string[] = [];

  const pushPick = (product: AssistantProductFact | undefined, reason: string) => {
    if (!product || !isAvailable(product)) return;
    if (picks.some((item) => item.id === product.id)) return;
    picks.push(product);
    reasons.push(reason);
  };

  if (preferences.includes('chocolate')) {
    pushPick(productsOf(context, 'custard').find((p) => p.flavorLabel.includes('کاکائو')), 'شکلاتی و مخملی؛ گرم یا سرد سرو می‌شود.');
    pushPick(productsOf(context, 'jelly').find((p) => p.flavorLabel.includes('موز')), 'کنار کاستر شکلاتی، دسر لایه‌ای معروفی می‌سازد.');
  }
  if (wantsCold) {
    pushPick(productsOf(context, 'jelly')[0], 'ژله سرد و سبک؛ برای پذیرایی و هوای گرم عالی است.');
  }
  if (wantsWarm) {
    pushPick(productsOf(context, 'custard')[0], 'کاستر گرم و مخملی؛ روی میوه یا به‌تنهایی.');
  }
  if (preferences.includes('quick')) {
    pushPick(productsOf(context, 'jelly')[0], 'سریع‌ترین گزینه: سه مرحله و بعد یخچال.');
  }
  if (preferences.includes('fruity')) {
    const fruity = productsOf(context, 'jelly').find((p) => ['توت فرنگی', 'انار', 'آلبالو', 'هلو'].some((f) => p.flavorLabel.includes(f)));
    pushPick(fruity, 'طعم میوه‌ای و خوش‌رنگ برای لایه‌بندی.');
  }
  if (picks.length === 0) {
    pushPick(context.products.find(isAvailable), 'نزدیک‌ترین گزینهٔ موجود به سلیقهٔ شما.');
  }
  if (picks.length === 0) {
    return reply('suggestion', CLARIFY_VARIANTS[0], { grounded: true });
  }

  const summary = pick(
    memory,
    'suggestion-summary',
    preferences.includes('party')
      ? [
          'برای پذیرایی، ترکیب ژله سرد و کاستر مخملی معمولاً جواب می‌دهد.',
          'مهمونی است؟ این ترکیب روی میز هم قشنگ می‌شود هم راحت پذیرایی می‌شوید.',
        ]
      : preferences.includes('quick')
        ? [
            'این گزینه‌ها کم‌زحمت‌ترین راه رسیدن به یک دسر خانگی‌اند.',
            'عجله دارید؟ این‌ها سریع‌ترین گزینه‌های قفسه‌اند.',
          ]
        : [
            'این ترکیب با سلیقهٔ گفته‌شدهٔ شما هم‌خوان است.',
            'از آنچه گفتید، این‌ها بیشترین تناسب را با سلیقهٔ شما دارند.',
          ],
  );

  return reply(
    'suggestion',
    bubble(
      summary,
      ...picks.map((product, index) => `${fa(index + 1)}. ${describeProduct(product)} — ${reasons[index] ?? ''}`.trim()),
      pick(memory, 'suggestion-close', [
        'موردی را پسندیدید؟ با یک تأیید، همین‌جا به سبد اضافه‌اش می‌کنم.',
        'اگر یکی از این‌ها مدنظرتون شد، بگید تا قیمت دقیق و موجودی‌ش را بگویم.',
      ]),
    ),
    {
      links: [...productLinks(picks, 3), link('سبد خرید', '/cart')],
      grounded: true,
      products: picks.slice(0, 3),
      suggestions: [
        { label: 'دستور تهیه', prompt: picks[0].category === 'jelly' ? 'طرز تهیه ژله چطور است؟' : 'طرز تهیه کاستر چطور است؟' },
        { label: 'مقدار برای ۸ نفر', prompt: 'برای ۸ نفر چند بسته لازم است؟' },
      ],
    },
  );
}

function shippingReply(context: AssistantContext, memory: AssistantConversationMemory): LocalReply {
  return reply(
    'shipping',
    bubble(
      freeShippingLine(context),
      `کرایهٔ ارسال عادی ${price(context.settings.standardShippingCost)} و ارسال سریع ${price(context.settings.expressShippingCost)} است.`,
      pick(memory, 'shipping-close', [
        'مبلغ نهایی و ارسال رایگان را در سبد خرید و تسویه حساب می‌بینید.',
        'اگر سفارش‌تان به آستانهٔ ارسال رایگان نزدیک است، قبل از ثبت نهایی بگویید تا با هم حساب کنیم.',
      ]),
    ),
    {
      links: [link('سبد خرید', '/cart'), link('مشاهدهٔ محصولات', '/products')],
      grounded: true,
    },
  );
}

/**
 * «این را به سبد اضافه کن» → پیشنهاد صریح، نه افزودن خودکار.
 *
 * خروجی این تابع فقط یک *پیشنهاد* است (cartOffer). رابط کاربری دکمهٔ
 * تأیید را نشان می‌دهد و تنها وقتی مشتری «بله، اضافه کن» را زد، همان
 * مسیر همیشگی سبد فروشگاه (CartContext.addItemWithToast) صدا زده می‌شود.
 * هیچ پرداخت یا تسویه‌حسابی از اینجا اجرا نمی‌شود.
 */
function addToCartReply(
  context: AssistantContext,
  memory: AssistantConversationMemory,
  products: AssistantProductFact[],
): LocalReply {
  const offer = cartOffersFor(products, 1)[0];

  if (!offer) {
    // نام محصول را یافته‌ایم ولی همین لحظه قابل سفارش نیست: صادقانه
    // می‌گوییم و هیچ پیشنهاد افزودنی نمی‌سازیم. (طعم دیگری را بی‌اجازه
    // جایگزین نمی‌کنیم.)
    const namedOutOfStock = products.filter((item) => !isAvailable(item));
    if (namedOutOfStock.length > 0) {
      const first = namedOutOfStock[0];
      const others = context.products.filter(isAvailable).slice(0, 3);
      return reply(
        'add-to-cart',
        bubble(
          pick(memory, 'cart-miss', [
            `«${first.shortName}» را پیدا کردم، ولی همین لحظه موجود نیست و چیزی به سبد اضافه نکردم.`,
            `متأسفانه «${first.shortName}» الان روی قفسه نیست؛ چیزی اضافه نکردم که بعداً دستتان بماند.`,
          ]),
          others.length > 0
            ? `طعم‌های موجود الان: ${others.map((item) => item.shortName).join('، ')}.`
            : 'بقیهٔ محصولات را هم که نگاه می‌کنم، فعلاً قابل سفارش نیستند.',
          pick(memory, 'cart-miss-close', [
            'هر وقت موجود شد، همین‌جا بگویید تا با تأیید خودتان اضافه کنم.',
            'یکی از همین‌های موجود نزدیک‌ترِ دل شماست؟ بگید تا با تأییدتان اضافه‌اش کنم.',
          ]),
        ),
        {
          links: [link('مشاهدهٔ محصولات', '/products')],
          grounded: true,
          products: namedOutOfStock.slice(0, 3),
          suggestions: [{ label: 'طعم‌های موجود', prompt: 'چه طعم‌هایی دارید؟' }],
        },
      );
    }

    const available = context.products.filter(isAvailable);
    const guess = available[0];
    if (!guess) {
      return reply(
        'add-to-cart',
        bubble(
          'الان محصول قابل سفارشی در فروشگاه نمی‌بینم؛ برای همین چیزی به سبد اضافه نمی‌کنم.',
          'وقتی موجودی برگشت، همین‌جا بگویید تا اضافه کنم.',
        ),
        { links: [link('مشاهدهٔ محصولات', '/products')], grounded: true },
      );
    }
    const fallback = cartOffersFor([guess], 1)[0];
    if (!fallback) {
      return reply(
        'add-to-cart',
        'کدام محصول را اضافه کنم؟ نام طعم را بگویید (مثلاً «ژله انار») تا با تأیید شما به سبد اضافه کنم.',
        { links: [link('مشاهدهٔ محصولات', '/products')], grounded: true },
      );
    }
    return reply(
      'add-to-cart',
      bubble(
        'اسم محصول را پیدا نکردم؛ نزدیک‌ترین گزینهٔ موجود این است:',
        `• ${describeProduct(guess)}`,
        'همین را اضافه کنم؟ دکمهٔ تأیید را بزنید تا به سبد خرید اضافه شود.',
      ),
      {
        links: [link('مشاهدهٔ محصولات', '/products')],
        grounded: true,
        products: [guess],
        suggestions: [{ label: 'طعم‌های موجود', prompt: 'چه طعم‌هایی دارید؟' }],
      },
    );
  }

  const product = products.find((item) => item.id === offer.productId);
  const stockNote =
    offer.stock <= context.settings.lowStockThreshold
      ? ` (تنها ${fa(offer.stock)} عدد باقی مانده)`
      : '';

  return reply(
    'add-to-cart',
    bubble(
      `حتماً — این گزینه را پیدا کردم: ${offer.label} به قیمت ${price(offer.price)}${stockNote}.`,
      pick(memory, 'cart-offer', [
        'دکمهٔ «بله، اضافه کن» را بزنید تا به سبد خرید اضافه شود؛ پرداخت و ثبت سفارش با خودتان است و من خودکار انجامش نمی‌دهم.',
        'فقط دکمهٔ «بله، اضافه کن» را بزنید. هیچ‌چیز را بدون اجازهٔ شما به سبد نمی‌برم.',
      ]),
    ),
    {
      links: [link('سبد خرید', '/cart')],
      grounded: true,
      products: product ? [product] : [],
      cartOffer: offer,
      suggestions: [{ label: 'دیدن سبد خرید', prompt: 'سبد خریدم چه چیزهایی دارد؟' }],
    },
  );
}

function orderHelpReply(memory: AssistantConversationMemory): LocalReply {
  return reply(
    'order-help',
    bubble(
      pick(memory, 'order-open', [
        'سفارش خیلی ساده است:',
        'خرید از ژینو سه قدم دارد:',
        'راهنمای سریع سفارش:',
      ]),
      '۱. محصول را انتخاب کنید — از صفحهٔ محصولات، یا همین‌جا بگویید تا با تأیید خودتان به سبد اضافه کنم.',
      '۲. در سبد خرید تعداد را بررسی کنید.',
      '۳. در تسویه حساب مشخصات تحویل‌گیرنده را پر کنید و سفارش را ثبت کنید.',
      pick(memory, 'order-close', [
        'جایی گیر کردید؟ همین‌جا بنویسید، با هم ردیفش می‌کنیم.',
        'هر قدمش که سؤال داشت، همین‌جا هستم.',
      ]),
    ),
    {
      links: [link('مشاهدهٔ محصولات', '/products'), link('سبد خرید', '/cart'), link('تسویه حساب', '/checkout')],
    },
  );
}

/* ── تشخیص موضوع پرسش ──────────────────────────────────────── */

interface IntentRule {
  id: AssistantCapabilityId;
  keywords: string[];
}

const INTENT_RULES: IntentRule[] = [
  { id: 'recipe-jelly', keywords: ['طرز تهیه ژله', 'دستور ژله', 'ژله درست کنم', 'ژله بپزم', 'چطور ژله'] },
  { id: 'recipe-custard', keywords: ['طرز تهیه کاستر', 'دستور کاستر', 'کاستر درست کنم', 'کاستر بپزم', 'چطور کاستر'] },
  { id: 'servings', keywords: ['چند بسته', 'چقدر لازم', 'چقدر پودر', 'برای چند نفر', 'مقدار لازم', 'به اندازه'] },
  {
    id: 'budget',
    keywords: ['بودجه', 'با این پول', 'چقدر پول', 'کم هزینه', 'کم‌هزینه', 'ارزان ترین', 'ارزان‌ترین'],
  },
  { id: 'pairing', keywords: ['ترکیب طعم', 'ترکیب', 'کنار هم', 'با هم بخوره', 'لایه ای', 'لایه‌ای', 'با چی', 'چی خوبه'] },
  {
    id: 'suggestion',
    keywords: [
      'پیشنهاد بده',
      'پیشنهاد کن',
      'پیشنهاد دسر',
      'چی درست کنم',
      'چه دسری',
      'سلیقه',
      'مهمانی',
      'تولد',
      'پذیرایی',
      'دسر',
      'میخوام',
      'میخام',
      'می خواهم',
      'دوست دارم',
      'شیرینی',
    ],
  },
  {
    id: 'add-to-cart',
    keywords: [
      'اضافه کن',
      'اضافه‌اش کن',
      'بیفزا',
      'بگذار توی سبد',
      'بذار تو سبد',
      'به سبد',
      'توی سبد',
      'سبد خرید اضافه',
      'سفارش بده',
      'اضافه میشه',
      'برام بگذار',
      'برام بذار',
    ],
  },
  { id: 'shipping', keywords: ['ارسال', 'کرایه', 'پست', 'رایگان', 'هزینه ارسال', 'پیک'] },
  { id: 'order-help', keywords: ['سفارش', 'خرید', 'سبد', 'تسویه', 'پرداخت', 'ثبت سفارش', 'رهگیری'] },
  {
    id: 'price-stock',
    keywords: [
      'قیمت',
      'موجود',
      'موجودی',
      'تمام شده',
      'قیمتش',
      'چند تومان',
      // محاوره: «چنده»، «چقدره»، «چند در میاد»
      'چنده',
      'چقدره',
      'چقدر می',
      'چند میشه',
      'چند در میاد',
      'چند میارزه',
    ],
  },
  { id: 'catalog', keywords: ['محصولات', 'محصول', 'معرفی', 'لیست', 'چیا دارید', 'چه دارید', 'فروشگاه', 'کاتالوگ', 'طعم ها', 'طعمها', 'چند تا'] },
  { id: 'flavors', keywords: ['چه طعم', 'چی طعم', 'طعم ها', 'طعمها', 'طعم هاش', 'انواع طعم', 'طعم دارید', 'چه مزه', 'طعماش'] },
  { id: 'guide', keywords: ['انتخاب', 'راهنما', 'تفاوت', 'کدام', 'بهتر', 'ژله یا کاستر', 'تازه کار', 'نمی دانم چه'] },
  { id: 'recipe-jelly', keywords: ['ژله'] },
  { id: 'recipe-custard', keywords: ['کاستر'] },
];

/** تشخیص بهترین موضوع؛ امتیاز = مجموع طول کلیدواژه‌های پیداشده */
function detectIntent(normalized: string): { id: AssistantCapabilityId; score: number } {
  let best: { id: AssistantCapabilityId; score: number } = { id: 'guide', score: 0 };
  for (const rule of INTENT_RULES) {
    const score = rule.keywords.reduce(
      (sum, keyword) => (normalized.includes(normalizePersian(keyword)) ? sum + keyword.length : sum),
      0,
    );
    if (score > best.score) best = { id: rule.id, score };
  }
  return best;
}

const GREETING_PATTERNS = ['سلام', 'درود', 'وقت بخیر', 'روز بخیر', 'hello', 'hi', 'کمک', 'شروع'];

/** تشکر کوتاه مشتری — به‌جای پاسخ رباتیکِ «محدودهٔ من»، گرم جواب می‌دهیم */
const THANKS_PATTERNS = ['مرسی', 'ممنون', 'مچکریم', 'مچ کریم', 'دستت درد نکنه', 'دست درد نکنه', 'متشکرم', 'متشکر', 'لطف کردید', 'لطف کردی'];

/** خداحافظی کوتاه */
const BYE_PATTERNS = ['خداحافظ', 'خدافظ', 'بدرود', 'بای بای', 'بای'];

/** تأیید کوتاه («بله/آره») — اگر محصولی موضوعِ بحث بود، همان را پیشنهاد افزودن می‌دهیم */
const AFFIRM_PATTERNS = ['بله', 'بلی', 'اره', 'آره', 'اوهوم', 'اوکی', 'اکی', 'باشه', 'حله', 'قبوله', 'آری', 'اوکیه'];

/** رد کوتاه — بدون اصرار */
const DECLINE_PATTERNS = ['نخیر', 'نمیخوام', 'نمی خوام', 'بیخیال', 'بی خیال', 'فعلا نه', 'نه ممنون', 'بعدا'];

const DOMAIN_HINTS = [
  'ژینو', 'ژله', 'کاستر', 'دسر', 'محصول', 'خرید', 'سفارش', 'قیمت', 'موجود', 'طعم',
  'تهیه', 'دستور', 'بسته', 'ارسال', 'سبد', 'پودر', 'مهمانی', 'پیشنهاد', 'ترکیب', 'کیک', 'دسر',
];

/** هستهٔ تشخیص موضوع و ساخت پاسخ (بدون پیوست‌کردن منبع داده) */
function resolveAnswer(
  question: string,
  context: AssistantContext,
  memory: AssistantConversationMemory,
): LocalReply {
  const normalized = normalizePersian(question);

  if (normalized.length === 0) {
    return reply('open', pick(memory, 'clarify', CLARIFY_VARIANTS), {
      suggestions: DEFAULT_SUGGESTIONS.slice(0, 4),
    });
  }

  const intent = detectIntent(normalized);
  const flavorProducts = matchFlavorProducts(context, normalized);
  const people = parsePeople(normalized);

  /* ── لایهٔ مکالمهٔ طبیعی (فاز ۱۲) ──
     سلام، تشکر، خداحافظی، «بله/نه» — این‌ها سؤال نیستند؛ رفتار
     فروشنده را می‌سازند. فقط وقتی هیچ نشانهٔ موضوعی دیگری در متن
     نیست فعال می‌شوند تا سؤال‌های واقعی هیچ‌وقت قربانی نشوند. */

  // سلام و احوال‌پرسی — بار اول خود معرفی، دفعات بعد گرم و کوتاه
  if (normalized.length <= 12 && GREETING_PATTERNS.some((item) => normalized.includes(item))) {
    memory.greeted = true;
    const text =
      memory.turns === 0
        ? pick(memory, 'greet-first', GREETING_FIRST_VARIANTS)
        : pick(memory, 'greet-again', GREETING_AGAIN_VARIANTS);
    return reply('open', text, {
      grounded: true,
      suggestions: DEFAULT_SUGGESTIONS.slice(0, 4),
    });
  }

  const noOtherSignal = intent.score === 0 && flavorProducts.length === 0;

  // تشکر — به‌جای پاسخ رباتیکِ «محدودهٔ من»
  if (noOtherSignal && normalized.length <= 20 && THANKS_PATTERNS.some((item) => normalized.includes(item))) {
    return reply('open', pick(memory, 'thanks', THANKS_VARIANTS), {
      grounded: true,
      suggestions: DEFAULT_SUGGESTIONS.slice(0, 4),
    });
  }

  // خداحافظی کوتاه — بدون اصرار
  if (noOtherSignal && normalized.length <= 16 && BYE_PATTERNS.some((item) => normalized.includes(item))) {
    return reply('open', pick(memory, 'bye', BYE_VARIANTS), {
      grounded: true,
    });
  }

  // رد کوتاه («نه ممنون») — فاصله را محترم می‌شماریم
  if (noOtherSignal && normalized.length <= 16 && DECLINE_PATTERNS.some((item) => normalized.includes(item))) {
    return reply('open', pick(memory, 'decline', DECLINE_VARIANTS), {
      grounded: true,
    });
  }

  // تأیید کوتاه («بله/آره») — اگر محصولی چند لحظه پیش موضوع بود،
  // پیشنهاد افزودنِ همان را با دکمهٔ تأیید می‌آوریم (بدون افزودن خودکار)
  if (noOtherSignal && normalized.length <= 14 && AFFIRM_PATTERNS.some((item) => normalized.includes(item))) {
    const discussed = memory.lastProducts.find(isAvailable);
    if (discussed) {
      return addToCartReply(context, memory, [discussed]);
    }
    return reply('open', pick(memory, 'affirm', AFFIRM_NUDGE_VARIANTS), {
      grounded: true,
      suggestions: DEFAULT_SUGGESTIONS.slice(0, 4),
    });
  }

  // «اطلاعاتت را از کجا می‌آوری؟» → پاسخ صادقانه از وضعیت واقعی همگام‌سازی
  if (SOURCE_INFO_KEYWORDS.some((keyword) => normalized.includes(normalizePersian(keyword)))) {
    return sourceInfoReply(context, memory);
  }

  // «این را به سبد اضافه کن» — پیش از بقیهٔ موضوع‌ها بررسی می‌شود، چون
  // واژهٔ «سبد» در غیر این صورت به راهنمای سفارش می‌رفت. خروجی فقط یک
  // پیشنهاد است؛ افزودن واقعی با تأیید مشتری در رابط کاربری انجام می‌شود.
  if (intent.id === 'add-to-cart') {
    // اگر مشتری نام طعم را در همین پیام نیاورده ولی همین‌قبل دربارهٔ
    // محصولی حرف زده‌ایم، همان را پیشنهاد می‌دهیم (فروشندهٔ گوش‌دهنده).
    const discussed = memory.lastProducts.filter(isAvailable).slice(0, 1);
    const productsForCart = flavorProducts.length > 0 ? flavorProducts : discussed;
    return addToCartReply(context, memory, productsForCart);
  }

  // اولویت‌ها: عدد نفرات ← بودجه ← تشخیص موضوع ← تطبیق طعم
  if (people !== null && (intent.id === 'servings' || intent.score === 0 || normalized.includes('نفر'))) {
    const category: ProductCategory | null = normalized.includes('کاستر')
      ? 'custard'
      : normalized.includes('ژله')
        ? 'jelly'
        : null;
    return servingsReply(context, memory, people, category);
  }

  const mentionsShipping = /(ارسال|کرایه|پست|پیک)/.test(normalized);
  const asksCost = /(هزینه|کرایه|چند|چقدر|قیمت)/.test(normalized);

  // «هزینه پست چنده؟» دربارهٔ محصول نیست، دربارهٔ ارسال است
  if (
    flavorProducts.length === 0 &&
    ((intent.id === 'shipping' && mentionsShipping) || (mentionsShipping && asksCost))
  ) {
    return shippingReply(context, memory);
  }

  if (intent.id === 'budget' || (intent.id !== 'price-stock' && !mentionsShipping && /(بودجه|با \d)/.test(normalized))) {
    const amount = parseAmount(normalized);
    if (amount !== null) return budgetReply(context, memory, amount);
  }

  /* پیگیری طبیعی گفتگو: «قیمتش چنده؟» / «موجوده؟» بدون ذکر نام طعم.
     اگر چند لحظه قبل محصولی معرفی کرده‌ایم، دربارهٔ همان جواب می‌دهیم
     — مثل یک فروشنده که می‌داند مشتری دربارهٔ چه حرف می‌زند. */
  const asksCatalogList = /(همه|لیست|فهرست|چیا|چه طعم)/.test(normalized);
  if (
    flavorProducts.length === 0 &&
    !asksCatalogList &&
    intent.id === 'price-stock' &&
    memory.lastProducts.length > 0
  ) {
    return priceStockReply(context, memory, memory.lastProducts, true);
  }

  if (flavorProducts.length > 0 && (intent.id === 'price-stock' || intent.score === 0)) {
    return intent.id === 'price-stock'
      ? priceStockReply(context, memory, flavorProducts)
      : flavorReply(context, memory, flavorProducts);
  }

  // اگر کاربر دنبال محصولی با طعمی است که در فروشگاه نیست
  // («ژله گیلاس دارید؟») پیش از هر پاسخ دیگری، صریح و صادقانه بگوییم.
  const asksAboutAvailability = /(دارید|دارین|موجود|قیمت|قیمتش|هست|هستش|بفروش|می فروش|چند تومان)/.test(normalized);
  const missingFlavor = FLAVOR_HINTS.some(
    (hint) =>
      normalized.includes(normalizePersian(hint)) &&
      !context.products.some((product) => product.flavorLabel.includes(normalizePersian(hint))),
  );
  if (missingFlavor && asksAboutAvailability && intent.score < 9) {
    return flavorReply(context, memory, []);
  }

  // فقط موضوع‌های واقعاً تشخیص‌داده‌شده پاسخ می‌گیرند؛ وقتی هیچ
  // کلیدواژه‌ای پیدا نشد، سراغ پاسخ‌های عمومی/محدودهٔ کار می‌رویم.
  if (intent.score > 0) switch (intent.id) {
    case 'recipe-jelly':
      return recipeReply(context, memory, normalized.includes('کاستر') && !normalized.includes('ژله') ? 'custard' : 'jelly');
    case 'recipe-custard':
      return recipeReply(context, memory, 'custard');
    case 'servings':
      return servingsReply(context, memory, people ?? 8, normalized.includes('کاستر') ? 'custard' : normalized.includes('ژله') ? 'jelly' : null);
    case 'budget': {
      const amount = parseAmount(normalized);
      return amount !== null
        ? budgetReply(context, memory, amount)
        : reply(
            'budget',
            pick(memory, 'budget-ask', [
              'بودجهٔ تقریبی‌تان را بگویید (مثلاً «۵۰۰ هزار تومان») تا ترکیب پیشنهادی را از محصولات موجود بسازم.',
              'حدوداً چقدر در نظر دارید؟ بگید تا سبدی متناسب از همین قفسهٔ ژینو بچینم.',
            ]),
            {
              grounded: true,
              suggestions: [
                { label: '۳۰۰ هزار تومان', prompt: 'با ۳۰۰ هزار تومان چه ترکیبی بگیرم؟' },
                { label: '۵۰۰ هزار تومان', prompt: 'با ۵۰۰ هزار تومان چه ترکیبی بگیرم؟' },
              ],
            },
          );
    }
    case 'pairing':
      return pairingReply(context, memory, flavorProducts);
    case 'suggestion': {
      const preferences = detectPreferences(normalized);
      // بدون هیچ نشانهٔ سلیقه، اگر مشتری طعم/محصول مشخصی را نام برده،
      // همان را معرفی می‌کنیم؛ وگرنه دو پرسش کوتاه برای دقیق‌شدن می‌پرسیم.
      if (preferences.length === 0 && flavorProducts.length > 0) {
        return flavorReply(context, memory, flavorProducts);
      }
      return suggestionReply(context, memory, preferences);
    }
    case 'shipping':
      return shippingReply(context, memory);
    case 'order-help':
      return orderHelpReply(memory);
    case 'price-stock':
      return priceStockReply(context, memory, flavorProducts);
    case 'catalog':
      return catalogReply(context, memory);
    case 'flavors':
      return flavorsReply(context, memory);
    case 'guide':
      return flavorProducts.length > 0 ? flavorReply(context, memory, flavorProducts) : guideReply(context, memory);
    default:
      break;
  }

  if (flavorProducts.length > 0) return flavorReply(context, memory, flavorProducts);

  // پرسش بیرون از حوزهٔ ژینو
  const inDomain = DOMAIN_HINTS.some((hint) => normalized.includes(normalizePersian(hint)));
  if (!inDomain) {
    return reply('scope', pick(memory, 'scope', SCOPE_VARIANTS), {
      grounded: true,
      links: [link('مشاهدهٔ محصولات', '/products'), link('دستور تهیه', '/recipes')],
      suggestions: DEFAULT_SUGGESTIONS.slice(0, 4),
    });
  }

  return reply('open', pick(memory, 'clarify', CLARIFY_VARIANTS), {
    grounded: true,
    suggestions: DEFAULT_SUGGESTIONS.slice(0, 4),
  });
}

/**
 * پاسخ محلی به یک پرسش کاربر.
 *
 * خروجی همیشه یک AssistantReply است؛ هیچ خطایی به UI نمی‌رسد و
 * منبع داده (دیتابیس یا دادهٔ محلی) همیشه به پاسخ پیوست می‌شود تا
 * رابط کاربری و مدل بتوانند صادقانه بگویند پاسخ بر چه چیزی ساخته شده.
 *
 * `memory` حافظهٔ همین گفتگوست (اختیاری؛ اگر نیاید گفتگوی تازه فرض
 * می‌شود): آخرین محصولاتِ موضوعِ بحث و واریانت‌های تازه‌استفاده‌شده
 * را نگه می‌دارد تا پاسخ‌ها متناسب با پیام قبلی باشند و تکراری نشوند.
 */
export function answerLocally(
  question: string,
  context: AssistantContext,
  memory: AssistantConversationMemory = createAssistantMemory(),
): AssistantReply {
  const answer = resolveAnswer(question, context, memory);
  // به‌روزرسانی حافظه پس از ساختن پاسخ — برای پیگیری‌های طبیعی نوبت بعد
  memory.turns += 1;
  memory.lastIntent = answer.capability;
  if (answer.products && answer.products.length > 0) {
    memory.lastProducts = answer.products;
  }
  return { ...answer, dataSource: context.dataSource };
}

/*
 * فاز ۸: «منبع داده» دیگر هیچ‌وقت داخل پاسخ به مشتری گفته نمی‌شود.
 * اتصال دیتابیس و Fallback محلی دقیقاً مثل قبل در پشت صحنه کار می‌کنند
 * (knowledge.ts همان کارت اطلاعات زنده را می‌سازد و engine.ts همان
 * قیمت/موجودی/دستور واقعی را می‌خواند)؛ فقط متن فنی از حباب پاسخ حذف شده.
 */
