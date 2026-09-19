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
//   * Deletion order: un-point the storefront → drop the row → remove
//     the object. A failure in the last step leaves an unreachable
//     file (reported as a warning), never a broken shop image.
// ============================================================

import { useMemo, useSyncExternalStore } from 'react';
import type { Product } from '../types';
import { buildStoragePath, prepareProductImage } from '../utils/imageFile';
import type { PreparedImage } from '../utils/imageFile';
import { getCatalogMeta, getEffectiveCatalog, upsertProduct } from './catalog';
import { refreshRemoteCatalog } from './catalogSync';
import { createLocalStore, useLocalStore } from './localStore';
import { getSupabase } from './supabaseClient';
import {
  PRODUCT_IMAGE_BUCKET,
  ProductImageError,
  SITE_PUBLIC_BUCKET,
  deleteImageRow,
  describeImageError,
  fetchRemoteProductImages,
  insertImageRow,
  pushProductImageUrl,
  removeImageObject,
  setPrimaryImage,
  updateImageRow,
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
  /** products whose committed photo the admin took off the shop locally */
  clearedProducts: string[];
}

const EMPTY_OVERLAY: ProductImageOverlay = { uploads: [], clearedProducts: [] };

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
  return { uploads, clearedProducts };
}

const store = createLocalStore<ProductImageOverlay>(LOCAL_STORE_KEY, EMPTY_OVERLAY, sanitizeOverlay);

/**
 * Persist the overlay, refusing (loudly) when it would not fit.
 * createLocalStore swallows quota errors, and a silently dropped demo
 * photo would look like a working save — so the size is checked here.
 */
function persistOverlay(next: ProductImageOverlay): void {
  let serialized = '';
  try {
    serialized = JSON.stringify(next);
  } catch {
    throw new ProductImageError('ذخیرهٔ تصویر در حافظهٔ مرورگر ممکن نشد.');
  }
  if (serialized.length > MAX_DEMO_BYTES * 2) {
    throw new ProductImageError(
      `حافظهٔ مرورگر برای ${next.uploads.length} تصویر نمایشی کافی نیست؛ یک تصویر را حذف کنید یا Supabase را متصل کنید.`,
    );
  }
  store.set(next);

  // Confirm the write really landed (private mode / full quota).
  try {
    const raw = window.localStorage.getItem(LOCAL_STORE_KEY);
    const stored = raw ? sanitizeOverlay(JSON.parse(raw)) : null;
    if (!stored || stored.uploads.length !== next.uploads.length) {
      throw new ProductImageError(
        'تصویر در حافظهٔ مرورگر ذخیره نشد (حافظه پر است یا مرورگر اجازهٔ ذخیره نمی‌دهد).',
      );
    }
  } catch (error) {
    if (error instanceof ProductImageError) throw error;
    throw new ProductImageError('ذخیرهٔ تصویر در حافظهٔ مرورگر ممکن نشد.');
  }
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
    const url = (product.imageUrl ?? '').trim();
    if (!url || known.has(`${product.id}|${url}`)) continue;
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
  const shopUrl = new Map(products.map((product) => [product.id, (product.imageUrl ?? '').trim()]));
  const sorted = rows.slice().sort((a, b) => {
    if (a.productId !== b.productId) return a.productId < b.productId ? -1 : 1;
    const url = shopUrl.get(a.productId) ?? '';
    const aShown = url !== '' && a.storefrontUrl === url ? 1 : 0;
    const bShown = url !== '' && b.storefrontUrl === url ? 1 : 0;
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
    const shown = url !== '' && row.storefrontUrl === url;
    const isPrimary = flagged.has(row.productId) ? false : shown || row.isPrimary;
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
  const rows: ProductImage[] = [];

  for (const product of products) {
    const url = (product.imageUrl ?? '').trim();
    const uploads = overlay.uploads.filter((upload) => upload.productId === product.id);

    if (url && !uploads.some((upload) => upload.storefrontUrl === url) && !overlay.clearedProducts.includes(product.id)) {
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
        isPrimary: url !== '' && url === upload.storefrontUrl,
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
  const rows = useSyncExternalStore(subscribe, getSnapshotRows);
  const syncState = useSyncExternalStore(subscribe, getState);
  // The catalog is read during the merge, so the component must also
  // subscribe to it (the page does: it needs names and flavours anyway).
  const images = useMemo(() => {
    if (syncState.source !== 'remote') return localImages(overlay);
    const products = getEffectiveCatalog();
    return sortImages(withCatalogMirror(rows ?? [], products), products);
  }, [syncState.source, rows, overlay]);
  return { images, state: syncState };
}

export async function refreshProductImages(options: { silent?: boolean } = {}): Promise<void> {
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
    snapshot = rows;
    setState({
      source: 'remote',
      phase: pending > 0 ? 'syncing' : 'ready',
      error: null,
      lastSyncedAt: new Date().toISOString(),
      activity: pending > 0 ? state.activity : null,
    });
  } catch (error) {
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
  const remote = state.source === 'remote';
  pending += 1;
  setState({ activity, error: null, warning: null, phase: remote ? 'syncing' : state.phase });

  let failure: ProductImageError | null = null;
  let result: T | undefined;
  try {
    result = await work();
  } catch (error) {
    failure = toImageError(error, activity);
  }

  await refreshProductImages({ silent: true });

  pending = Math.max(0, pending - 1);
  if (failure) {
    setState({ phase: 'error', error: failure.userMessage, activity: pending > 0 ? activity : null });
    throw failure;
  }
  setState({
    phase: remote ? (pending > 0 ? 'syncing' : 'ready') : 'offline',
    activity: pending > 0 ? activity : null,
  });
  return result as T;
}

/** Re-read the shop's catalog so a new primary shows up immediately. */
async function refreshShopCatalog(): Promise<void> {
  if (state.source === 'remote') {
    try {
      await refreshRemoteCatalog({ silent: true });
    } catch {
      // The catalog layer keeps its own snapshot + error banner.
    }
  }
}

function writeShopImageLocal(product: Product, storefrontUrl: string | null | undefined): void {
  upsertProduct({ ...product, imageUrl: storefrontUrl ?? undefined }, getCatalogMeta(product.id).active);
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
}

/**
 * Add one photo to a product's gallery.
 *
 * Connected: prepared locally (validated + downscaled), uploaded to
 * Storage, registered as a row, optionally promoted — and only then is
 * the photo it replaces removed. A failure at any step leaves the shop
 * showing what it showed before.
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

    if (demo) {
      const overlay = store.get();
      if (overlay.uploads.length >= MAX_DEMO_UPLOADS) {
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
      const bytes = uploads.reduce((sum, upload) => sum + upload.sizeBytes, 0);
      if (bytes > MAX_DEMO_BYTES) {
        throw new ProductImageError(
          'حافظهٔ مرورگر برای این تصویر نمایشی کافی نیست؛ تصویر کوچک‌تری انتخاب کنید.',
        );
      }
      if (request.replacePrevious && previousPrimary && previousPrimary.id.startsWith('local-')) {
        uploads = uploads.filter((upload) => upload.id !== previousPrimary.id);
      }
      setState({ activity: `ذخیرهٔ تصویر «${product.shortName}»` });
      persistOverlay({ ...overlay, uploads });

      if (request.makePrimary) writeShopImageLocal(product, record.storefrontUrl);
      return toLocalImage(record, request.makePrimary);
    }

    /* ── connected: Storage + product_images ── */
    setState({ activity: `بارگذاری تصویر «${product.shortName}» در فضای ذخیره‌سازی` });
    const path = buildStoragePath(product.id, prepared);
    const { publicUrl } = await uploadImageObject(path, prepared);

    let row: ProductImage;
    try {
      row = await insertImageRow({
        productId: product.id,
        bucket: PRODUCT_IMAGE_BUCKET,
        storagePath: path,
        storefrontUrl: publicUrl,
        altText,
        width: prepared.width || null,
        height: prepared.height || null,
        mimeType: prepared.mime,
        sizeBytes: prepared.bytes,
        source: 'upload',
      });
    } catch (error) {
      // The row was refused → do not leave an orphan object behind.
      try {
        await removeImageObject(path);
      } catch {
        setState({ warning: 'فایل بارگذاری‌شده در فضای ذخیره‌سازی باقی ماند و از گالری حذف نشد.' });
      }
      throw error;
    }

    // Promote FIRST, so the shop is never left without its photo.
    if (request.makePrimary) {
      setState({ activity: `انتخاب تصویر اصلی «${product.shortName}»` });
      await setPrimaryImage(row.id);
    }

    // Only now remove what the admin asked to replace — and only ever an
    // object this panel uploaded. A committed public/images photo keeps
    // its file AND its gallery row: it simply stops being the primary.
    if (
      request.replacePrevious &&
      previousPrimary &&
      previousPrimary.id !== row.id &&
      previousPrimary.source === 'upload'
    ) {
      setState({ activity: `حذف تصویر قبلی «${product.shortName}»` });
      await dropUploadedImage(previousPrimary);
    }

    await refreshShopCatalog();
    return row;
  });
}

/**
 * Remove an uploaded photo's row + object WITHOUT re-pointing the
 * storefront: used by «جایگزینی», where the new primary was just set
 * deliberately. Committed site files are never touched — neither the
 * repository file nor its gallery row.
 */
async function dropUploadedImage(image: ProductImage): Promise<void> {
  if (image.virtual || image.source !== 'upload') return;
  await deleteImageRow(image.id);
  if (image.bucket === PRODUCT_IMAGE_BUCKET && image.source === 'upload') {
    try {
      await removeImageObject(image.storagePath);
    } catch (error) {
      setState({
        warning: `تصویر قبلی از گالری حذف شد، اما فایل آن در فضای ذخیره‌سازی باقی ماند — ${toUserMessage(error, 'حذف فایل')}`,
      });
    }
  }
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

  await runWrite(`انتخاب تصویر اصلی «${product.shortName}»`, async () => {
    if (state.source === 'remote' && !image.virtual) {
      await setPrimaryImage(image.id);
    } else if (state.source === 'remote') {
      // A catalog-mirrored row has no database row yet: mirror its URL.
      await pushProductImageUrl(image.productId, image.storefrontUrl);
    } else {
      writeShopImageLocal(product, image.storefrontUrl);
      const overlay = store.get();
      if (overlay.clearedProducts.includes(product.id)) {
        persistOverlay({
          ...overlay,
          clearedProducts: overlay.clearedProducts.filter((id) => id !== product.id),
        });
      }
    }
    await refreshShopCatalog();
  });
}

/* ── edit ──────────────────────────────────────────────────── */

/** Update a photo's alt text (what screen readers and the shop announce). */
export async function updateProductImageAlt(image: ProductImage, altText: string): Promise<void> {
  const next = altText.trim().slice(0, 200);

  await runWrite('ویرایش توضیح تصویر', async () => {
    if (state.source === 'remote') {
      if (image.virtual) {
        throw new ProductImageError(
          'توضیح این تصویر از نام محصول گرفته می‌شود؛ برای ویرایش، آن را به گالری اضافه کنید.',
        );
      }
      await updateImageRow(image.id, { altText: next });
      return;
    }

    const overlay = store.get();
    if (!image.id.startsWith('local-')) {
      throw new ProductImageError(
        'توضیح این تصویر از نام محصول گرفته می‌شود؛ برای ویرایش، تصویر جدیدی بارگذاری کنید.',
      );
    }
    persistOverlay({
      ...overlay,
      uploads: overlay.uploads.map((upload) => (upload.id === image.id ? { ...upload, altText: next } : upload)),
    });
  });
}

/* ── delete ────────────────────────────────────────────────── */

/**
 * Remove one photo AFTER the admin confirmed it.
 *
 * Order matters: first the storefront stops pointing at it, then the
 * gallery row goes, and only then the Storage object. A committed
 * public/images file (source 'legacy') is never deleted from the
 * repository — the row/registration is removed and the shop falls back
 * to the flavour artwork it already renders.
 */
export async function deleteProductImage(image: ProductImage): Promise<void> {
  await removeImage(image, { silentStorefront: false });
}

async function removeImage(image: ProductImage, options: { silentStorefront: boolean }): Promise<void> {
  const product = findProduct(image.productId);
  const label = options.silentStorefront ? 'جایگزینی تصویر قبلی' : 'حذف تصویر';

  await runWrite(label, async () => {
    const others = getImagesForProduct(image.productId).filter((row) => row.id !== image.id);
    const wasShown = product ? (product.imageUrl ?? '').trim() === image.storefrontUrl : image.isPrimary;

    if (state.source === 'remote') {
      // 1. the storefront must never point at a photo being removed
      if (wasShown || image.isPrimary) {
        const next = others[0];
        if (next && !next.virtual) await setPrimaryImage(next.id);
        else if (next) await pushProductImageUrl(image.productId, next.storefrontUrl);
        else await pushProductImageUrl(image.productId, null);
      }

      // 2. the gallery row
      if (!image.virtual) await deleteImageRow(image.id);

      // 3. the bytes — only ever for objects this panel uploaded
      if (image.bucket === PRODUCT_IMAGE_BUCKET && image.source === 'upload' && !image.virtual) {
        try {
          await removeImageObject(image.storagePath);
        } catch (error) {
          setState({
            warning: `تصویر از گالری حذف شد، اما فایل آن در فضای ذخیره‌سازی باقی ماند — ${toUserMessage(error, 'حذف فایل')}`,
          });
        }
      }

      await refreshShopCatalog();
      return;
    }

    /* ── demo mode ── */
    const overlay = store.get();
    if (image.id.startsWith('local-')) {
      persistOverlay({ ...overlay, uploads: overlay.uploads.filter((upload) => upload.id !== image.id) });
    } else if (product) {
      // The committed photo stays in the repository; the shop stops showing it.
      persistOverlay({
        ...overlay,
        clearedProducts: overlay.clearedProducts.includes(product.id)
          ? overlay.clearedProducts
          : [...overlay.clearedProducts, product.id],
      });
    }

    if (wasShown && product) {
      const remaining = others.find((row) => row.id.startsWith('local-')) ?? others[0];
      writeShopImageLocal(product, remaining ? remaining.storefrontUrl : undefined);
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
      void refreshProductImages({ silent: true });
    } else if (event === 'SIGNED_OUT') {
      snapshot = null;
      setState({ phase: 'loading', error: null, activity: null });
    }
  });

  return () => data.subscription.unsubscribe();
}
