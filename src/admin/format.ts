// ============================================================
// ZHINO — admin formatting helpers
// ============================================================

/** Persian-calendar date, e.g. «۱۰ شهریور ۱۴۰۵» */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Persian-calendar date + time, e.g. «۱۰ شهریور ۱۴۵، ۰۹:۴۱» */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fa-IR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
