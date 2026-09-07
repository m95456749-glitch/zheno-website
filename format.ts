// ============================================================
// ZHINO — Formatting Utilities
// ============================================================

/**
 * Format a price number to Persian-style currency string
 */
export function formatPrice(price: number): string {
  return price.toLocaleString('fa-IR') + ' تومان';
}

/**
 * Format number with Persian locale
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('fa-IR');
}

/**
 * Convert Latin digits to Persian digits
 */
export function toPersianDigits(str: string | number): string {
  return String(str).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
}
