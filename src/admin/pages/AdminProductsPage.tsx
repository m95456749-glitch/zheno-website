// ============================================================
// ZHINO — admin: product management
// Add / edit / delete / activate products on the catalog
// overlay (src/services/catalog.ts). Existing ZHINO products
// and their data are the base and stay intact; «بازنشانی»
// restores them exactly.
// UI: one primary action («افزودن محصول»), a simple search +
// category filter, and small labeled «ویرایش» / «حذف» buttons.
// ============================================================

import { useMemo, useState } from 'react';
import { FLAVORS, getFlavor } from '../../data/products';
import type { FlavorId, Product, ProductCategory } from '../../types';
import {
  getCatalogMeta,
  removeProduct,
  resetCatalog,
  setProductActive,
  useCatalog,
  upsertProduct,
} from '../../services/catalog';
import { getSettings } from '../../services/settings';
import { formatNumber, formatPrice, toPersianDigits } from '../../utils/format';
import ProductVisual from '../../components/ProductVisual';
import { Field, Modal, SavedFlash, Toggle } from '../components/ui';
import { IconPlus, IconSearch } from '../Icons';
import { cn } from '../../utils/cn';

type CategoryFilter = 'all' | ProductCategory;

interface ProductFormState {
  name: string;
  shortName: string;
  category: ProductCategory;
  flavorId: FlavorId;
  weightGrams: string;
  price: string;
  stock: string;
  sku: string;
  imageUrl: string;
  active: boolean;
}

const EMPTY_FORM: ProductFormState = {
  name: '',
  shortName: '',
  category: 'jelly',
  flavorId: 'pomegranate',
  weightGrams: '250',
  price: '200000',
  stock: '50',
  sku: '',
  imageUrl: '',
  active: true,
};

export default function AdminProductsPage() {
  const catalog = useCatalog();
  const lowThreshold = getSettings().lowStockThreshold;

  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saved, setSaved] = useState(false);

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter(
      (p) =>
        (filter === 'all' || p.category === filter) &&
        (q === '' ||
          p.name.toLowerCase().includes(q) ||
          p.shortName.toLowerCase().includes(q) ||
          p.variants.some((v) => v.sku.toLowerCase().includes(q))),
    );
  }, [catalog, filter, query]);

  const openCreate = () => {
    setCreating(true);
    setEditing(null);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setCreating(false);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
  };

  const flashSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const doDelete = (product: Product) => {
    if (window.confirm(`محصول «${product.shortName}» حذف شود؟`)) {
      removeProduct(product.id);
      flashSaved();
    }
  };

  const stockTone = (stock: number) =>
    stock === 0 ? 'text-red-600' : stock <= lowThreshold ? 'text-gold-700' : 'text-espresso';

  return (
    <div>
      {/* toolbar — search, filter, one primary action */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:min-w-44">
          <IconSearch className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mocha-light" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی محصول…"
            className="adm-input ps-9"
            aria-label="جستجوی محصول"
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
        <button type="button" onClick={openCreate} className="btn-lux btn-wine !px-5 !py-2.5 text-[0.85rem]">
          <IconPlus className="h-4 w-4" />
          افزودن محصول
        </button>
      </div>

      <SavedFlash show={saved} />

      {products.length === 0 ? (
        <div className="panel-lux rounded-2xl p-12 text-center">
          <p className="text-sm font-bold text-wine-950">محصولی پیدا نشد.</p>
          <p className="mt-2 text-[0.78rem] leading-7 text-mocha">
            جستجو یا فیلتر را تغییر دهید، یا با دکمه «افزودن محصول» محصول جدیدی بسازید.
          </p>
        </div>
      ) : (
        <>
          {/* ── desktop table ─────────────────────────────── */}
          <div className="panel-lux hidden overflow-hidden rounded-2xl md:block">
            <table className="adm-table w-full">
              <thead>
                <tr>
                  <th className="adm-th">محصول</th>
                  <th className="adm-th">قیمت</th>
                  <th className="adm-th">موجودی</th>
                  <th className="adm-th">نمایش در فروشگاه</th>
                  <th className="adm-th"> </th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const variant = product.variants[0];
                  const meta = getCatalogMeta(product.id);
                  const flavor = getFlavor(product.flavorId);
                  return (
                    <tr key={product.id} className="adm-row">
                      <td className="adm-td">
                        <div className="flex items-center gap-3">
                          <ProductVisual
                            color={flavor.color}
                            emoji={flavor.emoji}
                            name={product.name}
                            imageUrl={product.imageUrl}
                            className="h-11 w-11 shrink-0 rounded-lg ring-1 ring-espresso/8"
                            emojiClassName="text-lg"
                            compact
                          />
                          <div className="min-w-0">
                            <p className="truncate text-[0.85rem] font-bold text-espresso">{product.name}</p>
                            <p className="mt-0.5 truncate text-[0.68rem] text-mocha">
                              {product.categoryLabel} · {flavor.name} ·{' '}
                              <span dir="ltr">{variant.sku}</span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="adm-td whitespace-nowrap text-[0.82rem] font-bold text-espresso">
                        {formatPrice(variant.price)}
                      </td>
                      <td className={cn('adm-td text-[0.85rem] font-extrabold', stockTone(variant.stock))}>
                        {formatNumber(variant.stock)}
                      </td>
                      <td className="adm-td">
                        <div className="flex items-center gap-2">
                          <Toggle
                            checked={meta.active}
                            onChange={(on) => {
                              setProductActive(product.id, on);
                              flashSaved();
                            }}
                            label={`نمایش ${product.shortName} در فروشگاه`}
                          />
                          {!meta.active && <span className="adm-badge adm-badge-cancelled">غیرفعال</span>}
                        </div>
                      </td>
                      <td className="adm-td">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(product)}
                            className="adm-btn-sm"
                          >
                            ویرایش
                          </button>
                          <button
                            type="button"
                            onClick={() => doDelete(product)}
                            className="adm-btn-sm adm-btn-sm-danger"
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── mobile cards ──────────────────────────────── */}
          <ul className="space-y-3 md:hidden">
            {products.map((product) => {
              const variant = product.variants[0];
              const meta = getCatalogMeta(product.id);
              const flavor = getFlavor(product.flavorId);
              return (
                <li key={product.id} className="panel-lux rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <ProductVisual
                      color={flavor.color}
                      emoji={flavor.emoji}
                      name={product.name}
                      imageUrl={product.imageUrl}
                      className="h-14 w-14 shrink-0 rounded-xl ring-1 ring-espresso/8"
                      emojiClassName="text-xl"
                      compact
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-espresso">{product.name}</p>
                      <p className="mt-0.5 truncate text-[0.7rem] text-mocha">
                        {product.categoryLabel} · {flavor.name}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm font-extrabold text-wine-900">{formatPrice(variant.price)}</span>
                        <span className={cn('text-[0.72rem] font-bold', stockTone(variant.stock))}>
                          موجودی: {formatNumber(variant.stock)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-espresso/8 pt-3">
                    <div className="flex items-center gap-2">
                      <Toggle
                        checked={meta.active}
                        onChange={(on) => {
                          setProductActive(product.id, on);
                          flashSaved();
                        }}
                        label={`نمایش ${product.shortName} در فروشگاه`}
                      />
                      {!meta.active && <span className="adm-badge adm-badge-cancelled">غیرفعال</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => openEdit(product)} className="adm-btn-sm">
                        ویرایش
                      </button>
                      <button
                        type="button"
                        onClick={() => doDelete(product)}
                        className="adm-btn-sm adm-btn-sm-danger"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* quiet secondary action */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[0.7rem] leading-6 text-mocha">
          تغییرات روی همان داده‌های فروشگاه اعمال می‌شوند (در این نسخه نمایشی: همین مرورگر).
        </p>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('همه تغییرات محصولات به داده‌های اولیه فروشگاه بازگردد؟')) {
              resetCatalog();
              flashSaved();
            }
          }}
          className="text-[0.72rem] font-bold text-mocha-light underline-offset-4 transition hover:text-wine-900 hover:underline"
        >
          بازنشانی داده‌های اولیه
        </button>
      </div>

      {(creating || editing) && (
        <ProductFormModal
          key={creating ? 'new' : editing?.id ?? 'edit'}
          product={editing}
          onClose={closeForm}
          onSaved={() => {
            closeForm();
            flashSaved();
          }}
        />
      )}
    </div>
  );
}

/* ── add / edit form ───────────────────────────────────────── */

function ProductFormModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ProductFormState>(() =>
    product
      ? {
          name: product.name,
          shortName: product.shortName,
          category: product.category,
          flavorId: product.flavorId,
          weightGrams: String(product.variants[0].weightGrams),
          price: String(product.variants[0].price),
          stock: String(product.variants[0].stock),
          sku: product.variants[0].sku,
          imageUrl: product.imageUrl ?? '',
          active: getCatalogMeta(product.id).active,
        }
      : { ...EMPTY_FORM },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const flavors = Object.values(FLAVORS).filter((f) => f.category === form.category);
  const set = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const changeCategory = (category: ProductCategory) => {
    const first = Object.values(FLAVORS).find((f) => f.category === category);
    setForm((f) => ({ ...f, category, flavorId: first ? first.id : f.flavorId }));
  };

  const submit = () => {
    const next: Record<string, string> = {};
    const price = Number(form.price);
    const weight = Number(form.weightGrams);
    const stock = Number(form.stock);
    if (form.name.trim().length < 3) next.name = 'نام محصول را کامل وارد کنید';
    if (!form.shortName.trim()) next.shortName = 'نام کوتاه را وارد کنید';
    if (!Number.isInteger(price) || price <= 0) next.price = 'قیمت صحیح وارد کنید (تومان)';
    if (!Number.isInteger(weight) || weight <= 0) next.weightGrams = 'وزن صحیح وارد کنید (گرم)';
    if (!Number.isInteger(stock) || stock < 0) next.stock = 'موجودی صحیح وارد کنید';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const id = product?.id ?? `custom-${Date.now().toString(36)}`;
    const variantId = product?.variants[0]?.id ?? `${id}-v1`;
    const sku =
      form.sku.trim() ||
      `Z${form.category === 'jelly' ? 'J' : 'C'}-${form.flavorId.slice(0, 3).toUpperCase()}-${weight}`;

    const nextProduct: Product = {
      id,
      category: form.category,
      flavorId: form.flavorId,
      name: form.name.trim(),
      shortName: form.shortName.trim(),
      categoryLabel: form.category === 'jelly' ? 'پودر ژله' : 'پودر کاستر',
      imageUrl: form.imageUrl.trim() ? form.imageUrl.trim().replace(/^\//, '') : undefined,
      featured: product?.featured,
      special: product?.special,
      variants: [
        {
          id: variantId,
          productId: id,
          weight: `${toPersianDigits(weight)} گرم`,
          weightGrams: weight,
          price,
          sku,
          stock,
          available: product ? product.variants[0].available : stock > 0,
        },
      ],
    };
    upsertProduct(nextProduct, form.active);
    onSaved();
  };

  const previewFlavor = getFlavor(form.flavorId);

  return (
    <Modal title={product ? 'ویرایش محصول' : 'افزودن محصول'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نام محصول" error={errors.name}>
            <input
              className={cn('adm-input', errors.name && 'err')}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="پودر ژله … ژینو"
            />
          </Field>
          <Field label="نام کوتاه" error={errors.shortName}>
            <input
              className={cn('adm-input', errors.shortName && 'err')}
              value={form.shortName}
              onChange={(e) => set('shortName', e.target.value)}
              placeholder="ژله انار"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="دسته‌بندی">
            <select
              className="adm-input"
              value={form.category}
              onChange={(e) => changeCategory(e.target.value as ProductCategory)}
            >
              <option value="jelly">پودر ژله</option>
              <option value="custard">پودر کاستر</option>
            </select>
          </Field>
          <Field label="طعم">
            <select
              className="adm-input"
              value={form.flavorId}
              onChange={(e) => set('flavorId', e.target.value as FlavorId)}
            >
              {flavors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.emoji} {f.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="وزن (گرم)" error={errors.weightGrams}>
            <input
              type="number"
              min={1}
              dir="ltr"
              className={cn('adm-input', errors.weightGrams && 'err')}
              value={form.weightGrams}
              onChange={(e) => set('weightGrams', e.target.value)}
            />
          </Field>
          <Field label="قیمت (تومان)" error={errors.price}>
            <input
              type="number"
              min={1000}
              step={1000}
              dir="ltr"
              className={cn('adm-input', errors.price && 'err')}
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
            />
          </Field>
          <Field label="موجودی" error={errors.stock}>
            <input
              type="number"
              min={0}
              dir="ltr"
              className={cn('adm-input', errors.stock && 'err')}
              value={form.stock}
              onChange={(e) => set('stock', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU" hint="خالی بگذارید تا خودکار ساخته شود (مثلاً ZJ-POM-250).">
            <input
              dir="ltr"
              className="adm-input"
              value={form.sku}
              onChange={(e) => set('sku', e.target.value)}
              placeholder="ZJ-POM-250"
            />
          </Field>
          <Field label="تصویر محصول" hint="مسیر فایل در پوشه public/ (مثلاً images/products/new.jpg).">
            <input
              dir="ltr"
              className="adm-input"
              value={form.imageUrl}
              onChange={(e) => set('imageUrl', e.target.value)}
              placeholder="images/products/new.jpg"
            />
          </Field>
        </div>

        {form.imageUrl.trim() && (
          <div className="flex items-center gap-3">
            <ProductVisual
              color={previewFlavor.color}
              emoji={previewFlavor.emoji}
              name="پیش‌نمایش تصویر"
              imageUrl={form.imageUrl.trim()}
              className="h-16 w-16 shrink-0 rounded-xl ring-1 ring-espresso/10"
              emojiClassName="text-2xl"
              compact
            />
            <p className="text-[0.7rem] leading-5 text-mocha-light">
              پیش‌نمایش تصویر — اگر فایل در public/ نباشد، جایگزین طعمی نمایش داده می‌شود.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl bg-cream-100 px-4 py-3">
          <div>
            <p className="text-[0.78rem] font-bold text-espresso">محصول فعال</p>
            <p className="mt-0.5 text-[0.68rem] leading-5 text-mocha">
              محصولات غیرفعال در فروشگاه نمایش داده نمی‌شوند.
            </p>
          </div>
          <Toggle checked={form.active} onChange={(v) => set('active', v)} label="فعال بودن محصول" />
        </div>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={submit} className="btn-lux btn-wine flex-1 rounded-xl">
            {product ? 'ذخیره تغییرات' : 'افزودن محصول'}
          </button>
          <button type="button" onClick={onClose} className="btn-lux btn-line-dark rounded-xl">
            انصراف
          </button>
        </div>
      </div>
    </Modal>
  );
}
