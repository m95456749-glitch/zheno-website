// ============================================================
// ZHINO — product image file handling (admin uploads)
//
// One place that knows what a valid product photo is:
//   1. VALIDATION — only real image types, only up to the same
//      8 MB limit the Supabase Storage bucket enforces, so a file
//      the database would refuse is refused here first, with a
//      Persian sentence the manager can act on.
//   2. PREPARATION — the photo is downscaled to at most
//      MAX_EDGE_PX on its longest side and re-encoded (WebP, or
//      JPEG when the browser cannot encode WebP). A 6 MB phone
//      photo becomes ~150 KB without visible loss on a storefront
//      card, which keeps the shop fast and Storage cheap.
//      Animated GIFs are passed through untouched: re-encoding
//      would silently drop their animation.
//   3. PREVIEW — a data URL is produced for the «before saving»
//      preview, and (in demo mode, without Supabase) it is also
//      what gets persisted.
//
// Nothing here talks to the network; see
// src/services/supabaseProductImages.ts for the upload itself.
// ============================================================

/** MIME types the Storage bucket accepts (kept in sync with the migration). */
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
] as const;

/** Bucket limit from supabase/migrations/20260919000000_product_images.sql */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Longest side kept after preparation (storefront cards need far less). */
export const MAX_EDGE_PX = 1400;

/** Encoding quality for the prepared file. */
const QUALITY = 0.86;

export interface PrepareOptions {
  /** longest side to keep — the demo (offline) mode uses a smaller one */
  maxEdge?: number;
  quality?: number;
}

export interface PreparedImage {
  /** bytes to upload (the original file when no preparation was needed) */
  blob: Blob;
  /** data URL — the preview shown before saving */
  dataUrl: string;
  mime: string;
  /** file extension without the dot: jpg | png | webp | gif */
  extension: string;
  width: number;
  height: number;
  bytes: number;
  originalName: string;
  originalBytes: number;
  originalMime: string;
  /** true when the file was downscaled/re-encoded by this module */
  optimized: boolean;
}

/** A refusal the admin panel can show verbatim (Persian, no internals). */
export class ImageFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageFileError';
  }
}

/** «۲٫۴ مگابایت» — used by the upload dialog and the gallery. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '۰ بایت';
  const units = ['بایت', 'کیلوبایت', 'مگابایت'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value.toLocaleString('fa-IR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: unit === 0 ? 0 : 1,
  });
  return `${digits} ${units[unit]}`;
}

function extensionOf(mime: string, fileName: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/avif') return 'avif';
  if (mime === 'image/jpeg') return 'jpg';
  const fromName = fileName.toLowerCase().match(/\.(jpe?g|png|webp|avif|gif)$/);
  return fromName ? (fromName[1] === 'jpeg' ? 'jpg' : fromName[1]) : 'jpg';
}

/** True for a MIME type / filename the gallery is allowed to store. */
export function isAcceptedImageFile(file: { type?: string; name?: string }): boolean {
  const type = (file.type ?? '').toLowerCase();
  if ((ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type)) return true;
  // Some Android/iOS builds hand over an empty type: fall back to the name.
  if (type === '') return /\.(jpe?g|png|webp|avif|gif)$/i.test(file.name ?? '');
  return false;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new ImageFileError('خواندن فایل برای پیش‌نمایش ناموفق بود.'));
    reader.readAsDataURL(blob);
  });
}

/** Load the pixels, honouring the camera's EXIF rotation. */
async function loadBitmap(file: File): Promise<{ source: ImageBitmap | HTMLImageElement; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close?.(),
      };
    } catch {
      // fall through to the <img> path (older browsers, odd codecs)
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new ImageFileError('فایل انتخابی تصویر معتبری نیست یا مرورگر نمی‌تواند آن را باز کند.'));
      img.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}

/** Check bytes, not the file extension or the browser-provided MIME alone. */
async function detectImageMime(blob: Blob): Promise<string> {
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new ImageFileError('خواندن فایل ممکن نشد؛ دوباره انتخاب کنید.'));
    reader.readAsArrayBuffer(blob.slice(0, 64));
  });
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)) return 'image/png';
  if (['GIF87a','GIF89a'].includes(ascii(0,6))) return 'image/gif';
  if (ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP') return 'image/webp';
  if (ascii(4,8) === 'ftyp' && /avif|avis/.test(ascii(8,64))) return 'image/avif';
  throw new ImageFileError('محتوای فایل تصویر مجاز نیست؛ تغییر پسوند فایل کافی نیست.');
}

export async function validatePreparedImage(image: PreparedImage): Promise<void> {
  if (!image.blob.size || image.blob.size > MAX_IMAGE_BYTES || image.bytes !== image.blob.size) {
    throw new ImageFileError('فایل خالی است یا حجم نهایی آن از ۸ مگابایت بیشتر است.');
  }
  if (await detectImageMime(image.blob) !== image.mime || extensionOf(image.mime, '') !== image.extension) {
    throw new ImageFileError('فرمت واقعی تصویر با اطلاعات فایل هم‌خوانی ندارد.');
  }
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width <= 0 || image.height <= 0
      || image.width * image.height > 40_000_000) throw new ImageFileError('ابعاد تصویر معتبر نیست یا بیش از ۴۰ مگاپیکسل است.');
}

/**
 * Validate + prepare one photo for the product gallery.
 *
 * Throws ImageFileError with a Persian, user-facing reason when the
 * file cannot be used — the caller shows that sentence as-is.
 */
export async function prepareProductImage(file: File, options: PrepareOptions = {}): Promise<PreparedImage> {
  const maxEdge = options.maxEdge && options.maxEdge > 0 ? options.maxEdge : MAX_EDGE_PX;
  const quality = options.quality && options.quality > 0 && options.quality <= 1 ? options.quality : QUALITY;
  if (!file) throw new ImageFileError('فایلی انتخاب نشده است.');
  if (!isAcceptedImageFile(file)) {
    throw new ImageFileError('فقط تصویر با قالب jpg، png، webp، avif یا gif مجاز است.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageFileError(
      `حجم فایل ${formatBytes(file.size)} است؛ حداکثر ${formatBytes(MAX_IMAGE_BYTES)} مجاز است.`,
    );
  }

  if (file.size === 0) throw new ImageFileError('فایل انتخابی خالی است.');
  const originalMime = await detectImageMime(file);
  if (file.type && file.type.toLowerCase() !== originalMime) throw new ImageFileError('نوع اعلام‌شدهٔ فایل با فرمت واقعی آن هم‌خوانی ندارد.');
  const originalName = file.name || 'image';

  const loaded = await loadBitmap(file);
  let release = loaded.release;
  try {
    if (!loaded.width || !loaded.height) {
      throw new ImageFileError('ابعاد تصویر خوانده نشد؛ فایل دیگری انتخاب کنید.');
    }

    if (loaded.width * loaded.height > 40_000_000) throw new ImageFileError('تصویر بیش از ۴۰ مگاپیکسل است؛ نسخهٔ کوچک‌تری انتخاب کنید.');
    if (originalMime === 'image/gif') {
      return { blob: file, dataUrl: await readAsDataUrl(file), mime: originalMime,
        extension: 'gif', width: loaded.width, height: loaded.height, bytes: file.size,
        originalName, originalBytes: file.size, originalMime, optimized: false };
    }
    const scale = Math.min(1, maxEdge / Math.max(loaded.width, loaded.height));
    const width = Math.max(1, Math.round(loaded.width * scale));
    const height = Math.max(1, Math.round(loaded.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      // No canvas available (very old/odd browser): send the original file.
      return {
        blob: file,
        dataUrl: await readAsDataUrl(file),
        mime: originalMime,
        extension: extensionOf(originalMime, originalName),
        width: loaded.width,
        height: loaded.height,
        bytes: file.size,
        originalName,
        originalBytes: file.size,
        originalMime,
        optimized: false,
      };
    }

    // JPEG has no alpha channel: lay the photo on white instead of black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(loaded.source, 0, 0, width, height);
    // The bitmap is no longer needed; release it before encoding.
    release();
    release = () => undefined;

    const preferred = await canvasToBlob(canvas, 'image/webp', quality);
    // Browsers without a WebP encoder answer with a PNG blob — detect it
    // through the blob's own type instead of trusting the request.
    const webpOk = preferred !== null && preferred.type === 'image/webp';
    const encoded = webpOk ? preferred : await canvasToBlob(canvas, 'image/jpeg', quality);

    if (!encoded) {
      return {
        blob: file,
        dataUrl: await readAsDataUrl(file),
        mime: originalMime,
        extension: extensionOf(originalMime, originalName),
        width: loaded.width,
        height: loaded.height,
        bytes: file.size,
        originalName,
        originalBytes: file.size,
        originalMime,
        optimized: false,
      };
    }

    if (encoded.size > MAX_IMAGE_BYTES) throw new ImageFileError('حجم تصویر آماده‌شده بیشتر از ۸ مگابایت است.');
    const mime = encoded.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    // Never upload a "prepared" file that is heavier than the original.
    const useOriginal = encoded.size >= file.size && scale === 1;
    const blob = useOriginal ? (file as Blob) : encoded;

    return {
      blob,
      dataUrl: await readAsDataUrl(blob),
      mime: useOriginal ? originalMime : mime,
      extension: useOriginal ? extensionOf(originalMime, originalName) : extensionOf(mime, originalName),
      width: useOriginal ? loaded.width : width,
      height: useOriginal ? loaded.height : height,
      bytes: blob.size,
      originalName,
      originalBytes: file.size,
      originalMime,
      optimized: !useOriginal,
    };
  } finally {
    release();
  }
}

/**
 * A safe, unique Storage object path for one upload:
 *   products/<product-id>/<timestamp>-<slug>.<ext>
 * Latin, lowercase and short — no spaces, no Persian characters, no
 * characters Storage or a CDN would have to escape.
 */
export function buildStoragePath(productId: string, prepared: PreparedImage, uploadId = crypto.randomUUID()): string {
  const id = productId.replace(/[^a-zA-Z0-9-]+/g, '-').slice(0, 60) || 'product';
  return `products/${id}/${uploadId}.${prepared.extension}`;
}
