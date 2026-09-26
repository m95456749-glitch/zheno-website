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
// The role itself is the request JWT's app_metadata.role claim
// (public.is_admin()); supabaseAdminRole.checkAdminAccess verifies it
// against the LIVE Supabase user record, and a write refused for a
// permission reason is healed once (stale/dropped session) or reported
// with its real cause — never bypassed and never retried blindly.
//
// Schema: supabase/migrations/20260922000000_product_images_reliable_bootstrap.sql
//   public.product_images  — gallery rows (one primary per product)
//   storage bucket 'product-images' — public read, admin-only write
//
// The storefront itself keeps reading the ONE field it has always
// read (products.image_url): promoting an image mirrors its
// storefront_url into that column inside the database's
// manage_product_image() RPC, so the shop, the cart and the
// checkout need no change at all.
//
// Deletion is transactional in PostgreSQL; Storage cleanup follows
// only after its path is retired and all live references are gone.
// A failure in the second step leaves an unreachable file, never a
// storefront pointing at a missing one.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, getSupabaseUrl } from './supabaseClient';
import { AdminAccessError, checkAdminAccess, describeAdminAccessIssue } from './supabaseAdminRole';
import type { AdminAccessIssue } from './supabaseAdminRole';
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

  constructor(message: string, _detail = '') {
    // Backend text is classified transiently, never retained in Error/log/JSON.
    super(message);
    this.name = 'ProductImageError';
    this.detail = '';
    // Both message and userMessage are safe; no raw cause or response is retained.
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
 * sentence. Unknown failures use a generic message; backend details never leave this classifier.
 */
export function describeImageError(context: string, error: unknown): ProductImageError {
  const text =
    error && typeof error === 'object' ? rawText(error as SupabaseLikeError) : String(error ?? '');
  const lower = text.toLowerCase();

  if (/relation .* does not exist|could not find the table|could not find the function|\b42p01\b|pgrst202/.test(lower)) {
    return new ProductImageError(
      'سرویس ایمن تصاویر آماده نیست؛ نصب نسخهٔ ۳ را طبق راهنمای بازبینی‌شدهٔ migration بررسی کنید.',
      text,
    );
  }
  if (/bucket not found|does not have a bucket/i.test(lower)) {
    return new ProductImageError(
      'فضای ذخیره‌سازی «product-images» در Supabase ساخته نشده است؛ نصب نسخهٔ ۳ را طبق راهنمای بازبینی‌شدهٔ migration بررسی کنید.',
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
  if (/failed to fetch|networkerror|fetch failed|timeout|timed out|abort|econn|\b50[0-9]\b/.test(lower)) {
    return new ProductImageError('اتصال به Supabase برقرار نشد؛ اینترنت و وضعیت پروژه را بررسی کنید.', text);
  }
  if (/image_conflict|image_retired|image_product_mismatch|image_operation_conflict|\b40p01\b/.test(lower)) {
    return new ProductImageError('تصاویر این محصول تغییر کرده‌اند؛ گالری را به‌روز کنید و دوباره انتخاب کنید.', text);
  }
  if (/last_product_image/.test(lower)) return new ProductImageError('این آخرین تصویر محصول است؛ حذف آن نیاز به تأیید جداگانه دارد.', text);
  if (/invalid_image_file|invalid_image_url|image_object_missing|replacement_requires_primary|invalid_image_operation|image_api_upgrade_required/.test(lower)) {
    return new ProductImageError('فایل یا درخواست تصویر معتبر نیست؛ تصویر را دوباره انتخاب کنید.', text);
  }
  if (/product_not_found/.test(lower)) return new ProductImageError('محصول انتخابی در دیتابیس پیدا نشد.', text);
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

/** A timeout means unknown outcome, not permission to destroy uploaded bytes. */
async function bounded<T>(request: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve(request), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ProductImageError('پاسخ سرور دیر رسید؛ نتیجه ممکن است ثبت شده باشد. به‌روزرسانی کنید یا همان پیش‌نمایش را دوباره ارسال کنید.')), 30_000);
    })]);
  } catch (error) {
    throw error instanceof ProductImageError ? error : describeImageError('ارتباط با سرویس تصاویر', error);
  } finally { if (timer) clearTimeout(timer); }
}

/* ── admin-session healing for refused writes ─────────────── */
//
// Row Level Security and manage_product_image() read the admin role
// from the request JWT's app_metadata claim (public.is_admin()). A
// permission refusal therefore has several honest causes besides
// "this account is not an admin":
//   • the session token was issued BEFORE the role was granted, so
//     the claim is missing although the live record has it;
//   • the session quietly vanished — supabase-js then presents the
//     publishable key and the request goes out ANONYMOUS.
// When a write is refused for a permission reason we verify the role
// against Supabase itself (live user record + is_admin()), heal the
// session once, and retry exactly once. Nothing is ever weakened: the
// database stays the sole authoriser; a genuine non-admin is told the
// real reason instead of an opaque RLS sentence.

/** A refusal text that means "no admin was attached to this request". */
function isPermissionRefusal(error: unknown): boolean {
  const text = rawText(error as SupabaseLikeError).toLowerCase();
  return /row-level security|row level security|violates row-level|permission denied|\b42501\b|admin_required/.test(text);
}

/**
 * Verify — and if possible repair — the admin session before retrying
 * a refused write. Returns null when the session now satisfies the
 * database's own checks; otherwise the exact issue to report.
 */
async function healAdminSession(): Promise<AdminAccessIssue | null> {
  const supabase = client();
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return { kind: 'no-session' };
    await checkAdminAccess(supabase);
    return null;
  } catch (error) {
    if (error instanceof AdminAccessError) return error.issue;
    return { kind: 'unverifiable' };
  }
}

/** The honest sentence for a write refused for a session/role reason. */
function adminWriteRefusal(issue: AdminAccessIssue, context: string, original: unknown): ProductImageError {
  if (issue.kind === 'unverifiable') return describeImageError(context, original);
  if (issue.kind === 'no-session') {
    // The request would otherwise leave the browser anonymously — say
    // exactly that, instead of blaming the account's role.
    return new ProductImageError('نشست مدیر پایان یافته است؛ دوباره وارد پنل شوید.');
  }
  return new ProductImageError(describeAdminAccessIssue(issue));
}

/* ── transactional gateway (image safety v3) ────────────────── */
export async function fetchRemoteProductImages(): Promise<ProductImage[]> {
  const supabase = client();
  const version = await bounded(supabase.rpc('product_image_api_version'));
  if (version.error) throw describeImageError('بررسی سرویس تصاویر', version.error);
  if (version.data !== 3) throw new ProductImageError('سرویس تصاویر نیاز به به‌روزرسانی دارد؛ SQL ایمنی تصاویر را اجرا کنید.');
  const images: ProductImage[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await bounded(supabase.from('product_images').select(SELECT_COLUMNS)
      .order('product_id').order('id').range(offset, offset + 499));
    if (error) throw describeImageError('خواندن تصاویر محصولات', error);
    const rows = (data ?? []) as ProductImageRow[];
    images.push(...rows.map(toImage).filter((image): image is ProductImage => image !== null));
    if (rows.length < 500) return images;
  }
}

export async function uploadImageObject(path: string, prepared: PreparedImage, alreadyUploaded = false, retry = false): Promise<{ publicUrl: string }> {
  const supabase = client();
  if (alreadyUploaded) return { publicUrl: supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl };
  const options = { contentType: prepared.mime, cacheControl: '31536000', upsert: false };
  let { error } = await bounded(supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, prepared.blob, options));
  if (error && isPermissionRefusal(error)) {
    // Storage RLS said "no admin attached". The refusal stands — but
    // before reporting it, check the role against Supabase itself: a
    // stale/missing session can be healed, a genuine non-admin gets
    // the real reason. One healed retry, same path and same bytes.
    const issue = await healAdminSession();
    if (issue === null) {
      ({ error } = await bounded(supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, prepared.blob, options)));
    } else {
      throw adminWriteRefusal(issue, 'بارگذاری تصویر', error);
    }
  }
  // Only the SAME preview/UUID operation may resume an upload whose response was lost.
  if (error && !(retry && /already exists|duplicate|409/i.test(rawText(error)))) throw describeImageError('بارگذاری تصویر', error);
  return { publicUrl: supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl };
}

interface ImageOperation {
  id: string;
  expectedUrl: string | null;
}

/** Save before sending. Only IDs/intent are stored, never credentials or errors.
 * Frozen CAS survives a lost response followed by a refreshed product URL.
 * Session scope isolates tabs; project/user scope isolates accounts. The server
 * compares actor + full intent and keeps durable receipts independently.
 */
async function imageOperation(action: string, productId: string, imageId: string,
  expectedUrl: string | null, payload: Record<string, unknown>): Promise<{ key: string; operation: ImageOperation }> {
  const { data, error } = await bounded(client().auth.getSession());
  if (error) throw describeImageError('بررسی نشست', error);
  const key = 'zhino_image_operation_v3:' + JSON.stringify([
    getSupabaseUrl(), data.session?.user.id ?? 'no-session', action, productId, imageId, payload,
  ]);
  try {
    const raw = window.sessionStorage.getItem(key);
    const saved = raw ? JSON.parse(raw) as ImageOperation : null;
    if (saved && /^[0-9a-f-]{36}$/.test(saved.id)
      && (saved.expectedUrl === null || typeof saved.expectedUrl === 'string')) return { key, operation: saved };
    const operation = { id: crypto.randomUUID(), expectedUrl };
    window.sessionStorage.setItem(key, JSON.stringify(operation));
    return { key, operation };
  } catch {
    // Refuse BEFORE sending when durable retry intent cannot be saved.
    throw new ProductImageError('ثبت ایمن درخواست در مرورگر ممکن نشد؛ اجازهٔ ذخیره‌سازی نشست را بررسی کنید.');
  }
}

export async function mutateImage(
  action: 'register' | 'primary' | 'delete' | 'alt', productId: string,
  imageId: string, expectedUrl: string | null, payload: Record<string, unknown> = {},
): Promise<ProductImage | null> {
  const { key, operation } = await imageOperation(action, productId, imageId, expectedUrl, payload);
  const sendRpc = () => bounded(client().rpc('manage_product_image', {
    p_action: action, p_product_id: productId, p_image_id: imageId,
    p_expected_url: operation.expectedUrl, p_payload: { ...payload, operation_id: operation.id },
  }));
  let { data, error } = await sendRpc();
  if (error && isPermissionRefusal(error)) {
    // admin_required / RLS from the RPC: same posture as Storage — the
    // refusal stands, but a stale or dropped session can be healed.
    // Replays are safe: the operation id and the frozen CAS are identical.
    const issue = await healAdminSession();
    if (issue === null) ({ data, error } = await sendRpc());
    else throw adminWriteRefusal(issue, 'ذخیرهٔ تغییرات تصویر', error);
  }
  if (error) {
    // These SQL errors prove rollback. A genuinely fresh retry after refresh
    // may use a new CAS; ambiguous transport/proxy errors retain the old intent.
    if (/^(P0001|42501|22...|23...|40...)$/.test(error.code ?? '')) {
      try { window.sessionStorage.removeItem(key); } catch { /* fail closed */ }
    }
    throw describeImageError('ذخیرهٔ تغییرات تصویر', error);
  }
  if (action === 'delete') {
    if (data?.deleted !== true || data.id !== imageId) throw new ProductImageError('حذف تصویر تأیید نشد؛ گالری را به‌روز کنید.');
    return null;
  }
  const image = toImage(data as ProductImageRow);
  if (!image || image.productId !== productId || image.id !== imageId) {
    throw new ProductImageError('پاسخ ثبت تصویر تأیید نشد؛ پیش از تلاش دوباره گالری را به‌روز کنید.');
  }
  // DELETE receipts remain replayable for this immutable image ID. Other
  // successful actions must allow a later, genuinely new choice of primary/alt.
  try { window.sessionStorage.removeItem(key); } catch { /* receipt stays safe */ }
  return image;
}

/** Read-back resolves a response lost AFTER the registration committed. */
export async function findRegisteredImage(id: string, productId: string): Promise<ProductImage | null> {
  const { data, error } = await bounded(client().from('product_images').select(SELECT_COLUMNS)
    .eq('id', id).eq('product_id', productId).maybeSingle());
  if (error) throw describeImageError('بررسی نتیجهٔ ثبت تصویر', error);
  if (!data) return null;
  const image = toImage(data as ProductImageRow);
  if (!image || image.id !== id || image.productId !== productId) throw new ProductImageError('نتیجهٔ ثبت تصویر تأیید نشد.');
  return image;
}

/** Never delete on a network error alone. The DB retires only unreferenced paths. */
export async function retireUpload(path: string): Promise<boolean> {
  const { data, error } = await bounded(client().rpc('retire_product_image_upload', { p_path: path }));
  if (error) throw describeImageError('بررسی فایل باقی‌مانده', error);
  return data === true;
}

/** A 404 only confirms absence when it is an object error, not auth/bucket failure. */
function objectNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as SupabaseLikeError & { status?: number };
  return (String(e.statusCode ?? e.status) === '404') && !/bucket|jwt|token|permission|unauthor/i.test(rawText(e));
}

export async function cleanupImageFiles(): Promise<number> {
  const supabase = client();
  const { data, error } = await bounded(supabase.rpc('claim_product_image_cleanup', { p_limit: 20 }));
  if (error) throw describeImageError('خواندن صف پاک‌سازی', error);
  const jobs = (data ?? []) as { storage_path: string; claim_id: string }[];
  const outcomes = await Promise.all(jobs.map(async row => {
    let confirmed = false;
    try {
      // Storage RLS independently guards retirement and absence of references.
      const removed = await bounded(supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([row.storage_path]));
      confirmed = !removed.error || objectNotFound(removed.error);
    } catch { /* Unknown HTTP outcome: schedule retry, never assume success. */ }
    try {
      // Called EVEN on remove error: releases the lease with durable backoff.
      // The RPC also checks metadata absence and live references before completion.
      const completed = await bounded(supabase.rpc('complete_product_image_cleanup', {
        p_path: row.storage_path, p_claim_id: row.claim_id, p_storage_confirmed: confirmed,
      }));
      return !completed.error && completed.data === true;
    } catch { return false; } // Lease expiration recovers a lost completion request.
  }));
  const pending = await bounded(supabase.from('product_image_cleanup').select('storage_path')
    .is('completed_at', null).limit(1));
  if (pending.error) throw describeImageError('بررسی صف پاک‌سازی', pending.error);
  return outcomes.filter(done => !done).length + (pending.data?.length ? 1 : 0);
}
