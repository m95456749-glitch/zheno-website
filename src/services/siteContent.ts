// ============================================================
// ZHINO — site content (admin-editable text, storefront-consumed)
//
// Only strings the site ALREADY shows are editable. Defaults are
// the exact current strings, so the storefront renders
// identically until an admin changes a value.
//
// Future backend: saveSiteContent/resetSettings become API calls.
// ============================================================

import { createLocalStore } from './localStore';

export interface SiteContent {
  /** About page — story lead paragraph */
  aboutLead: string;
  /** Contact page — lead paragraph */
  contactLead: string;
  /** Recipes page — lead paragraph */
  recipesLead: string;
  /** Footer — copyright line after «© year ژینو —» */
  footerCopyright: string;
  /** Footer — latin tagline */
  footerTagline: string;
}

export const DEFAULT_SITE_CONTENT: SiteContent = {
  aboutLead:
    'ژینو با یک باور ساده شروع شد: دسر خوب، حق هر خانواده است. امروز با هر طعمی که انتخاب می‌کنید، بخشی از همین باور سر سفره‌ی شما می‌نشیند.',
  contactLead:
    'سؤال، پیشنهاد یا انتقادی دارید؟ از طریق فرم زیر برای ما بنویسید؛ در ساعات کاری پاسخ می‌دهیم.',
  recipesLead: 'دستور رسمی آماده‌سازی ژله و کاستر ژینو — ساده، سریع و دقیق.',
  footerCopyright: 'تمامی حقوق محفوظ است.',
  footerTagline: 'Quality, The ZHINO Way',
};

type ContentOverlay = Partial<SiteContent>;

function sanitize(raw: unknown): ContentOverlay | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const out: ContentOverlay = {};
  for (const key of Object.keys(DEFAULT_SITE_CONTENT) as (keyof SiteContent)[]) {
    if (typeof r[key] === 'string') out[key] = r[key] as string;
  }
  return out;
}

const store = createLocalStore<ContentOverlay>('zhino_admin_content_v1', {}, sanitize);

/** Current content (defaults + any admin override). Cheap — safe in render. */
export function getSiteContent(): SiteContent {
  return { ...DEFAULT_SITE_CONTENT, ...store.get() };
}

export function saveSiteContent(next: SiteContent): void {
  const overlay: ContentOverlay = {};
  for (const key of Object.keys(DEFAULT_SITE_CONTENT) as (keyof SiteContent)[]) {
    if (next[key] !== DEFAULT_SITE_CONTENT[key]) overlay[key] = next[key];
  }
  store.set(overlay);
}

/** Discard every content change (back to the original strings). */
export function resetSiteContent(): void {
  store.reset();
}
