// ============================================================
// ZHINO — admin: inventory
// One source of truth: the same variant stock the storefront's
// cart/checkout logic uses (via src/services/catalog.ts).
// No second inventory system — only the existing stock field.
// UI: a single editable list; the number itself is the control.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { setVariantStock, useCatalog } from '../../services/catalog';
import { getSettings } from '../../services/settings';
import { getFlavor } from '../../data/products';
import { SavedFlash } from '../components/ui';
import { cn } from '../../utils/cn';

function stockState(stock: number, lowThreshold: number) {
  if (stock === 0) return { label: 'اتمام موجودی', cls: 'adm-badge-cancelled' };
  if (stock <= lowThreshold) return { label: 'کم‌موجود', cls: 'adm-badge-warning' };
  return { label: 'موجود', cls: 'adm-badge-ok' };
}

function StockInput({
  value,
  onSave,
  label,
}: {
  value: number;
  onSave: (next: number) => void;
  label: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = () => {
    const n = Math.floor(Number(text));
    if (Number.isFinite(n) && n >= 0 && n !== value) onSave(n);
    else setText(String(value));
  };

  return (
    <input
      type="number"
      min={0}
      dir="ltr"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      aria-label={label}
      className="adm-input adm-stock-input"
    />
  );
}

export default function AdminInventoryPage() {
  const catalog = useCatalog();
  const settings = getSettings();
  const [savedId, setSavedId] = useState<string | null>(null);

  const rows = useMemo(
    () => catalog.flatMap((product) => product.variants.map((variant) => ({ product, variant }))),
    [catalog],
  );

  const save = (productId: string, variantId: string, stock: number) => {
    setVariantStock(productId, variantId, stock);
    const key = `${productId}__${variantId}`;
    setSavedId(key);
    window.setTimeout(() => setSavedId((cur) => (cur === key ? null : cur)), 1800);
  };

  return (
    <div>
      <SavedFlash show={savedId !== null} />

      {/* desktop table */}
      <div className="panel-lux hidden overflow-hidden rounded-2xl md:block">
        <table className="adm-table w-full">
          <thead>
            <tr>
              <th className="adm-th">محصول</th>
              <th className="adm-th">SKU / وزن</th>
              <th className="adm-th">موجودی</th>
              <th className="adm-th">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ product, variant }) => {
              const flavor = getFlavor(product.flavorId);
              const state = stockState(variant.stock, settings.lowStockThreshold);
              return (
                <tr key={`${product.id}__${variant.id}`} className="adm-row">
                  <td className="adm-td">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base ring-1 ring-espresso/8"
                        style={{ backgroundColor: `${flavor.color}1f` }}
                        aria-hidden="true"
                      >
                        {flavor.emoji}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[0.82rem] font-bold text-espresso">{product.shortName}</p>
                        <p className="mt-0.5 text-[0.66rem] text-mocha">{product.categoryLabel}</p>
                      </div>
                    </div>
                  </td>
                  <td className="adm-td">
                    <p dir="ltr" className="text-right text-[0.72rem] text-mocha">{variant.sku}</p>
                    <p className="text-[0.72rem] text-mocha">{variant.weight}</p>
                  </td>
                  <td className="adm-td">
                    <StockInput
                      value={variant.stock}
                      onSave={(n) => save(product.id, variant.id, n)}
                      label={`موجودی ${product.shortName}`}
                    />
                  </td>
                  <td className="adm-td">
                    <span className={cn('adm-badge', state.cls)}>{state.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <ul className="space-y-3 md:hidden">
        {rows.map(({ product, variant }) => {
          const flavor = getFlavor(product.flavorId);
          const state = stockState(variant.stock, settings.lowStockThreshold);
          return (
            <li key={`${product.id}__${variant.id}`} className="panel-lux rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg ring-1 ring-espresso/8"
                    style={{ backgroundColor: `${flavor.color}1f` }}
                    aria-hidden="true"
                  >
                    {flavor.emoji}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[0.85rem] font-bold text-espresso">{product.shortName}</p>
                    <p className="mt-0.5 text-[0.68rem] text-mocha">
                      {variant.weight} · <span dir="ltr">{variant.sku}</span>
                    </p>
                  </div>
                </div>
                <span className={cn('adm-badge shrink-0', state.cls)}>{state.label}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-espresso/8 pt-3">
                <span className="text-[0.72rem] font-bold text-mocha">موجودی (عدد)</span>
                <StockInput
                  value={variant.stock}
                  onSave={(n) => save(product.id, variant.id, n)}
                  label={`موجودی ${product.shortName}`}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 max-w-2xl text-[0.7rem] leading-6 text-mocha">
        عدد موجودی هر ردیف را تغییر دهید و بیرون از کادر کلیک کنید تا ذخیره شود. اگر موجودی از
        آستانه هشدار (تنظیمات) کمتر شود، وضعیت «کم‌موجود» نمایش داده می‌شود.
      </p>
    </div>
  );
}
