// ============================================================
// ZHINO — product image gallery service (admin panel)
//
// ONE gallery, TWO sources — the same posture as the catalog
// (src/services/catalog.ts) and the orders (orderSync.ts):
//
//   1. CONNECTED (Supabase configured): rows come from
//      public.product_images, files from the «product-images»
//      Storage bucket. Every write runs under the signed-in admin's
//      JWT, so Row Level Security is the gate — the panel has no
//      privileged key and no write path of its own.
//
//   2. LOCAL (no Supabase / demo): the gallery is derived from the
//      catalog the shop already uses, and demo uploads live in a
//      localStorage overlay («zhino_admin_product_images_v1») as
//      prepared data URLs. The primary image is written through the
//      EXISTING catalog overlay (upsertProduct), so the storefront
//      shows it exactly like any other admin edit. No file ever
//      leaves the browser in this mode, and the panel says so.
//
// THE STOREFRONT CONTRACT (unchanged, deliberately):
//   products, cards, detail page, cart and checkout keep reading the
//   one field they have always read — Product.imageUrl /
//   products.image_url. Promoting an image mirrors its storefront_url
//   into that column (in one database transaction, through
//   set_primary_product_image), so nothing else in the shop needs to
//   know a gallery exists.
//
// SAFETY RULES
//   * A committed public/images photo (source 'legacy') is registered
//     here but its FILE is never deleted — the panel can only stop
//     showing it. Uploaded Storage objects are the only bytes this
//     module removes, and only after an explicit admin confirmation.
//   * Deletion: transactionally un-point the storefront + retire the row,
//     then remove the object through the durable cleanup queue. A failure in the last step leaves an unreachable
//     file (reported as a warning), never a broken shop image.
// ============================================================

import { useMemo, useSyncExternalStore } from 'react';
import type { Product } from '../types';
import { buildStoragePath, prepareProductImage, validatePreparedImage } from '../utils/imageFile';
import type { PreparedImage } from '../utils/imageFile';
import { getEffectiveCatalog, setLocalProductImage, useCatalog } from './catalog';
import { getCatalogSyncState, getRemoteCatalog, refreshRemoteCatalog } from './catalogSync';
import { createLocalStore, useLocalStore } from './localStore';
import { getSupabase } from './supabaseClient';
import { getAuthProvider } from '../admin/auth/authService';
import {
  PRODUCT_IMAGE_BUCKET,
  ProductImageError,
  SITE_PUBLIC_BUCKET,
  describeImageError,
  fetchRemoteProductImages,
  mutateImage,
  findRegisteredImage,
  retireUpload,
  cleanupImageFiles,
  uploadImageObject,
} from './supabaseProductImages';
import type { ProductImage } from './supabaseProductImages';

export type { ProductImage, ProductImageSource } from './supabaseProductImages';
export { PRODUCT_IMAGE_BUCKET, SITE_PUBLIC_BUCKET, ProductImageError } from './supabaseProductImages';
export { describeImageError } from './supabaseProductImages';

/* ── status ────────────────────────────────────────────────── */

export type ProductImagePhase = 'offline' | 'loading' | 'ready' | 'syncing' | 'error';

export interface ProductImageSyncState {
  /** where the gallery data comes from right now */
  source: 'local' | 'remote';
  phase: ProductImagePhase;
  /** writes currently in flight */
  pending: number;
  /** Persian sentence describing the work in flight (null = idle) */
  activity: string | null;
  /** fatal, shown as an error banner */
  error: string | null;
  /** non-fatal, still worth the admin's attention (e.g. an orphan file) */
  warning: string | null;
  lastSyncedAt: string | null;
}

let snapshot: ProductImage[] | null = null;
let pending = 0;
let readVersion = 0;
// Retain an operation id while its network outcome is unknown (retry-safe dialog).
const uploadAttempts = new WeakMap<PreparedImage, { id: string; path: string; uploaded: boolean; tried: boolean; productId: string; intent: string; expectedUrl: string | null; replaceId: string | null }>();

let state: ProductImageSyncState = {
  source: getSupabase() ? 'remote' : 'local',
  phase: getSupabase() ? 'loading' : 'offline',
  pending: 0,
  activity: null,
  error: null,
  warning: null,
  lastSyncedAt: null,
};

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setState(patch: Partial<ProductImageSyncState>): void {
  state = { ...state, ...patch };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshotRows(): ProductImage[] | null {
  return snapshot;
}

function getState(): ProductImageSyncState {
  return state;
}

/* ── local (demo) overlay ──────────────────────────────────── */

/** A demo-mode upload: the prepared photo lives here as a data URL. */
interface StoredLocalImage {
  id: string;
  productId: string;
  /** prepared data URL — preview AND the value the shop displays */
  storefrontUrl: string;
  altText: string;
  width: number | null;
  height: number | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface ProductImageOverlay {
  uploads: StoredLocalImage[];
  legacy: ProductImage[];
  /** products whose committed photo the admin took off the shop locally */
  clearedProducts: string[];
}

const EMPTY_OVERLAY: ProductImageOverlay = { uploads: [], legacy: [], clearedProducts: [] };

/** Demo mode keeps a handful of photos in this browser — not a warehouse. */
const MAX_DEMO_UPLOADS = 5;
const MAX_DEMO_BYTES = 1_500_000;
/** Demo photos are smaller than real uploads: they must fit localStorage. */
const DEMO_MAX_EDGE = 900;

const LOCAL_STORE_KEY = 'zhino_admin_product_images_v1';

function sanitizeUpload(raw: unknown): StoredLocalImage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.productId !== 'string') return null;
  if (typeof r.storefrontUrl !== 'string' || !r.storefrontUrl.startsWith('data:image/')) return null;
  return {
    id: r.id,
    productId: r.productId,
    storefrontUrl: r.storefrontUrl,
    altText: typeof r.altText === 'string' ? r.altText : '',
    width: typeof r.width === 'number' ? r.width : null,
    height: typeof r.height === 'number' ? r.height : null,
    mimeType: typeof r.mimeType === 'string' ? r.mimeType : 'image/jpeg',
    sizeBytes: typeof r.sizeBytes === 'number' ? r.sizeBytes : 0,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
  };
}

function sanitizeOverlay(raw: unknown): ProductImageOverlay | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const uploads = Array.isArray(r.uploads)
    ? (r.uploads.map(sanitizeUpload).filter((u): u is StoredLocalImage => u !== null))
    : [];
  const clearedProducts = Array.isArray(r.clearedProducts)
    ? (r.clearedProducts as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  const legacy = Array.isArray(r.legacy) ? r.legacy.filter((item): item is ProductImage => {
    if (!item || typeof item !== 'object') return false;
    const row = item as ProductImage;
    return typeof row.id === 'string' && typeof row.productId === 'string'
      && typeof row.storefrontUrl === 'string' && /^(images\/|\/images\/|https:\/\/)/.test(row.storefrontUrl)
      && row.source === 'legacy';
  }).map(row => ({ ...row, virtual: true })) : [];
  return { uploads, legacy, clearedProducts };
}

const store = createLocalStore<ProductImageOverlay>(LOCAL_STORE_KEY, EMPTY_OVERLAY, sanitizeOverlay);

/**
 * Persist the overlay, refusing (loudly) when it would not fit.
 * createLocalStore swallows quota errors, and a silently dropped demo
 * photo would look like a working save — so the size is checked here.
 */
function persistOverlay(next: ProductImageOverlay): void {
  const serialized = JSON.stringify(next);
  if (serialized.length > MAX_DEMO_BYTES * 2) throw new ProductImageError('حافظهٔ نمایشی کافی نیست؛ تصویر کوچک‌تری انتخاب کنید.');
  try { store.setStrict(next); }
  catch { throw new ProductImageError('ذخیره نشد؛ حافظهٔ مرورگر پر است یا اجازهٔ ذخیره نمی‌دهد. اطلاعات قبلی حفظ شد.'); }

}

/* ── merging: gallery rows + what the shop actually shows ───── */

function mimeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.startsWith('data:image/webp')) return 'image/webp';
  if (lower.startsWith('data:image/png')) return 'image/png';
  if (lower.startsWith('data:image/gif')) return 'image/gif';
  if (lower.startsWith('data:image/avif')) return 'image/avif';
  if (lower.startsWith('data:image/')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.avif')) return 'image/avif';
  return 'image/jpeg';
}

/** True for a photo that lives in the repository's public/images folder. */
function isSitePublicUrl(url: string): boolean {
  return !/^https?:\/\//i.test(url) && !url.startsWith('data:');
}

/**
 * Register, client-side, a photo the shop shows but the gallery has no
 * row for: a product created before the gallery existed, or an image
 * path typed into the product form. Nothing is written to the database
 * from a read path — the row is marked `virtual` and the panel offers
 * «انتخاب به‌عنوان تصویر اصلی» / «حذف از نمایش» for it.
 */
function withCatalogMirror(rows: ProductImage[], products: Product[]): ProductImage[] {
  const known = new Set(rows.map((row) => `${row.productId}|${row.storefrontUrl}`));
  const mirrored = rows.slice();

  for (const product of products) {
    const url = (product.imageUrl ?? '');
    if (!url.trim() || known.has(`${product.id}|${url}`)) continue;
    mirrored.push({
      id: `catalog:${product.id}`,
      productId: product.id,
      bucket: isSitePublicUrl(url) ? SITE_PUBLIC_BUCKET : PRODUCT_IMAGE_BUCKET,
      storagePath: url,
      storefrontUrl: url,
      altText: product.shortName || product.name,
      isPrimary: true,
      sortOrder: 0,
      width: null,
      height: null,
      mimeType: mimeFromUrl(url),
      sizeBytes: 0,
      source: isSitePublicUrl(url) ? 'legacy' : 'catalog',
      createdAt: '',
      virtual: true,
    });
  }
  return mirrored;
}

/** Primary first (the shop's own image_url wins), then manual order, then age. */
function sortImages(rows: ProductImage[], products: Product[]): ProductImage[] {
  const shopUrl = new Map(products.map((product) => [product.id, (product.imageUrl ?? '')]));
  const sorted = rows.slice().sort((a, b) => {
    if (a.productId !== b.productId) return a.productId < b.productId ? -1 : 1;
    const url = shopUrl.get(a.productId) ?? '';
    const aShown = url.trim() !== '' && a.storefrontUrl === url ? 1 : 0;
    const bShown = url.trim() !== '' && b.storefrontUrl === url ? 1 : 0;
    if (aShown !== bShown) return bShown - aShown;
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });

  // Exactly one «اصلی» badge per product, whichever way the rows arrived.
  const flagged = new Set<string>();
  return sorted.map((row) => {
    const url = shopUrl.get(row.productId) ?? '';
    const shown = url.trim() !== '' && row.storefrontUrl === url;
    const isPrimary = !flagged.has(row.productId) && shown;
    if (isPrimary) flagged.add(row.productId);
    return isPrimary === row.isPrimary ? row : { ...row, isPrimary };
  });
}

function remoteImages(): ProductImage[] {
  const products = getEffectiveCatalog();
  return sortImages(withCatalogMirror(snapshot ?? [], products), products);
}

function localImages(overlay: ProductImageOverlay): ProductImage[] {
  const products = getEffectiveCatalog();
  const rows: ProductImage[] = overlay.legacy.map(row => ({ ...row, isPrimary: false }));

  for (const product of products) {
    const url = (product.imageUrl ?? '');
    const uploads = overlay.uploads.filter((upload) => upload.productId === product.id);

    if (url && !rows.some(row => row.productId === product.id && row.storefrontUrl === url) && !uploads.some((upload) => upload.storefrontUrl === url) && !overlay.clearedProducts.includes(product.id)) {
      rows.push({
        id: `catalog:${product.id}`,
        productId: product.id,
        bucket: isSitePublicUrl(url) ? SITE_PUBLIC_BUCKET : PRODUCT_IMAGE_BUCKET,
        storagePath: url,
        storefrontUrl: url,
        altText: product.shortName || product.name,
        isPrimary: true,
        sortOrder: 0,
        width: null,
        height: null,
        mimeType: mimeFromUrl(url),
        sizeBytes: 0,
        source: isSitePublicUrl(url) ? 'legacy' : 'catalog',
        createdAt: '',
        virtual: true,
      });
    }

    for (const upload of uploads) {
      rows.push({
        id: upload.id,
        productId: product.id,
        bucket: PRODUCT_IMAGE_BUCKET,
        storagePath: upload.id,
        storefrontUrl: upload.storefrontUrl,
        altText: upload.altText,
        isPrimary: url.trim() !== '' && url === upload.storefrontUrl,
        sortOrder: 1,
        width: upload.width,
        height: upload.height,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        source: 'upload',
        createdAt: upload.createdAt,
        virtual: true,
      });
    }
  }

  return sortImages(rows, products);
}

/* ── reads ─────────────────────────────────────────────────── */

/** The gallery as the panel shows it (database rows + catalog mirror). */
export function getProductImages(): ProductImage[] {
  return state.source === 'remote' ? remoteImages() : localImages(store.get());
}

export function getImagesForProduct(productId: string): ProductImage[] {
  return getProductImages().filter((image) => image.productId === productId);
}

export function getPrimaryImage(productId: string): ProductImage | undefined {
  return getImagesForProduct(productId).find((image) => image.isPrimary);
}

export function getProductImageSyncState(): ProductImageSyncState {
  return state;
}

/** true while the gallery writes to the real database + Storage */
export function isImagesConnected(): boolean {
  return state.source === 'remote';
}

/** React binding — gallery + status for the admin page. */
export function useProductImages(): { images: ProductImage[]; state: ProductImageSyncState } {
  const overlay = useLocalStore(store);
  const products = useCatalog();
  const rows = useSyncExternalStore(subscribe, getSnapshotRows);
  const syncState = useSyncExternalStore(subscribe, getState);
  // The catalog is read during the merge, so the component must also
  // subscribe to it (the page does: it needs names and flavours anyway).
  const images = useMemo(() => {
    if (syncState.source !== 'remote') return localImages(overlay);
    return sortImages(withCatalogMirror(rows ?? [], products), products);
  }, [syncState.source, rows, overlay, products]);
  return { images, state: syncState };
}

export async function refreshProductImages(options: { silent?: boolean } = {}): Promise<void> {
  const version = ++readVersion;
  const supabase = getSupabase();
  if (!supabase) {
    snapshot = null;
    setState({
      source: 'local',
      phase: 'offline',
      error: null,
      warning: null,
      lastSyncedAt: null,
      activity: pending > 0 ? state.activity : null,
    });
    return;
  }

  if (!options.silent) setState({ phase: snapshot ? 'syncing' : 'loading' });

  try {
    const rows = await fetchRemoteProductImages();
    if (version !== readVersion) return;
    snapshot = rows;
    setState({
      source: 'remote',
      phase: pending > 0 ? 'syncing' : 'ready',
      error: null,
      lastSyncedAt: new Date().toISOString(),
      activity: pending > 0 ? state.activity : null,
    });
  } catch (error) {
    if (version !== readVersion) return;
    // Keep the previous rows (stale beats blank) and report honestly.
    setState({
      source: 'remote',
      phase: 'error',
      error: toUserMessage(error, 'خواندن تصاویر محصولات'),
      activity: pending > 0 ? state.activity : null,
    });
  }
}

/* ── error helpers ─────────────────────────────────────────── */

/** The sentence the panel shows: Persian, actionable, no internals. */
export function toUserMessage(error: unknown, context: string): string {
  if (error instanceof ProductImageError) return error.userMessage;
  if (error instanceof Error && error.name === 'ImageFileError') return error.message;
  if (error && typeof error === 'object' && 'userMessage' in error) {
    const value = (error as { userMessage?: unknown }).userMessage;
    if (typeof value === 'string' && value) return value;
  }
  return describeImageError(context, error).userMessage;
}

function toImageError(error: unknown, context: string): ProductImageError {
  if (error instanceof ProductImageError) return error;
  if (error instanceof Error && error.name === 'ImageFileError') return new ProductImageError(error.message);
  return describeImageError(context, error);
}

/* ── write plumbing ────────────────────────────────────────── */

/**
 * Run one admin write with honest status: the panel shows what is
 * happening (`activity`), re-reads the gallery afterwards, and never
 * pretends a refused write succeeded.
 */
async function runWrite<T>(activity: string, work: () => Promise<T>): Promise<T> {
  if (pending) throw new ProductImageError('عملیات قبلی هنوز تمام نشده است؛ کمی صبر کنید.');
  const remote = state.source === 'remote';
  if (remote && (getAuthProvider().mode !== 'supabase' || !snapshot || !getRemoteCatalog() || getCatalogSyncState().phase === 'error')) {
    const message = 'ابتدا با حساب مدیر Supabase وارد شوید و گالری را به‌روز کنید.';
    setState({ error: message, phase: 'error' });
    throw new ProductImageError(message);
  }
  pending = 1;
  setState({ pending, activity, error: null, warning: null, phase: 'syncing' });
  let result: T | undefined;
  let failure: ProductImageError | null = null;
  try { result = await work(); }
  catch (error) { failure = toImageError(error, activity); }
  try {
    if (remote) {
      await Promise.all([refreshRemoteCatalog({ silent: true }), refreshProductImages({ silent: true })]);
      if (getCatalogSyncState().error || state.error) {
        setState({ warning: 'بازخوانی آخرین وضعیت کامل نشد؛ پیش از تغییر بعدی، به‌روزرسانی را بزنید.' });
      }
    } else await refreshProductImages({ silent: true });
  } finally {
    pending = 0;
    setState({ pending: 0, activity: null,
      phase: failure || state.error ? 'error' : remote ? 'ready' : 'offline',
      error: failure?.userMessage ?? state.error });
  }
  if (failure) throw failure;
  return result as T;
}

function saveDemo(product: Product, overlay: ProductImageOverlay, url: string | undefined): void {
  const previous = store.get();
  persistOverlay(overlay);
  try { setLocalProductImage(product, url); }
  catch {
    persistOverlay(previous);
    throw new ProductImageError('ذخیرهٔ تصویر در مرورگر انجام نشد؛ تصویر قبلی حفظ شد.');
  }
}

async function cleanFiles(): Promise<void> {
  try {
    const failed = await cleanupImageFiles();
    if (failed) setState({ warning: 'تغییرات ثبت شد؛ پاک‌سازی بعضی فایل‌های بلااستفاده کامل نشد. «تلاش مجدد پاک‌سازی» را بزنید.' });
  } catch {
    setState({ warning: 'تغییرات گالری محفوظ است؛ پاک‌سازی فایل‌ها اکنون ممکن نیست. بعداً دوباره تلاش کنید.' });
  }
}

export async function retryImageCleanup(): Promise<void> {
  await runWrite('پاک‌سازی فایل‌های بلااستفاده', cleanFiles);
}

function findProduct(productId: string): Product | undefined {
  return getEffectiveCatalog().find((product) => product.id === productId);
}

/* ── upload ────────────────────────────────────────────────── */

export interface UploadRequest {
  productId: string;
  /** the chosen file — ignored when `prepared` is supplied */
  file?: File;
  /**
   * The already-prepared photo from the dialog's preview step, so the
   * admin uploads EXACTLY the bytes they approved (and the work is not
   * done twice).
   */
  prepared?: PreparedImage;
  altText: string;
  /** the new photo becomes the product's «تصویر اصلی» */
  makePrimary: boolean;
  /** the previous primary photo is removed after a successful upload */
  replacePrevious: boolean;
  expectedUrl?: string | null;
  replaceImageId?: string;
}

/**
 * Add one photo to a product's gallery.
 *
 * Connected: prepared locally (validated + downscaled), uploaded to
 * Storage, registered as a row, optionally promoted — and only then is
 * the photo it replaces removed. A refused metadata transaction preserves the previous primary. A lost
 * response is resolved by read-back; it is never treated as permission to delete.
 *
 * Demo: the prepared data URL is stored in this browser and written
 * through the existing catalog overlay.
 */
export async function uploadProductImage(request: UploadRequest): Promise<ProductImage> {
  const product = findProduct(request.productId);
  if (!product) throw new ProductImageError('محصول انتخابی پیدا نشد.');
  if (!request.prepared && !request.file) throw new ProductImageError('فایلی برای بارگذاری انتخاب نشده است.');

  // Captured before anything changes: «replace» means exactly this photo.
  const previousPrimary = getPrimaryImage(request.productId);
  if (request.replacePrevious && !request.makePrimary) throw new ProductImageError('برای جایگزینی، تصویر جدید باید اصلی شود.');
  const expectedUrl = request.expectedUrl === undefined ? product.imageUrl ?? null : request.expectedUrl;
  const demo = state.source !== 'remote';
  const altText = request.altText.trim().slice(0, 200) || product.shortName || product.name;

  return runWrite(`بارگذاری تصویر «${product.shortName}»`, async () => {
    let prepared = request.prepared;
    if (!prepared) {
      setState({ activity: `آماده‌سازی تصویر «${product.shortName}»` });
      prepared = await prepareProductImage(
        request.file as File,
        demo ? { maxEdge: DEMO_MAX_EDGE } : undefined,
      );
    }

    await validatePreparedImage(prepared);
    if (demo) {
      const overlay = store.get();
      if (overlay.uploads.length - (request.replacePrevious && previousPrimary?.id.startsWith('local-') ? 1 : 0) >= MAX_DEMO_UPLOADS) {
        throw new ProductImageError(
          `در حالت نمایشی حداکثر ${MAX_DEMO_UPLOADS} تصویر در همین مرورگر ذخیره می‌شود؛ برای مدیریت کامل تصاویر، Supabase را متصل کنید.`,
        );
      }
      const record: StoredLocalImage = {
        id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        productId: product.id,
        storefrontUrl: prepared.dataUrl,
        altText,
        width: prepared.width || null,
        height: prepared.height || null,
        mimeType: prepared.mime,
        sizeBytes: prepared.bytes,
        createdAt: new Date().toISOString(),
      };

      let uploads = [...overlay.uploads, record];
      if (request.replacePrevious && previousPrimary?.id.startsWith('local-')) {
        uploads = uploads.filter((upload) => upload.id !== previousPrimary.id);
      }
      const bytes = uploads.reduce((sum, upload) => sum + upload.sizeBytes, 0);
      if (bytes > MAX_DEMO_BYTES) throw new ProductImageError('حافظهٔ نمایشی کافی نیست؛ تصویر کوچک‌تری انتخاب کنید.');
      const legacy = previousPrimary?.source === 'legacy' && !overlay.legacy.some(row => row.storefrontUrl === previousPrimary.storefrontUrl && row.productId === product.id)
        ? [...overlay.legacy, { ...previousPrimary, id: `legacy:${crypto.randomUUID()}`, isPrimary: false }] : overlay.legacy;
      saveDemo(product, { ...overlay, uploads, legacy, clearedProducts: overlay.clearedProducts.filter(id => id !== product.id) },
        request.makePrimary || !product.imageUrl ? record.storefrontUrl : product.imageUrl);
      return toLocalImage(record, request.makePrimary);
    }

    /* ── connected: upload bytes, then ONE metadata transaction ── */
    let attempt = uploadAttempts.get(prepared);
    if (attempt && attempt.productId !== product.id) throw new ProductImageError('این پیش‌نمایش به محصول دیگری تعلق دارد؛ فایل را دوباره انتخاب کنید.');
    const intent = JSON.stringify([altText, request.makePrimary, request.replacePrevious,
      request.replaceImageId ?? null, prepared.width, prepared.height, prepared.mime, prepared.bytes]);
    if (attempt && attempt.intent !== intent) throw new ProductImageError('نتیجهٔ درخواست قبلی نامعلوم است؛ همان گزینه‌های قبلی را دوباره ارسال کنید یا گالری را به‌روز کنید.');
    if (!attempt) {
      const id = crypto.randomUUID();
      attempt = { id, path: buildStoragePath(product.id, prepared, id), uploaded: false, tried: false, productId: product.id, intent, expectedUrl,
        replaceId: request.replacePrevious && previousPrimary?.source === 'upload' ? request.replaceImageId ?? previousPrimary.id : null };
      uploadAttempts.set(prepared, attempt);
    }
    const { id, path } = attempt;
    let row: ProductImage | null = null;
    try {
      // A previous unknown result may already be committed. Do not duplicate it.
      if (attempt.uploaded) row = await findRegisteredImage(id, product.id);
      if (!row) {
        const retry = attempt.tried;
        attempt.tried = true;
        const { publicUrl } = await uploadImageObject(path, prepared, attempt.uploaded, retry);
        attempt.uploaded = true;
        row = await mutateImage('register', product.id, id, attempt.expectedUrl, {
          storage_path: path, storefront_url: publicUrl, alt_text: altText,
          width: prepared.width, height: prepared.height, mime_type: prepared.mime,
          size_bytes: prepared.bytes, make_primary: request.makePrimary,
          replace_id: attempt.replaceId,
        });
      }
    } catch (error) {
      try { row = await findRegisteredImage(id, product.id); }
      catch { /* unknown outcome: keep bytes, never guess */ }
      if (!row) {
        try {
          if (!attempt.uploaded) throw error;
          const retired = await retireUpload(path);
          if (retired) { uploadAttempts.delete(prepared); await cleanFiles(); }
          else row = await findRegisteredImage(id, product.id);
        } catch {
          setState({ warning: 'نتیجهٔ شبکه مشخص نیست؛ هیچ فایل تأییدنشده‌ای حذف نشد. پیش‌نمایش را نگه دارید و دوباره تلاش کنید.' });
        }
        if (!row) throw error;
      }
    }
    if (!row) throw new ProductImageError('ثبت تصویر تأیید نشد؛ گالری را به‌روز کنید.');
    uploadAttempts.delete(prepared);
    await cleanFiles();
    return row;
  });
}

function toLocalImage(record: StoredLocalImage, isPrimary: boolean): ProductImage {
  return {
    id: record.id,
    productId: record.productId,
    bucket: PRODUCT_IMAGE_BUCKET,
    storagePath: record.id,
    storefrontUrl: record.storefrontUrl,
    altText: record.altText,
    isPrimary,
    sortOrder: 1,
    width: record.width,
    height: record.height,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    source: 'upload',
    createdAt: record.createdAt,
    virtual: true,
  };
}

/* ── promote ───────────────────────────────────────────────── */

/**
 * Make one photo the product's «تصویر اصلی» — the image the storefront
 * shows on the card, the detail page, the cart and the checkout.
 */
export async function setPrimaryProductImage(image: ProductImage): Promise<void> {
  const product = findProduct(image.productId);
  if (!product) throw new ProductImageError('محصول این تصویر پیدا نشد.');
  await runWrite('انتخاب تصویر اصلی', async () => {
    if (state.source === 'remote') {
      if (image.virtual) throw new ProductImageError('تصویر هنوز از دیتابیس خوانده نشده است؛ به‌روزرسانی را بزنید.');
      await mutateImage('primary', product.id, image.id, product.imageUrl ?? null);
    } else saveDemo(product, store.get(), image.storefrontUrl);
  });
}

export async function updateProductImageAlt(image: ProductImage, altText: string): Promise<void> {
  const product = findProduct(image.productId);
  if (!product) throw new ProductImageError('محصول پیدا نشد.');
  const next = altText.trim().slice(0, 200);
  await runWrite('ویرایش توضیح تصویر', async () => {
    if (state.source === 'remote') {
      if (image.virtual) throw new ProductImageError('ابتدا گالری را به‌روز کنید.');
      await mutateImage('alt', product.id, image.id, product.imageUrl ?? null, { alt_text: next });
    } else {
      const overlay = store.get();
      if (!overlay.uploads.some(row => row.id === image.id) && !overlay.legacy.some(row => row.id === image.id)) throw new ProductImageError('توضیح تصویر فایل سایت از نام محصول گرفته می‌شود.');
      persistOverlay({ ...overlay, uploads: overlay.uploads.map(row => row.id === image.id ? { ...row, altText: next } : row), legacy: overlay.legacy.map(row => row.id === image.id ? { ...row, altText: next } : row) });
    }
  });
}

export async function deleteProductImage(image: ProductImage, allowEmpty = false): Promise<void> {
  const product = findProduct(image.productId);
  if (!product) throw new ProductImageError('محصول پیدا نشد.');
  await runWrite('حذف تصویر', async () => {
    if (state.source === 'remote') {
      if (image.virtual) throw new ProductImageError('ابتدا گالری را به‌روز کنید.');
      await mutateImage('delete', product.id, image.id, product.imageUrl ?? null, { allow_empty: allowEmpty });
      await cleanFiles();
    } else {
      const overlay = store.get();
      const others = getImagesForProduct(product.id).filter(row => row.id !== image.id);
      if (!others.length && !allowEmpty) throw new ProductImageError('حذف آخرین تصویر نیاز به تأیید جداگانه دارد.');
      saveDemo(product, {
        ...overlay, uploads: overlay.uploads.filter(row => row.id !== image.id),
        legacy: overlay.legacy.filter(row => row.id !== image.id),
        clearedProducts: !image.id.startsWith('local-') ? [...new Set([...overlay.clearedProducts, product.id])] : overlay.clearedProducts,
      }, product.imageUrl === image.storefrontUrl ? others[0]?.storefrontUrl : product.imageUrl);
    }
  });
}

/** Clear the non-fatal warning banner (the admin read it). */
export function dismissImageWarning(): void {
  if (state.warning) setState({ warning: null });
}

/** Drop a failed read/write banner and try again. */
export function dismissImageError(): void {
  if (state.error) setState({ error: null, phase: snapshot ? 'ready' : state.phase });
}

/* ── lifecycle ─────────────────────────────────────────────── */

/**
 * Start keeping the gallery fresh. Called by the images page while it
 * is mounted (the gallery is admin-only, so nothing is read for the
 * storefront). Safe to call more than once; a no-op without Supabase.
 */
export function startProductImageSync(): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    setState({ source: 'local', phase: 'offline', error: null, activity: null });
    return () => undefined;
  }

  void refreshProductImages();

  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
      setTimeout(() => void refreshProductImages({ silent: true }), 0);
    } else if (event === 'SIGNED_OUT') {
      ++readVersion;
      snapshot = null;
      setState({ phase: 'loading', error: null, activity: null });
    }
  });

  const onFocus = () => { if (!pending) void refreshProductImages({ silent: true }); };
  window.addEventListener('focus', onFocus);
  return () => { ++readVersion; data.subscription.unsubscribe(); window.removeEventListener('focus', onFocus); };
}
