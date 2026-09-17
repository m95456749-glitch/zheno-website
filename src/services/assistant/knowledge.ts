// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۵ و ۶) — کارت اطلاعات فروشگاه
//
// تنها منبع حقیقت دستیار برای «قیمت»، «موجودی» و «دستور تهیه»:
// همین تابع‌ها. هیچ عددی در متن پاسخ‌ها هاردکد نشده؛ همه از
// سرویس‌های خود فروشگاه خوانده می‌شوند:
//
//   • کاتالوگ  → src/services/catalog.ts   (سوپابیس یا دادهٔ پایه + overlay ادمین)
//   • تنظیمات → src/services/settings.ts   (آستانهٔ ارسال رایگان و کرایه‌ها)
//   • دستورها → src/services/recipeStore.ts (دستور رسمی روی بسته، قابل ویرایش در پنل)
//
// پس اگر مدیر فروشگاه قیمتی را عوض کند یا محصولی را غیرفعال کند،
// پاسخ دستیار در همان لحظه با فروشگاه هم‌خوان می‌شود.
//
// همین کارت به‌صورت متن فشرده به Backend/Edge Function هم داده
// می‌شود تا مدل هوش مصنوعی فقط بر پایهٔ دادهٔ واقعی پاسخ بدهد و
// از خودش قیمت و موجودی نسازد.
// ============================================================

import { getVisibleProducts } from '../catalog';
import { getCatalogSyncState, getRemoteCatalog } from '../catalogSync';
import { getActiveRecipes } from '../recipeStore';
import { getSettings } from '../settings';
import { getRemoteSiteData } from '../siteDataSync';
import type { Product, ProductVariant } from '../../types';
import { formatNumber, formatPrice } from '../../utils/format';
import type {
  AssistantContext,
  AssistantDataSource,
  AssistantProductFact,
  AssistantRecipeFact,
  AssistantVariantFact,
} from './types';

/** مسیر صفحهٔ هر محصول در فروشگاه (Routing فروشگاه دست‌نخورده) */
export function productPath(productId: string): string {
  return `/products/${productId}`;
}

function toVariantFact(variant: ProductVariant): AssistantVariantFact {
  return {
    id: variant.id,
    weight: variant.weight,
    weightGrams: variant.weightGrams,
    price: variant.price,
    stock: variant.stock,
    sellable: variant.available && variant.stock > 0,
  };
}

function toProductFact(product: Product): AssistantProductFact {
  // «ژله توت فرنگی» → «توت فرنگی» (کلید تطبیق طعم، مستقل از دستهٔ محصول)
  const flavorLabel = product.shortName.replace(/^\s*(ژله|کاستر)\s*/u, '').trim();
  return {
    id: product.id,
    name: product.name,
    shortName: product.shortName,
    category: product.category,
    categoryLabel: product.categoryLabel,
    flavorLabel,
    to: productPath(product.id),
    variants: product.variants.map(toVariantFact),
  };
}

/**
 * منبع واقعی دادهٔ همین لحظه.
 *
 * «database» تنها وقتی گفته می‌شود که snapshot دیتابیس واقعاً خوانده
 * شده باشد (products/variants/inventory از سوپابیس) و خواندنِ اخیر
 * خطا نداده باشد. در هر حالت دیگری — سوپابیس پیکربندی نشده، یا خطای
 * شبکه — صادقانه «local» است: دادهٔ محلی خود سایت.
 */
function detectDataSource(): { source: AssistantDataSource; updatedAt: string | null } {
  const catalogState = getCatalogSyncState();
  const remoteCatalog = getRemoteCatalog();
  const remoteSiteData = getRemoteSiteData();

  const catalogFromDatabase =
    remoteCatalog !== null && catalogState.source === 'remote' && catalogState.phase !== 'error';

  if (!catalogFromDatabase) return { source: 'local', updatedAt: null };

  // دستورها/تنظیمات هم از دیتابیس آمده باشند؛ اگر جدول‌های محتوا هنوز
  // نرسیده باشند، «database» با احتیاط بیشتری گفته می‌شود.
  return {
    source: 'database',
    updatedAt: remoteSiteData?.loadedAt ?? catalogState.lastSyncedAt ?? remoteCatalog.loadedAt ?? null,
  };
}

/** منبع دادهٔ همین لحظه — سبک، بدون ساختن کل کارت اطلاعات */
export function getAssistantDataSource(): AssistantDataSource {
  return detectDataSource().source;
}

/** برچسب فارسی منبع داده — برای پیل وضعیت و یادداشت‌ها */
export function dataSourceLabel(source: AssistantDataSource): string {
  return source === 'database' ? 'دادهٔ زندهٔ دیتابیس' : 'دادهٔ محلی فروشگاه';
}

/** عکس لحظه‌ای فروشگاه — نقطهٔ شروع هر پاسخ دستیار */
export function buildAssistantContext(): AssistantContext {
  const products = getVisibleProducts().map(toProductFact);
  const recipes: AssistantRecipeFact[] = getActiveRecipes().map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    summary: recipe.summary,
    category: recipe.category,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
  }));
  const settings = getSettings();

  const prices = products
    .flatMap((product) => product.variants.map((variant) => variant.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  const data = detectDataSource();

  return {
    generatedAt: new Date().toISOString(),
    dataSource: data.source,
    dataUpdatedAt: data.updatedAt,
    products,
    recipes,
    settings: {
      freeShippingThreshold: settings.freeShippingThreshold,
      standardShippingCost: settings.standardShippingCost,
      expressShippingCost: settings.expressShippingCost,
      lowStockThreshold: settings.lowStockThreshold,
    },
    counts: {
      total: products.length,
      jelly: products.filter((product) => product.category === 'jelly').length,
      custard: products.filter((product) => product.category === 'custard').length,
    },
    priceRange: prices.length > 0 ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    hasOutOfStock: products.some(
      (product) => !product.variants.some((variant) => variant.sellable),
    ),
  };
}

/* ── پرس‌وجو در کارت اطلاعات ──────────────────────────────── */

/** همهٔ گزینه‌های قابل فروش یک محصول (قیمت/وزن واقعی) */
export function sellableVariants(product: AssistantProductFact): AssistantVariantFact[] {
  return product.variants.filter((variant) => variant.sellable);
}

/** ارزان‌ترین گزینهٔ قابل فروش یک محصول */
export function cheapestVariant(product: AssistantProductFact): AssistantVariantFact | null {
  const options = sellableVariants(product);
  if (options.length === 0) return null;
  return options.reduce((best, item) => (item.price < best.price ? item : best));
}

/** آیا این محصول همین حالا قابل سفارش است؟ */
export function isAvailable(product: AssistantProductFact): boolean {
  return sellableVariants(product).length > 0;
}

/** جست‌وجوی سادهٔ متنی در نام/طعم محصولات (بدون شبکه) */
export function searchProducts(context: AssistantContext, query: string): AssistantProductFact[] {
  const needle = query.trim();
  if (!needle) return [];
  return context.products.filter(
    (product) =>
      product.name.includes(needle) ||
      product.shortName.includes(needle) ||
      product.flavorLabel.includes(needle) ||
      needle.includes(product.flavorLabel),
  );
}

/** فهرست طعم‌های واقعی موجود، جدا برای ژله و کاستر (بدون تکرار) */
export function availableFlavors(context: AssistantContext): { jelly: string[]; custard: string[] } {
  const unique = (values: string[]) => Array.from(new Set(values.filter((value) => value.length > 0)));
  return {
    jelly: unique(productsOf(context, 'jelly').map((product) => product.flavorLabel)),
    custard: unique(productsOf(context, 'custard').map((product) => product.flavorLabel)),
  };
}

/** محصولات یک دسته (ژله یا کاستر) */
export function productsOf(
  context: AssistantContext,
  category: 'jelly' | 'custard',
): AssistantProductFact[] {
  return context.products.filter((product) => product.category === category);
}

/** خلاصهٔ یک محصول برای متن پاسخ: «ژله انار — ۲۵۰ گرم، ۲۰۰٬۰۰۰ تومان» */
export function describeProduct(product: AssistantProductFact): string {
  const variant = cheapestVariant(product);
  if (!variant) {
    const weight = product.variants[0]?.weight ?? '';
    return `${product.shortName}${weight ? ` (${weight})` : ''} — فعلاً موجود نیست`;
  }
  const stockNote = variant.stock <= 5 ? ` — تنها ${formatNumber(variant.stock)} عدد باقی مانده` : '';
  return `${product.shortName} — ${variant.weight}، ${formatPrice(variant.price)}${stockNote}`;
}

/** آستانهٔ ارسال رایگان به‌صورت متن آمادهٔ پاسخ */
export function freeShippingLine(context: AssistantContext): string {
  return `برای سفارش‌های بالای ${formatPrice(context.settings.freeShippingThreshold)} ارسال رایگان است.`;
}

/* ── متن فشرده برای مدل هوش مصنوعی ────────────────────────── */

/**
 * کاتالوگ واقعی به‌صورت متن فشرده (فقط داده‌های عمومی فروشگاه).
 * این متن به Backend/Edge Function می‌رود تا مدل «قیمت و موجودی»
 * را از خودش نسازد؛ حجم آن با تعداد محصولات محدود می‌شود.
 */
export function compactCatalogDigest(context: AssistantContext, maxProducts = 80): string {
  const lines: string[] = [];
  lines.push(
    `منبع داده: ${context.dataSource === 'database' ? 'دیتابیس فروشگاه' : 'دادهٔ محلی سایت'}`,
  );
  lines.push(
    `تعداد محصولات: ${context.counts.total} (ژله: ${context.counts.jelly} — کاستر: ${context.counts.custard})`,
  );
  if (context.priceRange) {
    lines.push(
      `بازهٔ قیمت: از ${formatPrice(context.priceRange.min)} تا ${formatPrice(context.priceRange.max)}`,
    );
  }
  lines.push(`ارسال رایگان از: ${formatPrice(context.settings.freeShippingThreshold)}`);
  lines.push(`کرایهٔ ارسال: عادی ${formatPrice(context.settings.standardShippingCost)} — سریع ${formatPrice(context.settings.expressShippingCost)}`);
  lines.push('محصولات (نام | دسته | بسته | قیمت | موجودی):');
  for (const product of context.products.slice(0, maxProducts)) {
    const variants = product.variants
      .map(
        (variant) =>
          `${variant.weight}/${formatPrice(variant.price)}/${variant.sellable ? `${formatNumber(variant.stock)} عدد` : 'ناموجود'}`,
      )
      .join(' ، ');
    lines.push(`- ${product.name} | ${product.categoryLabel} | ${variants} | مسیر: ${product.to}`);
  }
  if (context.recipes.length > 0) {
    lines.push('دستورهای رسمی روی بسته:');
    for (const recipe of context.recipes) {
      lines.push(`- ${recipe.title}: ${recipe.summary} → ${recipe.steps.join(' ')}`);
    }
  }
  return lines.join('\n').slice(0, 8000);
}
