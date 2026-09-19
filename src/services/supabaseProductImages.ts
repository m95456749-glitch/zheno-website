// ============================================================
// ZHINO — Supabase product-image gateway (Storage + product_images)
//
// The ONLY module that knows the image row shape and the Storage
// bucket. Everything runs with the browser's own credentials
// (publishable key + the signed-in admin's JWT), so Row Level
// Security decides what is allowed:
//   - anonymous visitor → reads images of ACTIVE products only
//   - signed-in admin   → reads everything, uploads, promotes, deletes
//   - any other account → refused by the policies
// No service key is ever used here.
//
// Schema: supabase/migrations/20260919000000_product_images.sql
//   public.product_images  — gallery rows (one primary per product)
//   storage bucket 'product-images' — public read, admin-only write
//
// The storefront itself keeps reading the ONE field it has always
// read (products.image_url): promoting an image mirrors its
// storefront_url into that column inside the database's
// set_primary_product_image() RPC, so the shop, the cart and the
// checkout need no change at all.
//
// Deletion order is deliberate (see removeProductImage in
// productImages.ts): the row goes first, the Storage object second.
// A failure in the second step leaves an unreachable file, never a
// storefront pointing at a missing one.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabaseClient';
import type { PreparedImage } from '../utils/imageFile';

/** Storage bucket created by the migration (uploaded photos). */
export const PRODUCT_IMAGE_BUCKET = 'product-images';

/** Marker bucket for photos that live in the repository's public/images. */
export const SITE_PUBLIC_BUCKET = 'site-public';

/**
 * 'legacy'  — a committed public/images file (registered, never deleted)
 * 'upload'  — an object in the product-images Storage bucket
 * 'catalog' — client-side only: products.image_url has no gallery row yet
 */
export type ProductImageSource = 'legacy' | 'upload' | 'catalog';

export interface ProductImage {
  id: string;
  productId: string;
  /** PRODUCT_IMAGE_BUCKET or SITE_PUBLIC_BUCKET */
  bucket: string;
  storagePath: string;
  /** exactly what goes into products.image_url when promoted */
  storefrontUrl: string;
  altText: string;
  isPrimary: boolean;
  sortOrder: number;
  width: number | null;
  height: number | null;
  mimeType: string;
  sizeBytes: number;
  source: ProductImageSource;
  createdAt: string;
  /** true for rows that exist only in this browser (demo mode / catalog mirror) */
  virtual?: boolean;
}

/* ── errors ────────────────────────────────────────────────── */

/** A failure with a message that is safe (and useful) to show. */
export class ProductImageError extends Error {
  readonly detail: string;

  constructor(message: string, detail = '') {
    super(detail ? `${message}: ${detail}` : message);
    this.name = 'ProductImageError';
    this.detail = detail;
    // The sentence the panel shows; `message` keeps the detail for logs.
    this.userMessage = message;
  }

  readonly userMessage: string;
}

interface SupabaseLikeError {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
  statusCode?: string;
}

function rawText(error: SupabaseLikeError): string {
  return [error.message, error.details, error.hint, error.code ?? '', error.statusCode ?? '']
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');
}

/**
 * Translate a Supabase/Storage/network failure into one honest Persian
 * sentence. Unknown failures keep their technical detail so the admin
 * (or a developer reading the panel) can act on it.
 */
export function describeImageError(context: string, error: unknown): ProductImageError {
  const text =
    error && typeof error === 'object' ? rawText(error as SupabaseLikeError) : String(error ?? '');
  const lower = text.toLowerCase();

  if (/relation .* does not exist|could not find the table|\b42p01\b/.test(lower)) {
    return new ProductImageError(
      'جدول تصاویر در دیتابیس ساخته نشده است؛ مهاجرت ۲۰۲۶۰۹۱۹۰۰۰۰۰۰_product_images.sql را اعمال کنید.',
      text,
    );
  }
  if (/bucket not found|does not have a bucket/i.test(lower)) {
    return new ProductImageError(
      'فضای ذخیره‌سازی «product-images» در Supabase ساخته نشده است؛ مهاجرت ۲۰۲۶۰۹۱۹۰۰۰۰۰۰_product_images.sql را در Supabase اعمال کنید (اجرا مجدد آن بدون خطا و بدون تغییر در داده‌هاست).',
      text,
    );
  }
  if (/row-level security|row level security|violates row-level|permission denied|\b42501\b/.test(lower)) {
    return new ProductImageError(
      'دسترسی مدیر تأیید نشد؛ فقط حساب دارای نقش admin می‌تواند تصویرها را تغییر دهد.',
      text,
    );
  }
  if (/jwt expired|token expired|session expired|invalid jwt|\b401\b/.test(lower)) {
    return new ProductImageError('نشست مدیر پایان یافته است؛ دوباره وارد پنل شوید.', text);
  }
  if (/exceeded the maximum file size|payload too large|\b413\b/.test(lower)) {
    return new ProductImageError('حجم فایل بیشتر از حد مجاز فضای ذخیره‌سازی است.', text);
  }
  if (/invalid mime|mime type|unsupported media|\b415\b/.test(lower)) {
    return new ProductImageError('قالب فایل برای فضای ذخیره‌سازی مجاز نیست.', text);
  }
  if (/already exists|duplicate key|\b23505\b/.test(lower)) {
    return new ProductImageError('فایلی با همین نام از قبل در فضای ذخیره‌سازی هست؛ دوباره تلاش کنید.', text);
  }
  if (/new row violates|check constraint|\b23514\b/.test(lower)) {
    return new ProductImageError('مقدارهای تصویر با محدودیت‌های دیتابیس هم‌خوانی ندارد.', text);
  }
  if (/foreign key|\b23503\b/.test(lower)) {
    return new ProductImageError('محصول انتخابی در دیتابیس وجود ندارد.', text);
  }
  if (/failed to fetch|networkerror|fetch failed|timeout|econn|\b50[0-9]\b/.test(lower)) {
    return new ProductImageError('اتصال به Supabase برقرار نشد؛ اینترنت و وضعیت پروژه را بررسی کنید.', text);
  }
  if (/image_not_found/.test(lower)) {
    return new ProductImageError('این تصویر در دیتابیس پیدا نشد (ممکن است قبلاً حذف شده باشد).', text);
  }
  if (/admin_required/.test(lower)) {
    return new ProductImageError('این عملیات فقط برای مدیر مجاز است.', text);
  }

  return new ProductImageError(`${context} ناموفق بود`, text || 'خطای ناشناخته');
}

/* ── row mapping ───────────────────────────────────────────── */

interface ProductImageRow {
  id: string;
  product_id: string;
  storage_bucket: string;
  storage_path: string;
  storefront_url: string;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  size_bytes: number | null;
  source: string | null;
  created_at: string | null;
}

const SELECT_COLUMNS =
  'id,product_id,storage_bucket,storage_path,storefront_url,alt_text,is_primary,sort_order,width,height,mime_type,size_bytes,source,created_at';

function toImage(row: ProductImageRow): ProductImage | null {
  if (!row || typeof row.id !== 'string' || typeof row.product_id !== 'string') return null;
  if (typeof row.storage_path !== 'string' || typeof row.storefront_url !== 'string') return null;
  return {
    id: row.id,
    productId: row.product_id,
    bucket: typeof row.storage_bucket === 'string' ? row.storage_bucket : PRODUCT_IMAGE_BUCKET,
    storagePath: row.storage_path,
    storefrontUrl: row.storefront_url,
    altText: row.alt_text ?? '',
    isPrimary: row.is_primary === true,
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
    width: typeof row.width === 'number' ? row.width : null,
    height: typeof row.height === 'number' ? row.height : null,
    mimeType: row.mime_type ?? 'image/jpeg',
    sizeBytes: typeof row.size_bytes === 'number' ? row.size_bytes : 0,
    source: row.source === 'legacy' ? 'legacy' : 'upload',
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function client(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) throw new ProductImageError('Supabase پیکربندی نشده است.', 'no client');
  return supabase;
}

/* ── read ──────────────────────────────────────────────────── */

/** Every gallery row the current session may see (admin: all of them). */
export async function fetchRemoteProductImages(): Promise<ProductImage[]> {
  const supabase = client();
  const { data, error } = await supabase
    .from('product_images')
    .select(SELECT_COLUMNS)
    .order('product_id')
    .order('is_primary', { ascending: false })
    .order('sort_order')
    .order('created_at');
  if (error) throw describeImageError('خواندن تصاویر محصولات', error);

  const rows = (data ?? []) as unknown as ProductImageRow[];
  return rows.map(toImage).filter((image): image is ProductImage => image !== null);
}

/* ── storage ───────────────────────────────────────────────── */

/**
 * Upload one prepared photo. `upsert: false` on purpose: a path is
 * unique per upload (timestamp in the name), so silently overwriting
 * an existing object — and every cache pointing at it — is refused.
 */
export async function uploadImageObject(
  path: string,
  prepared: PreparedImage,
): Promise<{ publicUrl: string; path: string }> {
  const supabase = client();
  const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, prepared.blob, {
    contentType: prepared.mime,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw describeImageError('بارگذاری تصویر در فضای ذخیره‌سازی', error);

  const { data } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl, path };
}

/** Remove one object from the bucket (admin-only under the storage policy). */
export async function removeImageObject(path: string): Promise<void> {
  const supabase = client();
  const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
  if (error) throw describeImageError('حذف فایل از فضای ذخیره‌سازی', error);
}

/* ── rows ──────────────────────────────────────────────────── */

export interface NewProductImage {
  productId: string;
  bucket: string;
  storagePath: string;
  storefrontUrl: string;
  altText: string;
  width: number | null;
  height: number | null;
  mimeType: string;
  sizeBytes: number;
  source: 'legacy' | 'upload';
}

/**
 * Insert one gallery row.
 *
 * Always inserted as NON-primary: the database keeps a partial unique
 * index that allows exactly one primary per product, and promotion goes
 * through setPrimaryImage() so the storefront URL is mirrored in the
 * same transaction.
 */
export async function insertImageRow(image: NewProductImage): Promise<ProductImage> {
  const supabase = client();
  const { data, error } = await supabase
    .from('product_images')
    .insert({
      product_id: image.productId,
      storage_bucket: image.bucket,
      storage_path: image.storagePath,
      storefront_url: image.storefrontUrl,
      alt_text: image.altText,
      is_primary: false,
      width: image.width,
      height: image.height,
      mime_type: image.mimeType,
      size_bytes: image.sizeBytes,
      source: image.source,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw describeImageError('ثبت تصویر در دیتابیس', error);

  const mapped = toImage(data as unknown as ProductImageRow);
  if (!mapped) throw new ProductImageError('ثبت تصویر در دیتابیس', 'پاسخ دیتابیس خوانده نشد');
  return mapped;
}

/** Edit the descriptive fields of a row (alt text / order). */
export async function updateImageRow(
  id: string,
  patch: { altText?: string; sortOrder?: number },
): Promise<void> {
  const supabase = client();
  const payload: Record<string, unknown> = {};
  if (typeof patch.altText === 'string') payload.alt_text = patch.altText;
  if (typeof patch.sortOrder === 'number') payload.sort_order = patch.sortOrder;
  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase.from('product_images').update(payload).eq('id', id);
  if (error) throw describeImageError('ویرایش اطلاعات تصویر', error);
}

/** Delete one gallery row (the Storage object is removed separately). */
export async function deleteImageRow(id: string): Promise<void> {
  const supabase = client();
  const { error } = await supabase.from('product_images').delete().eq('id', id);
  if (error) throw describeImageError('حذف تصویر از دیتابیس', error);
}

/**
 * Promote one image to «تصویر اصلی» — atomically, in the database:
 * clears the previous primary, raises this row and mirrors its
 * storefront_url into products.image_url (the field the storefront
 * reads). Admin-only, enforced inside the function.
 */
export async function setPrimaryImage(id: string): Promise<void> {
  const supabase = client();
  const { error } = await supabase.rpc('set_primary_product_image', { p_image_id: id });
  if (error) throw describeImageError('انتخاب تصویر اصلی', error);
}

/**
 * Point products.image_url at another value (or clear it). Used when an
 * image is removed and no gallery row is left to promote: the storefront
 * then falls back to the flavour artwork it already renders today.
 */
export async function pushProductImageUrl(productId: string, storefrontUrl: string | null): Promise<void> {
  const supabase = client();
  const { error } = await supabase
    .from('products')
    .update({ image_url: storefrontUrl })
    .eq('id', productId);
  if (error) throw describeImageError('به‌روزرسانی تصویر محصول در فروشگاه', error);
}
