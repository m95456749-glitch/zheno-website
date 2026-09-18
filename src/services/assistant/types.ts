// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۵ و ۶) — قرارداد دادهٔ مشترک
//
// این فایل فقط تایپ است: هیچ منطق، هیچ درخواست شبکه‌ای و هیچ
// کلیدی اینجا نیست. موتور محلی (engine.ts)، لایهٔ اتصال به مدل
// هوش مصنوعی (client.ts) و رابط کاربری (AssistantChat) همه از
// همین قرارداد استفاده می‌کنند، پس افزودن قابلیت‌های بعدی
// (پیشنهاد شخصی‌سازی‌شده، اتصال به کاتالوگ واقعی، …) بدون تغییر
// ساختار گفتگو انجام می‌شود.
// ============================================================

import type { ProductCategory } from '../../types';

/** لینک داخلی فروشگاه که زیر پاسخ دستیار نمایش داده می‌شود */
export interface AssistantLink {
  label: string;
  /** مسیر react-router — فقط مسیرهای موجود فروشگاه */
  to: string;
}

/** پیشنهاد آمادهٔ کوتاه (چیپ) که پس از هر پاسخ می‌تواند عوض شود */
export interface AssistantSuggestion {
  label: string;
  /** متنی که با کلیک روی چیپ در گفتگو فرستاده می‌شود */
  prompt: string;
}

/** شناسهٔ قابلیت‌های دستیار — هر پاسخ به یکی از این‌ها نسبت داده می‌شود */
export type AssistantCapabilityId =
  | 'guide'
  | 'catalog'
  | 'flavors'
  | 'flavor'
  | 'price-stock'
  | 'recipe-jelly'
  | 'recipe-custard'
  | 'servings'
  | 'budget'
  | 'pairing'
  | 'suggestion'
  | 'add-to-cart'
  | 'shipping'
  | 'order-help'
  | 'scope';

/** منبع پاسخ: موتور محلی فروشگاه یا مدل هوش مصنوعی (پشت سرور) */
export type AssistantReplySource = 'local' | 'ai';

/**
 * منبع «داده»یی که پاسخ بر آن ساخته شده:
 *   database → از دیتابیس واقعی فروشگاه (کاتالوگ/موجودی/دستورها)
 *   local    → از دادهٔ محلی سایت (دیتابیس پیکربندی نشده یا در دسترس نیست)
 * صادقانه در رابط کاربری و در پاسخ‌ها نمایش داده می‌شود.
 */
export type AssistantDataSource = 'database' | 'local';

/**
 * منبع دانش در پاسخ سرور (مدل):
 *   database → خود Edge Function/Backend کاتالوگ را از دیتابیس خوانده
 *   client   → از متن کاتالوگی که همین صفحه فرستاده استفاده شده
 *   none     → هیچ دادهٔ فروشگاهی در اختیار مدل نبوده
 */
export type AssistantKnowledgeSource = 'database' | 'client' | 'none';

export interface AssistantReply {
  text: string;
  links?: AssistantLink[];
  suggestions?: AssistantSuggestion[];
  /**
   * کارت‌های محصولِ همین پاسخ — همان دادهٔ واقعی کاتالوگ که متن پاسخ
   * از آن ساخته شده (قیمت/موجودی واقعی). اختیاری است: پاسخ‌هایی که
   * محصولی معرفی نمی‌کنند هیچ کارتی ندارند. هیچ درخواست تازه‌ای برای
   * ساختن این فهرست زده نمی‌شود.
   */
  products?: AssistantProductFact[];
  /**
   * پیشنهاد افزودن به سبد خرید — فقط با تأیید مشتری اجرا می‌شود و
   * هیچ‌وقت به تسویه‌حساب یا پرداخت ختم نمی‌شود.
   */
  cartOffer?: AssistantCartOffer;
  /** قابلیتی که پاسخ را ساخته — برای توسعه و تحلیل بعدی */
  capability: AssistantCapabilityId | 'ai' | 'open';
  source: AssistantReplySource;
  /**
   * true یعنی پاسخ فقط از دادهٔ واقعی همین فروشگاه ساخته شده
   * (کاتالوگ/قیمت/موجودی/دستور رسمی) و چیزی از خودش نساخته است.
   */
  grounded: boolean;
  /** منبع داده‌ای که این پاسخ بر آن ساخته شده */
  dataSource: AssistantDataSource;
}

/**
 * پیشنهاد افزودن یک محصول به سبد خرید.
 *
 * این پیشنهاد «درخواست افزودن» است، نه افزودن: تا وقتی مشتری دکمهٔ
 * تأیید را نزده هیچ چیزی به سبد اضافه نمی‌شود و هیچ پرداخت یا
 * تسویه‌حسابی اجرا نمی‌شود.
 */
export interface AssistantCartOffer {
  productId: string;
  variantId: string;
  /** متن کوتاه برای جملهٔ تأیید: «ژله توت فرنگی ۲۵۰ گرم» */
  label: string;
  /** قیمت واقعی همین گزینه (تومان) */
  price: number;
  /** موجودی واقعی همین گزینه */
  stock: number;
}

/** نتیجهٔ تصمیم مشتری روی یک پیشنهاد افزودن به سبد */
export type AssistantCartOfferState = 'pending' | 'added' | 'dismissed';

/** یک پیام در محیط گفتگو */
export interface AssistantChatMessage {
  id: number;
  from: 'bot' | 'user';
  text: string;
  links?: AssistantLink[];
  suggestions?: AssistantSuggestion[];
  /** کارت‌های محصول زیر این پاسخ (اختیاری) */
  products?: AssistantProductFact[];
  /** پیشنهاد افزودن به سبد — فقط با تأیید مشتری اجرا می‌شود */
  cartOffer?: AssistantCartOffer;
  /** وضعیت همان پیشنهاد: در انتظار تأیید / اضافه شد / رد شد */
  cartState?: AssistantCartOfferState;
  /** یادداشت کوچک زیر حباب (شفاف‌سازی وضعیت اتصال یا «برآورد تقریبی») */
  note?: string;
  source?: AssistantReplySource;
  /** پیام خوش‌آمدِ ابتدای گفتگو — یادداشت وضعیت اتصال زنده زیر آن می‌آید */
  welcome?: boolean;
}

/** وضعیت اتصال دستیار به مدل هوش مصنوعی — بدون هیچ کلید در مرورگر */
export type AssistantConnection =
  /** هنوز بررسی نشده */
  | 'checking'
  /** پاسخ‌ها از مدل هوش مصنوعی می‌آید (از طریق Backend/Edge Function) */
  | 'online'
  /** درخواست آخر به مدل نرسید؛ موتور محلی فروشگاه پاسخ می‌دهد */
  | 'error'
  /** Backend/Edge Function پیکربندی نشده — حالت آفلاین و کاملاً محلی */
  | 'unconfigured';

/** یک گزینهٔ محصول با قیمت و موجودی واقعی (خوانده‌شده از خود فروشگاه) */
export interface AssistantVariantFact {
  id: string;
  weight: string;
  weightGrams: number;
  price: number;
  stock: number;
  /** موجود برای فروش (پرچم محصول + موجودی بزرگ‌تر از صفر) */
  sellable: boolean;
}

export interface AssistantProductFact {
  id: string;
  name: string;
  shortName: string;
  category: ProductCategory;
  categoryLabel: string;
  /** نام کوتاه «بدون پیشوند دسته» — برای تطبیق طعم‌ها */
  flavorLabel: string;
  /** مسیر صفحهٔ محصول در فروشگاه */
  to: string;
  variants: AssistantVariantFact[];
}

export interface AssistantSettingsFact {
  freeShippingThreshold: number;
  standardShippingCost: number;
  expressShippingCost: number;
  lowStockThreshold: number;
}

export interface AssistantRecipeFact {
  id: string;
  title: string;
  summary: string;
  category: ProductCategory;
  ingredients: string[];
  steps: string[];
}

/**
 * «کارت اطلاعات» دستیار: تصویر زندهٔ فروشگاه در لحظهٔ پرسش.
 * همین کارت هم به موتور محلی داده می‌شود و هم (به‌صورت متن فشرده)
 * به مدل هوش مصنوعی؛ بنابراین هیچ قیمت/موجودی‌ای جایی تکرار
 * (و کهنه) نمی‌شود و پاسخ مدل هم به دادهٔ واقعی مقید می‌ماند.
 */
export interface AssistantContext {
  generatedAt: string;
  /**
   * آیا دادهٔ این کارت از دیتابیس واقعی آمده یا از دادهٔ محلی سایت؟
   * هیچ‌وقت «database» گفته نمی‌شود مگر snapshot دیتابیس واقعاً خوانده شده باشد.
   */
  dataSource: AssistantDataSource;
  /** زمان آخرین خواندن موفق از دیتابیس (اگر وصل باشد) */
  dataUpdatedAt: string | null;
  products: AssistantProductFact[];
  recipes: AssistantRecipeFact[];
  settings: AssistantSettingsFact;
  counts: { total: number; jelly: number; custard: number };
  priceRange: { min: number; max: number } | null;
  /** موجودی کل هر محصول (برای «تمام‌شده»ها) */
  hasOutOfStock: boolean;
}

/** تاریخچهٔ کوتاه گفتگو که برای مدل فرستاده می‌شود */
export interface AssistantHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** پاسخ خام مدل (پس از اعتبارسنجی شکل آن در client.ts) */
export interface AssistantRemoteReply {
  text: string;
  links?: AssistantLink[];
  suggestions?: AssistantSuggestion[];
  /** منبع دانشِ سرور — برای شفاف‌سازی «پاسخ از دادهٔ دیتابیس است یا متن همین صفحه» */
  knowledgeSource?: AssistantKnowledgeSource;
}

/** نتیجهٔ بررسی سلامت دستیار (GET روی Endpoint) */
export interface AssistantProbeResult {
  /** مدل پشت سرور آماده است */
  online: boolean;
  /** سرور توانست دیتابیس فروشگاه را بخواند */
  database: boolean;
  /** نام مدل پیکربندی‌شده (عمومی — بدون هیچ کلیدی) */
  model: string | null;
}
