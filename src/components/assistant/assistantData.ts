// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۴ — فقط رابط کاربری)
//
// این فایل عمداً بدون هیچ اتصال شبکه‌ای است: هر پاسخ یک متن
// از پیش نوشته‌شده (نمایشی) است و هیچ درخواستی به هوش مصنوعی،
// Supabase یا هر API دیگری فرستاده نمی‌شود. اتصال واقعی در
// مرحلهٔ بعد انجام می‌شود.
//
// اما داده‌های زنده (تعداد محصولات، قیمت‌ها، آستانهٔ ارسال رایگان
// و دستورهای رسمی روی بسته) از همان سرویس‌های فروشگاه خوانده
// می‌شوند؛ بنابراین یک پاسخ نمایشی هرگز با کاتالوگ فعلی تناقض
// پیدا نمی‌کند و قیمت/موجودی جایی تکرار (و کهنه) نمی‌شود.
// ============================================================

import { RECIPES } from '../../data/recipes';
import { getVisibleProducts } from '../../services/catalog';
import { getSettings } from '../../services/settings';
import { formatNumber, formatPrice } from '../../utils/format';
import { withSiteBase } from '../../utils/siteBase';

/**
 * تصویر اختصاصی ربات دستیار — یک هویت بصری واحد برای دکمهٔ
 * شناور و سربرگ چت (فایل: public/images/assistant/zhino-assistant.png).
 * آدرس نسبت به محل نصب سایت ساخته می‌شود، پس روی دامنهٔ اصلی و
 * روی مسیر مخزن هر دو درست باز می‌شود.
 */
export const ASSISTANT_BOT_IMAGE = withSiteBase('images/assistant/zhino-assistant.png');

/** پیام خوش‌آمدگویی فارسی */
export const ASSISTANT_GREETING =
  'سلام و درود! من «دستیار ژینو» هستم؛ راهنمای انتخاب محصول، طرز تهیهٔ ژله و کاستر و معرفی محصولات را برایتان می‌آورم.';

/** شفاف‌سازی صادقانه: این نسخه نمایشی است (مانند حالت نمایشی ورود پنل) */
export const ASSISTANT_DEMO_NOTE =
  'نسخهٔ نمایشی — پاسخ‌ها از پیش آماده‌اند و اتصال به دستیار هوشمند در مرحلهٔ بعد فعال می‌شود.';

/** پیام وقتی پرسش کاربر با هیچ یک از موضوع‌های آماده هم‌خوانی ندارد */
export const ASSISTANT_FALLBACK =
  'در این نسخهٔ نمایشی فقط دربارهٔ چهار موضوع زیر می‌توانم کمک کنم؛ یکی از پیشنهادهای پایین کادر گفتگو را انتخاب کنید.';

export type AssistantIntentId =
  | 'product-guide'
  | 'jelly-recipe'
  | 'custard-recipe'
  | 'product-intro';

export interface AssistantIntent {
  id: AssistantIntentId;
  /** برچسب پیشنهاد آماده (چیپ) */
  chip: string;
  /** متنی که با کلیک روی چیپ در گفتگو ثبت می‌شود */
  prompt: string;
  /** تطبیق سادهٔ کلیدواژه‌ای برای پرسش تایپی (فقط همین نسخهٔ نمایشی) */
  keywords: string[];
}

/** چهار پیشنهاد آمادهٔ خواسته‌شده در صورت‌مسئله */
export const ASSISTANT_INTENTS: AssistantIntent[] = [
  {
    id: 'product-guide',
    chip: 'راهنمای انتخاب محصول',
    prompt: 'برای انتخاب محصول راهنمایی می‌کنید؟',
    keywords: ['انتخاب', 'راهنما', 'پیشنهاد', 'کدام', 'تفاوت', 'بهتر'],
  },
  {
    id: 'jelly-recipe',
    chip: 'طرز تهیه ژله',
    prompt: 'طرز تهیه ژله چطور است؟',
    keywords: ['ژله', 'دستور', 'تهیه', 'درست'],
  },
  {
    id: 'custard-recipe',
    chip: 'طرز تهیه کاستر',
    prompt: 'طرز تهیه کاستر چطور است؟',
    keywords: ['کاستر', 'کاسترد', 'شیر', 'دستور', 'تهیه'],
  },
  {
    id: 'product-intro',
    chip: 'معرفی محصولات',
    prompt: 'محصولات ژینو را معرفی می‌کنید؟',
    keywords: ['محصول', 'معرفی', 'لیست', 'طعم', 'قیمت', 'فروشگاه'],
  },
];

/** دادهٔ زندهٔ کاتالوگ — فقط برای اینکه پاسخ نمایشی با فروشگاه هم‌خوان بماند */
function catalogFacts() {
  const products = getVisibleProducts();
  const jelly = products.filter((p) => p.category === 'jelly').length;
  const custard = products.filter((p) => p.category === 'custard').length;
  const prices = products
    .flatMap((p) => p.variants.filter((v) => v.available).map((v) => v.price))
    .filter((price) => Number.isFinite(price));
  const weights = Array.from(new Set(products.flatMap((p) => p.variants.map((v) => v.weight))));
  return {
    jelly,
    custard,
    total: products.length,
    cheapest: prices.length > 0 ? Math.min(...prices) : null,
    weight: weights.length === 1 ? weights[0] : '',
  };
}

/** آستانهٔ ارسال رایگان از تنظیمات فروشگاه (پیش‌فرض: همان ثابت قبلی) */
function freeShippingFact(): string {
  return formatPrice(getSettings().freeShippingThreshold);
}

function jellyReply(): string {
  const recipe = RECIPES.find((r) => r.id === 'jelly-basic');
  if (!recipe) return ASSISTANT_FALLBACK;
  return [
    `«${recipe.title}» — ${recipe.summary}`,
    ...recipe.steps.map((step, index) => `${formatNumber(index + 1)}. ${step}`),
    'برای لایه‌های رنگی، هر لایه را جدا آماده کنید و پیش از ریختن لایهٔ بعدی کمی در یخچال بگذارید تا ببندد.',
    'همین دستور روی بستهٔ محصول هم آمده است؛ برای دیدن نسخهٔ کامل به صفحهٔ دستور تهیه سر بزنید.',
  ].join('\n');
}

function custardReply(): string {
  const recipe = RECIPES.find((r) => r.id === 'custard-basic');
  if (!recipe) return ASSISTANT_FALLBACK;
  return [
    `«${recipe.title}» — ${recipe.summary}`,
    ...recipe.steps.map((step, index) => `${formatNumber(index + 1)}. ${step}`),
    'اگر دسر را گرم سرو می‌کنید، بگذارید کمی بیفتد و بعد در کاسه بریزید.',
    'همین دستور روی بستهٔ محصول هم آمده است؛ برای دیدن نسخهٔ کامل به صفحهٔ دستور تهیه سر بزنید.',
  ].join('\n');
}

function productGuideReply(): string {
  const { jelly, custard } = catalogFacts();
  return [
    'برای انتخاب، اول ببینید دسرتان سرد است یا گرم:',
    '• «پودر ژله» بافت لرزان و سبک دارد؛ سرو سرد، مناسب مهمانی، دسر تابستانی و تزیین روی دسر.',
    '• «پودر کاستر» بافت مخملی و خامه‌ای دارد؛ سرو گرم یا سرد، مناسب روی میوه، لایهٔ میانی کیک و دسر خانگی.',
    `اکنون در فروشگاه، ${formatNumber(jelly)} طعم ژله و ${formatNumber(custard)} طعم کاستر فعال است.`,
    'اگر تازه‌کار هستید با یک طعم آشنا شروع کنید و بعد سراغ طعم‌های خاص بروید.',
  ].join('\n');
}

function productIntroReply(): string {
  const { jelly, custard, total, cheapest, weight } = catalogFacts();
  const packLine = weight ? `همه در بسته‌بندی ${weight}ی.` : '';
  const priceLine =
    cheapest !== null
      ? `قیمت‌ها از ${formatPrice(cheapest)} شروع می‌شود و برای سفارش‌های بالای ${freeShippingFact()} ارسال رایگان است.`
      : `برای سفارش‌های بالای ${freeShippingFact()} ارسال رایگان است.`;
  return [
    `ژینو ${formatNumber(total)} محصول دارد: ${formatNumber(jelly)} طعم پودر ژله و ${formatNumber(custard)} طعم پودر کاستر. ${packLine}`.trim(),
    priceLine,
    'طعم‌های محبوب مشتریان: انار، توت فرنگی و آلبالو برای ژله؛ کاکائو، موز و محلبی وانیلی برای کاستر.',
    'موجودی و قیمت هر محصول در صفحهٔ آن به‌روز است.',
  ].join('\n');
}

const REPLIES: Record<AssistantIntentId, () => string> = {
  'product-guide': productGuideReply,
  'jelly-recipe': jellyReply,
  'custard-recipe': custardReply,
  'product-intro': productIntroReply,
};

/** مسیرهای داخلی که هر پاسخ می‌تواند پیشنهاد کند (فقط لینک‌های موجود سایت) */
const INTENT_LINKS: Record<AssistantIntentId, { label: string; to: string }[]> = {
  'product-guide': [
    { label: 'مشاهدهٔ محصولات', to: '/products' },
    { label: 'همهٔ طعم‌ها', to: '/#flavors' },
  ],
  'jelly-recipe': [
    { label: 'صفحهٔ دستور تهیه', to: '/recipes' },
    { label: 'محصولات ژله', to: '/products' },
  ],
  'custard-recipe': [
    { label: 'صفحهٔ دستور تهیه', to: '/recipes' },
    { label: 'محصولات کاستر', to: '/products' },
  ],
  'product-intro': [
    { label: 'مشاهدهٔ محصولات', to: '/products' },
    { label: 'دربارهٔ ژینو', to: '/about' },
  ],
};

export function intentLinks(intentId: AssistantIntentId): { label: string; to: string }[] {
  return INTENT_LINKS[intentId];
}

/** پاسخ نمایشی یک موضوع مشخص */
export function buildAssistantReply(intentId: AssistantIntentId): string {
  const build = REPLIES[intentId];
  try {
    return build();
  } catch {
    // کاتالوگ/تنظیمات باید همیشه پاسخ بدهند؛ اگر روزی ندادند، گفتگو
    // نمی‌شکند و همان متن پیش‌فرض نمایش داده می‌شود.
    return ASSISTANT_FALLBACK;
  }
}

/**
 * تشخیص سادهٔ موضوع از متن کاربر (بدون هوش مصنوعی).
 * «کاستر» بر «ژله» مقدم است: متن «طرز تهیه کاستر» هر دو کلیدواژه را
 * دارد و باید به دستور کاستر برسد.
 */
export function matchIntent(text: string): AssistantIntentId | null {
  const normalized = text.replace(/[ىي]/g, 'ی').replace(/\u200c/g, ' ');
  let best: { id: AssistantIntentId; score: number } | null = null;
  for (const intent of ASSISTANT_INTENTS) {
    const score = intent.keywords.reduce(
      (sum, keyword) => (normalized.includes(keyword) ? sum + keyword.length : sum),
      0,
    );
    if (score > 0 && (!best || score > best.score)) best = { id: intent.id, score };
  }
  return best?.id ?? null;
}
