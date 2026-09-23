// ============================================================
// ZHINO — admin: «تصاویر محصولات»
//
// Everything a manager needs to keep the shop's photos current,
// without touching a single line of code:
//   • every product with its name, flavour and current photo
//   • upload a new photo (Supabase Storage, prepared + previewed
//     before anything is sent)
//   • replace the photo the shop shows
//   • delete a photo — only after an explicit confirmation dialog
//   • choose which photo is the product's «تصویر اصلی»
//   • honest status: what is uploading, what failed and why
//
// The storefront keeps reading the same single field it always read
// (products.image_url): promoting a photo mirrors its URL there, so
// the shop, the cart and the checkout are untouched by design.
//
// Access: the page renders behind AdminGate, and every write is
// authorised a second time by Row Level Security (is_admin()) — the
// panel holds no privileged key.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { getFlavor } from '../../data/products';
import type { Product, ProductCategory } from '../../types';
import { reloadCatalogFromDatabase, useCatalog } from '../../services/catalog';
import {
  deleteProductImage,
  dismissImageError,
  dismissImageWarning,
  isImagesConnected,
  refreshProductImages,
  retryImageCleanup,
  setPrimaryProductImage,
  startProductImageSync,
  toUserMessage,
  updateProductImageAlt,
  uploadProductImage,
  useProductImages,
} from '../../services/productImages';
import type { ProductImage } from '../../services/productImages';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  formatBytes,
  prepareProductImage,
} from '../../utils/imageFile';
import type { PreparedImage } from '../../utils/imageFile';
import { formatNumber, toPersianDigits } from '../../utils/format';
import ProductVisual from '../../components/ProductVisual';
import { Field, Modal, SavedFlash, Toggle } from '../components/ui';
import { formatDateTime } from '../format';
import {
  IconAlert,
  IconCheck,
  IconClose,
  IconEye,
  IconImage,
  IconPencil,
  IconRefresh,
  IconSearch,
  IconStar,
  IconTrash,
  IconUpload,
} from '../Icons';
import { cn } from '../../utils/cn';

type CategoryFilter = 'all' | ProductCategory;

interface DialogTarget {
  product: Product;
  /** 'replace' pre-selects «جایگزینی تصویر اصلی» in the dialog */
  mode: 'add' | 'replace';
}

export default function AdminProductImagesPage() {
  const catalog = useCatalog();
  const { images, state } = useProductImages();
  const connected = isImagesConnected();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [dialog, setDialog] = useState<DialogTarget | null>(null);
  const [deleting, setDeleting] = useState<ProductImage | null>(null);
  const [editing, setEditing] = useState<ProductImage | null>(null);
  const [preview, setPreview] = useState<ProductImage | null>(null);
  const [saved, setSaved] = useState(false);

  // The gallery is admin-only data: read it while this page is open,
  // follow sign-in/sign-out, and stop when the manager leaves.
  useEffect(() => startProductImageSync(), []);

  const byProduct = useMemo(() => {
    const map = new Map<string, ProductImage[]>();
    for (const image of images) {
      const list = map.get(image.productId);
      if (list) list.push(image);
      else map.set(image.productId, [image]);
    }
    return map;
  }, [images]);

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((product) => {
      if (filter !== 'all' && product.category !== filter) return false;
      if (onlyMissing && (byProduct.get(product.id)?.length ?? 0) > 0) return false;
      if (q === '') return true;
      const flavor = getFlavor(product.flavorId);
      return (
        product.name.toLowerCase().includes(q) ||
        product.shortName.toLowerCase().includes(q) ||
        flavor.name.toLowerCase().includes(q)
      );
    });
  }, [catalog, filter, query, onlyMissing, byProduct]);

  const totals = useMemo(() => {
    const withoutImage = catalog.filter((product) => (byProduct.get(product.id)?.length ?? 0) === 0).length;
    return { products: catalog.length, images: images.length, withoutImage };
  }, [catalog, images, byProduct]);

  const flashSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  const busy = state.pending > 0 || state.phase === 'loading';

  return (
    <div className="adm-images-page" dir="rtl">
      <header className="adm-gallery-intro">
        <div><span className="adm-gallery-eyebrow">گالری محصولات · ژینو</span>
          <h2>تصویر خوب، انتخاب دل‌چسب</h2>
          <p>عکس‌های هر محصول را یک‌جا ببینید؛ با خیال آسوده بارگذاری، انتخاب و جایگزین کنید.</p>
        </div>
        <span className="adm-gallery-seal" aria-hidden="true"><IconImage className="h-7 w-7" /></span>
      </header>
      {/* ── status: where the photos live, and what is happening ── */}
      <div className="adm-images-status panel-lux rounded-2xl p-4 sm:p-5">
        <div className="adm-images-status-head">
          <span className="adm-images-status-icon">
            <IconImage className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.86rem] font-extrabold text-wine-950">
              {connected ? 'فضای ذخیره‌سازی Supabase' : 'حالت نمایشی — حافظهٔ همین مرورگر'}
            </p>
            <p className="mt-1 text-[0.68rem] leading-6 text-mocha">
              {connected ? (
                <>
                  فایل‌ها در سطل <span dir="ltr" className="font-bold">product-images</span> ذخیره می‌شوند؛
                  نوشتن فقط برای حساب دارای نقش <span dir="ltr">admin</span> مجاز است (RLS).
                </>
              ) : (
                'بدون اتصال Supabase، تصویرها فقط در همین مرورگر می‌مانند و در فروشگاه واقعی دیده نمی‌شوند.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void Promise.all([reloadCatalogFromDatabase(), refreshProductImages()])}
            disabled={busy}
            className="adm-images-refresh"
            title="خواندن دوبارهٔ تصویرها از دیتابیس"
          >
            <IconRefresh className={cn('h-4 w-4', busy && 'adm-spin')} />
            <span>به‌روزرسانی</span>
          </button>
        </div>

        <dl className="adm-images-stats">
          <div>
            <dt>محصول‌ها</dt>
            <dd>{formatNumber(totals.products)}</dd>
          </div>
          <div>
            <dt>تصویرهای گالری</dt>
            <dd>{formatNumber(totals.images)}</dd>
          </div>
          <div className={totals.withoutImage > 0 ? 'adm-images-stat-warn' : undefined}>
            <dt>بدون تصویر</dt>
            <dd>{formatNumber(totals.withoutImage)}</dd>
          </div>
          {state.lastSyncedAt && (
            <div>
              <dt>آخرین همگام‌سازی</dt>
              <dd className="!text-[0.72rem] font-bold">{formatDateTime(state.lastSyncedAt)}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* ── honest feedback: activity, failure, partial success ── */}
      {state.activity && (
        <div className="adm-activity" role="status" aria-live="polite">
          <span className="adm-progress" aria-hidden="true">
            <span className="adm-progress-bar" />
          </span>
          <span>{state.activity}…</span>
        </div>
      )}

      {state.error && (
        <div className="adm-banner adm-banner-error" role="alert">
          <IconAlert className="h-4 w-4 shrink-0" />
          <p>{state.error}</p>
          <button type="button" onClick={dismissImageError} className="adm-banner-close" aria-label="بستن پیام خطا">
            <IconClose className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {state.warning && (
        <div className="adm-banner adm-banner-warning" role="status">
          <IconAlert className="h-4 w-4 shrink-0" />
          <p>{state.warning}</p>
          <button type="button" onClick={dismissImageWarning} className="adm-banner-close" aria-label="بستن پیام هشدار">
            <IconClose className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {connected && <button type="button" className="adm-cleanup-button" disabled={busy}
        onClick={() => void retryImageCleanup().catch(() => undefined)}>
        <IconRefresh className="h-4 w-4" /> تلاش مجدد پاک‌سازی فایل‌های بلااستفاده
      </button>}
      <SavedFlash show={saved} />

      {/* ── toolbar ───────────────────────────────────────────── */}
      <div className="adm-image-toolbar mb-5 mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:min-w-44">
          <IconSearch className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mocha-light" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی محصول یا طعم…"
            className="adm-input ps-9"
            aria-label="جستجوی محصول یا طعم"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as CategoryFilter)}
          aria-label="فیلتر دسته‌بندی"
          className="adm-input sm:w-40"
        >
          <option value="all">همه دسته‌ها</option>
          <option value="jelly">پودر ژله</option>
          <option value="custard">پودر کاستر</option>
        </select>
        <button
          type="button"
          onClick={() => setOnlyMissing((value) => !value)}
          className={cn('adm-chip-toggle', onlyMissing && 'active')}
          aria-pressed={onlyMissing}
        >
          فقط بدون تصویر
        </button>
      </div>

      {/* ── gallery ───────────────────────────────────────────── */}
      {state.phase === 'loading' ? (
        <div className="adm-images-grid">
          {[0, 1, 2].map((key) => (
            <div key={key} className="adm-image-card adm-skeleton" aria-hidden="true" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="panel-lux rounded-2xl p-12 text-center">
          <p className="text-sm font-bold text-wine-950">محصولی با این فیلتر پیدا نشد.</p>
          <p className="mt-2 text-[0.78rem] leading-7 text-mocha">
            جستجو یا دسته‌بندی را تغییر دهید؛ تصویر هر محصول جدیدی که در بخش «محصولات» ساخته شود،
            همین‌جا قابل مدیریت است.
          </p>
        </div>
      ) : (
        <ul className="adm-images-grid">
          {products.map((product) => (
            <ProductImageCard
              key={product.id}
              product={product}
              images={byProduct.get(product.id) ?? []}
              busy={busy || state.phase === 'error'}
              onUpload={(mode) => setDialog({ product, mode })}
              onDelete={setDeleting}
              onEdit={setEditing}
              onPreview={setPreview}
              onPromote={async (image) => {
                try {
                  await setPrimaryProductImage(image);
                  flashSaved();
                } catch {
                  /* the banner above already says what went wrong */
                }
              }}
            />
          ))}
        </ul>
      )}

      <p className="mt-6 max-w-2xl text-[0.7rem] leading-6 text-mocha">
        {connected
          ? 'تصویر اصلی همان تصویری است که در کارت محصول، صفحهٔ جزئیات، سبد خرید و صفحهٔ پرداخت نمایش داده می‌شود؛ انتخاب آن مستقیماً در دیتابیس ثبت می‌شود.'
          : 'در حالت نمایشی، تغییرات فقط در همین مرورگر اعمال می‌شوند و پس از اتصال Supabase، تصویرها از دیتابیس خوانده می‌شوند.'}
      </p>

      {dialog && (
        <UploadDialog
          key={`${dialog.product.id}-${dialog.mode}`}
          product={dialog.product}
          mode={dialog.mode}
          primary={(byProduct.get(dialog.product.id) ?? []).find((image) => image.isPrimary)}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            flashSaved();
          }}
        />
      )}

      {deleting && (
        <DeleteDialog
          image={deleting}
          product={catalog.find((product) => product.id === deleting.productId)}
          siblings={byProduct.get(deleting.productId) ?? []}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            flashSaved();
          }}
        />
      )}

      {editing && (
        <AltDialog
          image={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            flashSaved();
          }}
        />
      )}

      {preview && (
        <PreviewDialog
          image={preview}
          product={catalog.find((product) => product.id === preview.productId)}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

/**
 * One spoken label per thumbnail action. «تصویر اصلی» names the photo
 * the shop shows; the others are numbered, so a screen reader (and any
 * automation) always knows exactly which photo a control acts on.
 */
function thumbLabel(product: Product, image: ProductImage, index: number, action: string): string {
  const which = image.isPrimary
    ? 'اصلی'
    : `شمارهٔ ${toPersianDigits(index + 1)}`;
  return `${action} ${which} ${product.shortName}`;
}

/* ══ one product card ════════════════════════════════════════ */

function ProductImageCard({
  product,
  images,
  busy,
  onUpload,
  onDelete,
  onEdit,
  onPreview,
  onPromote,
}: {
  product: Product;
  images: ProductImage[];
  busy: boolean;
  onUpload: (mode: 'add' | 'replace') => void;
  onDelete: (image: ProductImage) => void;
  onEdit: (image: ProductImage) => void;
  onPreview: (image: ProductImage) => void;
  onPromote: (image: ProductImage) => Promise<void>;
}) {
  const flavor = getFlavor(product.flavorId);
  const primary = images.find((image) => image.isPrimary);
  const variant = product.variants[0];
  const [promoting, setPromoting] = useState<string | null>(null);

  const promote = async (image: ProductImage) => {
    setPromoting(image.id);
    try {
      await onPromote(image);
    } finally {
      setPromoting(null);
    }
  };

  return (
    <li className="adm-image-card panel-lux rounded-2xl">
      <div className="adm-image-card-head">
        <button
          type="button"
          onClick={() => primary && onPreview(primary)}
          disabled={!primary}
          className="adm-image-frame"
          aria-label={primary ? `پیش‌نمایش بزرگ تصویر ${product.name}` : 'تصویری بارگذاری نشده است'}
        >
          <ProductVisual
            reportFailure
            color={flavor.color}
            emoji={flavor.emoji}
            name={product.name}
            imageUrl={primary?.storefrontUrl}
            className="h-full w-full rounded-xl"
            emojiClassName="text-3xl"
            compact
          />
          {primary ? (
            <span className="adm-image-frame-hint">
              <IconEye className="h-3.5 w-3.5" />
              پیش‌نمایش
            </span>
          ) : (
            <span className="adm-image-frame-empty">بدون تصویر</span>
          )}
        </button>

        <div className="adm-image-details min-w-0 flex-1">
          <p className="truncate text-[0.9rem] font-extrabold text-wine-950" title={product.name}>
            {product.name}
          </p>
          <p className="mt-1 truncate text-[0.7rem] text-mocha">
            {product.categoryLabel} · طعم <span className="font-bold text-espresso">{flavor.name}</span>
            {variant ? (
              <>
                {' · '}
                <span dir="ltr">{variant.sku}</span>
              </>
            ) : null}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={cn('adm-badge', primary ? 'adm-badge-ok' : 'adm-badge-warning')}>
              {primary ? 'تصویر اصلی دارد' : 'بدون تصویر اصلی'}
            </span>
            <span className="adm-badge adm-badge-ghost">
              {toPersianDigits(images.length)} تصویر
            </span>
            {primary?.source === 'legacy' && (
              <span className="adm-badge adm-badge-ghost" title="فایل این تصویر در پوشهٔ public/images خود سایت است">
                فایل سایت
              </span>
            )}
          </div>

          <p className="adm-image-meta" dir="ltr">{product.id}</p>
          {primary && <p className="adm-image-meta">
            {primary.width ? `${toPersianDigits(primary.width)} × ${toPersianDigits(primary.height ?? 0)} پیکسل` : 'تصویر فعلی محصول'}
            {primary.sizeBytes > 0 ? ` · ${formatBytes(primary.sizeBytes)}` : ''}
          </p>}
          <div className="adm-image-main-actions mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onUpload('add')}
              disabled={busy}
              className="btn-lux btn-wine !px-3.5 !py-2 text-[0.74rem]"
            >
              <IconUpload className="h-4 w-4" />
              بارگذاری تصویر
            </button>
            <button
              type="button"
              onClick={() => onUpload('replace')}
              disabled={busy || !primary}
              className="adm-btn-sm"
              title={primary ? 'بارگذاری تصویر جدید به‌جای تصویر اصلی' : 'ابتدا یک تصویر بارگذاری کنید'}
            >
              جایگزینی تصویر اصلی
            </button>
          </div>
        </div>
      </div>

      {images.length > 0 && (
        <div className="adm-image-strip">
          <span className="adm-image-strip-label">گالری این محصول</span>
          <ul className="adm-thumbs">
            {images.map((image, index) => (
              <li key={image.id} className={cn('adm-thumb', image.isPrimary && 'is-primary')}>
                <button
                  type="button"
                  onClick={() => onPreview(image)}
                  className="adm-thumb-image"
                  aria-label={thumbLabel(product, image, index, 'پیش‌نمایش')}
                >
                  <ProductVisual
            reportFailure
                    color={flavor.color}
                    emoji={flavor.emoji}
                    name={image.altText || product.name}
                    imageUrl={image.storefrontUrl}
                    className="h-full w-full"
                    emojiClassName="text-lg"
                    compact
                  />
                  {image.isPrimary && (
                    <span className="adm-thumb-flag">
                      <IconStar className="h-3 w-3" />
                      اصلی
                    </span>
                  )}
                </button>
                <div className="adm-thumb-actions">
                  {!image.isPrimary && (
                    <button
                      type="button"
                      onClick={() => void promote(image)}
                      disabled={busy || promoting !== null || Boolean(image.virtual && isImagesConnected())}
                      className="adm-thumb-action"
                      title="انتخاب به‌عنوان تصویر اصلی محصول"
                      aria-label={thumbLabel(product, image, index, 'انتخاب به‌عنوان تصویر اصلی')}
                    >
                      {promoting === image.id ? <IconRefresh className="h-3.5 w-3.5 adm-spin" /> : <IconStar className="h-3.5 w-3.5" />}<span>اصلی شود</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onEdit(image)}
                    disabled={busy || Boolean(image.virtual && !image.id.startsWith('local-') && !image.id.startsWith('legacy:'))}
                    className="adm-thumb-action"
                    title="ویرایش توضیح تصویر"
                    aria-label={thumbLabel(product, image, index, 'ویرایش توضیح')}
                  >
                    <IconPencil className="h-3.5 w-3.5" /><span>توضیح</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(image)}
                    disabled={busy || Boolean(image.virtual && isImagesConnected())}
                    className="adm-thumb-action adm-thumb-action-danger"
                    title="حذف تصویر"
                    aria-label={thumbLabel(product, image, index, 'حذف تصویر')}
                  >
                    <IconTrash className="h-3.5 w-3.5" /><span>حذف</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/* ══ upload / replace dialog ═════════════════════════════════ */

type UploadStep = 'pick' | 'preparing' | 'ready' | 'sending' | 'error';

function UploadDialog({
  product,
  mode,
  primary,
  onClose,
  onSaved,
}: {
  product: Product;
  mode: 'add' | 'replace';
  primary?: ProductImage;
  onClose: () => void;
  onSaved: () => void;
}) {
  const flavor = getFlavor(product.flavorId);
  const connected = isImagesConnected();
  const inputRef = useRef<HTMLInputElement>(null);

  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [step, setStep] = useState<UploadStep>('pick');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [altText, setAltText] = useState(primary?.altText || product.shortName || product.name);
  const [makePrimary, setMakePrimary] = useState(mode === 'replace' || !primary);
  const [replacePrevious, setReplacePrevious] = useState(mode === 'replace' && Boolean(primary));
  const preparation = useRef(0);
  const submitting = useRef(false);
  useEffect(() => () => { preparation.current++; }, []);
  const acceptedTypes = ACCEPTED_IMAGE_TYPES.join(', ');

  /** validate + prepare, so the preview shows the exact bytes to be sent */
  const accept = async (file: File | undefined | null) => {
    if (!file || submitting.current) return;
    const version = ++preparation.current;
    setPrepared(null);
    setStep('preparing');
    setError(null);
    try {
      const next = await prepareProductImage(file, connected ? undefined : { maxEdge: 900 });
      if (version !== preparation.current) return;
      setPrepared(next);
      if (!altText.trim()) setAltText(product.shortName || product.name);
      setStep('ready');
    } catch (err) {
      if (version !== preparation.current) return;
      setPrepared(null);
      setError(toUserMessage(err, 'آماده‌سازی تصویر'));
      setStep('error');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void accept(event.target.files?.[0]);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void accept(event.dataTransfer?.files?.[0]);
  };

  const submit = async () => {
    if (submitting.current || step === 'preparing') return;
    if (!prepared) {
      setError('ابتدا یک تصویر انتخاب کنید تا پیش‌نمایش آن را ببینید.');
      setStep('error');
      return;
    }
    submitting.current = true;
    setStep('sending');
    setError(null);
    try {
      await uploadProductImage({
        productId: product.id,
        prepared,
        altText,
        makePrimary,
        expectedUrl: product.imageUrl ?? null,
        replaceImageId: primary?.id,
        // Only an uploaded Storage object can really be removed; a
        // committed public/images file always stays in the gallery.
        replacePrevious: makePrimary && replacePrevious && Boolean(primary) && primary?.source === 'upload',
      });
      onSaved();
    } catch (err) {
      setError(toUserMessage(err, 'بارگذاری تصویر'));
      setStep('error');
    } finally { submitting.current = false; }
  };

  const legacyPrimary = Boolean(primary && primary.source !== 'upload');

  return (
    <Modal
      title={mode === 'replace' ? `جایگزینی تصویر «${product.shortName}»` : `بارگذاری تصویر «${product.shortName}»`}
      onClose={step === 'sending' ? () => undefined : onClose}
    >
      <fieldset className="min-w-0 space-y-4" disabled={step === 'sending'}>
        {/* product context — the manager always sees what they are editing */}
        <div className="adm-upload-context">
          <ProductVisual
            reportFailure
            color={flavor.color}
            emoji={flavor.emoji}
            name={product.name}
            imageUrl={primary?.storefrontUrl}
            className="h-12 w-12 shrink-0 rounded-xl ring-1 ring-espresso/10"
            emojiClassName="text-xl"
            compact
          />
          <div className="min-w-0">
            <p className="truncate text-[0.82rem] font-bold text-espresso">{product.name}</p>
            <p className="mt-0.5 truncate text-[0.68rem] text-mocha">
              {product.categoryLabel} · طعم {flavor.name}
            </p>
          </div>
        </div>

        {/* the single hidden picker — the dropzone label and «انتخاب
            تصویر دیگر» both drive it, so it is never unmounted */}
        <input
          ref={inputRef}
          type="file"
          accept={acceptedTypes}
          onChange={onFileChange}
          disabled={step === 'sending'}
          className="sr-only"
          id="product-image-file"
          data-testid="product-image-file"
        />

        {/* dropzone / preview */}
        {!prepared ? (
          <div
            className={cn('adm-dropzone', dragging && 'is-dragging', step === 'preparing' && 'is-busy')}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className="adm-dropzone-icon">
              <IconUpload className="h-6 w-6" />
            </span>
            <p className="mt-3 text-[0.84rem] font-extrabold text-wine-950">
              {step === 'preparing' ? 'در حال آماده‌سازی تصویر…' : 'تصویر را اینجا رها کنید'}
            </p>
            <p className="mt-1.5 text-[0.7rem] leading-6 text-mocha">
              یا از دکمهٔ زیر انتخاب کنید — پیش از ذخیره، پیش‌نمایش دقیق همان چیزی را می‌بینید که بارگذاری می‌شود.
            </p>
            <label htmlFor="product-image-file" className="btn-lux btn-line-dark mt-3.5 rounded-xl !px-4 !py-2 text-[0.76rem]">
              انتخاب تصویر
            </label>
            <p className="mt-3 text-[0.64rem] leading-5 text-mocha-light">
              قالب‌های مجاز: <span dir="ltr">jpg, png, webp, avif, gif</span> — حداکثر {formatBytes(MAX_IMAGE_BYTES)}
            </p>
          </div>
        ) : (
          <div className="adm-preview">
            <div className="adm-preview-frame">
              <img src={prepared.dataUrl} alt="پیش‌نمایش تصویری که بارگذاری می‌شود" />
            </div>
            <dl className="adm-preview-meta">
              <div>
                <dt>فایل انتخابی</dt>
                <dd dir="ltr" className="truncate" title={prepared.originalName}>
                  {prepared.originalName}
                </dd>
              </div>
              <div>
                <dt>حجم اصلی</dt>
                <dd>
                  {formatBytes(prepared.originalBytes)}
                  {prepared.optimized && (
                    <span className="adm-preview-arrow"> ← {formatBytes(prepared.bytes)}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>ابعاد ذخیره‌شده</dt>
                <dd dir="ltr">
                  {prepared.width ? `${toPersianDigits(prepared.width)}×${toPersianDigits(prepared.height)}` : '—'}
                </dd>
              </div>
              <div>
                <dt>قالب</dt>
                <dd dir="ltr">{prepared.mime.replace('image/', '').toUpperCase()}</dd>
              </div>
            </dl>
            {prepared.optimized && (
              <p className="adm-preview-note">
                <IconCheck className="h-3.5 w-3.5" />
                تصویر برای فروشگاه بهینه شد؛ کیفیت در اندازهٔ نمایش کارت‌ها تغییری نمی‌کند.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={step === 'sending'}
                className="adm-btn-sm"
              >
                انتخاب تصویر دیگر
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrepared(null);
                  setStep('pick');
                  setError(null);
                }}
                disabled={step === 'sending'}
                className="adm-btn-sm"
              >
                حذف پیش‌نمایش
              </button>
            </div>
          </div>
        )}

        {/* alt text */}
        <Field
          label="توضیح تصویر (متن جایگزین)"
          hint="توضیح عکس در گالری و پیش‌نمایش؛ کوتاه و فارسی بنویسید."
        >
          <input
            className="adm-input"
            value={altText}
            maxLength={200}
            onChange={(event) => setAltText(event.target.value)}
            placeholder={`مثلاً ${product.shortName} ژینو`}
            disabled={step === 'sending'}
          />
        </Field>

        {/* what should happen after the upload */}
        <div className="adm-upload-options">
          <div className="adm-upload-option">
            <div>
              <p>تصویر اصلی محصول شود</p>
              <small>همین تصویر در کارت محصول، صفحهٔ جزئیات، سبد خرید و صفحهٔ پرداخت نمایش داده می‌شود.</small>
            </div>
            <Toggle
              checked={makePrimary}
              onChange={(value) => {
                setMakePrimary(value);
                setReplacePrevious(value && mode === 'replace');
              }}
              label="تصویر اصلی محصول شود"
            />
          </div>

          {primary && makePrimary && (
            <div className="adm-upload-option">
              <div>
                <p>تصویر قبلی حذف شود</p>
                <small>
                  {legacyPrimary
                    ? 'تصویر فعلی از فایل‌های خود سایت است؛ حذف نمی‌شود و در گالری باقی می‌ماند.'
                    : 'تصویر فعلی پس از بارگذاری موفق، برای همیشه از فضای ذخیره‌سازی حذف می‌شود.'}
                </small>
              </div>
              <Toggle
                checked={replacePrevious && !legacyPrimary}
                onChange={setReplacePrevious}
                label="تصویر قبلی حذف شود"
              />
            </div>
          )}
        </div>

        {!connected && (
          <p className="adm-note-demo">
            حالت نمایشی: تصویر فقط در حافظهٔ همین مرورگر ذخیره می‌شود و به فروشگاه واقعی نمی‌رسد.
          </p>
        )}

        {error && (
          <div className="adm-banner adm-banner-error" role="alert">
            <IconAlert className="h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {step === 'sending' && (
          <div className="adm-activity" role="status" aria-live="polite">
            <span className="adm-progress" aria-hidden="true">
              <span className="adm-progress-bar" />
            </span>
            <span>
              {connected ? 'در حال بارگذاری در فضای ذخیره‌سازی و ثبت در دیتابیس' : 'در حال ذخیره در همین مرورگر'}…
            </span>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!prepared || step === 'sending' || step === 'preparing'}
            className="btn-lux btn-wine flex-1 rounded-xl"
          >
            {step === 'sending' ? 'در حال بارگذاری…' : mode === 'replace' ? 'ذخیره و جایگزینی' : 'ذخیره و بارگذاری'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={step === 'sending'}
            className="btn-lux btn-line-dark rounded-xl"
          >
            انصراف
          </button>
        </div>
      </fieldset>
    </Modal>
  );
}

/* ══ delete confirmation ═════════════════════════════════════ */

function DeleteDialog({
  image,
  product,
  siblings,
  onClose,
  onDeleted,
}: {
  image: ProductImage;
  product?: Product;
  siblings: ProductImage[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const flavor = product ? getFlavor(product.flavorId) : null;
  const [confirmed, setConfirmed] = useState(false);
  const [allowEmpty, setAllowEmpty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const others = siblings.filter((row) => row.id !== image.id);
  const nextPrimary = others[0];
  const removesFile = image.source === 'upload' && !image.virtual;

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteProductImage(image, allowEmpty);
      onDeleted();
    } catch (err) {
      setError(toUserMessage(err, 'حذف تصویر'));
      setBusy(false);
    }
  };

  return (
    <Modal title="حذف تصویر" onClose={busy ? () => undefined : onClose}>
      <div className="space-y-4">
        <div className="adm-upload-context">
          <ProductVisual
            reportFailure
            color={flavor?.color ?? 'var(--color-wine-800)'}
            emoji={flavor?.emoji ?? '🍮'}
            name={image.altText || product?.name || 'تصویر'}
            imageUrl={image.storefrontUrl}
            className="h-16 w-16 shrink-0 rounded-xl ring-1 ring-espresso/10"
            emojiClassName="text-2xl"
            compact
          />
          <div className="min-w-0">
            <p className="truncate text-[0.84rem] font-bold text-espresso">
              {product?.name ?? image.altText}
            </p>
            <p className="mt-0.5 truncate text-[0.68rem] text-mocha">
              {flavor ? `${product?.categoryLabel} · طعم ${flavor.name}` : ''}
              {image.isPrimary ? ' · تصویر اصلی' : ''}
            </p>
          </div>
        </div>

        <ul className="adm-delete-list">
          <li>
            {removesFile
              ? 'فایل این تصویر برای همیشه از فضای ذخیره‌سازی Supabase حذف می‌شود و قابل بازگردانی نیست.'
              : 'این تصویر از فایل‌های خود سایت است؛ فایل آن در مخزن دست‌نخورده می‌ماند و فقط از گالری برداشته می‌شود.'}
          </li>
          {image.isPrimary && (
            <li>
              {nextPrimary
                ? `این تصویر، تصویر اصلی محصول است؛ پس از حذف، تصویر «${nextPrimary.altText || 'بعدی'}» جای آن را در فروشگاه می‌گیرد.`
                : 'این تصویر، تصویر اصلی محصول است؛ پس از حذف، فروشگاه تصویر طعم (نقش برجستهٔ ژله) را نمایش می‌دهد.'}
            </li>
          )}
          <li>سفارش‌ها، سبد خرید و قیمت‌ها دست‌نخورده می‌مانند.</li>
        </ul>

        {!nextPrimary && <label className="adm-confirm-row">
          <input type="checkbox" checked={allowEmpty} onChange={e => setAllowEmpty(e.target.checked)} disabled={busy} />
          <span>این آخرین تصویر است؛ تأیید می‌کنم محصول موقتاً بدون عکس نمایش داده شود.</span>
        </label>}
        <label className="adm-confirm-row">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={busy}
          />
          <span>
            می‌دانم این حذف با تأیید من انجام می‌شود و {removesFile ? 'فایل تصویر برای همیشه پاک می‌شود' : 'تصویر از گالری برداشته می‌شود'}.
          </span>
        </label>

        {error && (
          <div className="adm-banner adm-banner-error" role="alert">
            <IconAlert className="h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {busy && (
          <div className="adm-activity" role="status" aria-live="polite">
            <span className="adm-progress" aria-hidden="true">
              <span className="adm-progress-bar" />
            </span>
            <span>در حال حذف تصویر…</span>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => void remove()}
            disabled={!confirmed || busy || (!nextPrimary && !allowEmpty)}
            className="btn-lux btn-danger flex-1 rounded-xl"
          >
            {busy ? 'در حال حذف…' : 'حذف قطعی تصویر'}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="btn-lux btn-line-dark rounded-xl">
            انصراف
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ══ alt text ════════════════════════════════════════════════ */

function AltDialog({
  image,
  onClose,
  onSaved,
}: {
  image: ProductImage;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [altText, setAltText] = useState(image.altText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateProductImageAlt(image, altText);
      onSaved();
    } catch (err) {
      setError(toUserMessage(err, 'ویرایش توضیح تصویر'));
      setBusy(false);
    }
  };

  return (
    <Modal title="توضیح تصویر" onClose={busy ? () => undefined : onClose}>
      <div className="space-y-4">
        <Field
          label="متن جایگزین (فارسی)"
          hint="برای توضیح عکس در گالری و صفحه‌خوان‌ها؛ حداکثر ۲۰۰ نویسه."
          error={error ?? undefined}
        >
          <input
            className={cn('adm-input', error && 'err')}
            value={altText}
            maxLength={200}
            onChange={(event) => setAltText(event.target.value)}
            disabled={busy}
          />
        </Field>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={() => void save()} disabled={busy} className="btn-lux btn-wine flex-1 rounded-xl">
            {busy ? 'در حال ذخیره…' : 'ذخیره'}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="btn-lux btn-line-dark rounded-xl">
            انصراف
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ══ full-size preview ═══════════════════════════════════════ */

function PreviewDialog({
  image,
  product,
  onClose,
}: {
  image: ProductImage;
  product?: Product;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const flavor = product ? getFlavor(product.flavorId) : null;

  return (
    <div className="adm-lightbox" role="dialog" aria-modal="true" aria-label="پیش‌نمایش بزرگ تصویر">
      <button type="button" aria-label="بستن پیش‌نمایش" onClick={onClose} className="adm-lightbox-backdrop" />
      <figure className="adm-lightbox-body">
        <div className="adm-lightbox-frame">
          <ProductVisual
            reportFailure
            color={flavor?.color ?? 'var(--color-wine-800)'}
            emoji={flavor?.emoji ?? '🍮'}
            name={image.altText || product?.name || 'تصویر محصول'}
            imageUrl={image.storefrontUrl}
            className="h-full w-full"
            emojiClassName="text-7xl"
            eager
          />
        </div>
        <figcaption>
          <p className="text-[0.86rem] font-extrabold text-wine-950">
            {product?.name ?? image.altText}
            {image.isPrimary && <span className="adm-badge adm-badge-ok ms-2">تصویر اصلی</span>}
          </p>
          <p className="mt-1.5 text-[0.7rem] leading-6 text-mocha">
            {image.altText ? `توضیح: ${image.altText}` : 'توضیحی ثبت نشده است.'}
          </p>
          <p className="mt-1 text-[0.64rem] leading-5 text-mocha-light">
            {image.width ? `${toPersianDigits(image.width)}×${toPersianDigits(image.height ?? 0)} پیکسل · ` : ''}
            {image.sizeBytes > 0 ? `${formatBytes(image.sizeBytes)} · ` : ''}
            {image.source === 'upload' ? 'بارگذاری‌شده در فضای ذخیره‌سازی' : image.bucket === 'external' ? 'تصویر با نشانی خارجی' : 'فایل موجود سایت'}
            {image.createdAt ? ` · ${formatDateTime(image.createdAt)}` : ''}
          </p>
        </figcaption>
        <button type="button" onClick={onClose} className="adm-lightbox-close" aria-label="بستن">
          <IconClose className="h-4 w-4" />
        </button>
      </figure>
    </div>
  );
}
