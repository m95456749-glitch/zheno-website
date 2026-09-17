// ============================================================
// ZHINO — site content (admin-editable text, storefront-consumed)
//
// Only strings the site ALREADY shows are editable. Defaults are
// the exact current strings, so the storefront renders
// identically until an admin changes a value.
//
// Supabase is the primary connected source; localStorage remains the
// deliberate offline/demo fallback.
// ============================================================

import { useMemo } from 'react';
import { createLocalStore, useLocalStore } from './localStore';
import {
  getRemoteSiteData,
  pushRemoteContent,
  runRemoteSiteWrite,
  useRemoteSiteData,
} from './siteDataSync';
import { getSupabase } from './supabaseClient';

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

/** Current content (database snapshot when connected, otherwise local overlay). */
export function getSiteContent(): SiteContent {
  const remote = getRemoteSiteData();
  return remote ? { ...DEFAULT_SITE_CONTENT, ...remote.content } : { ...DEFAULT_SITE_CONTENT, ...store.get() };
}

export function saveSiteContent(next: SiteContent): void {
  if (getSupabase()) {
    runRemoteSiteWrite('ذخیره محتوای سایت', () => pushRemoteContent(next));
    return;
  }

  const overlay: ContentOverlay = {};
  for (const key of Object.keys(DEFAULT_SITE_CONTENT) as (keyof SiteContent)[]) {
    if (next[key] !== DEFAULT_SITE_CONTENT[key]) overlay[key] = next[key];
  }
  store.set(overlay);
}

/** Discard changes without deleting database rows. */
export function resetSiteContent(): void {
  if (getSupabase()) {
    runRemoteSiteWrite('بازنشانی محتوای سایت', () => pushRemoteContent(DEFAULT_SITE_CONTENT));
    return;
  }
  store.reset();
}

/** React binding used by storefront pages that must see a remote save immediately. */
export function useSiteContent(): SiteContent {
  const local = useLocalStore(store);
  const remote = useRemoteSiteData();
  return useMemo(
    () => (remote ? { ...DEFAULT_SITE_CONTENT, ...remote.content } : { ...DEFAULT_SITE_CONTENT, ...local }),
    [local, remote],
  );
}
