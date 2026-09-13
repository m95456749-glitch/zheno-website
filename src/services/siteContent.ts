// ============================================================
// ZHINO — site content service
// ============================================================
// Public content is read from Supabase when configured. The original strings
// remain the no-credentials fallback so the storefront always renders.

import { useEffect, useSyncExternalStore } from 'react';
import { createLocalStore, useLocalStore } from './localStore';
import { isSupabaseConfigured } from './supabase/client';
import { fetchRemoteContent, saveRemoteContent } from './supabase/repository';

export interface SiteContent {
  aboutLead: string;
  contactLead: string;
  recipesLead: string;
  footerCopyright: string;
  footerTagline: string;
}

export const DEFAULT_SITE_CONTENT: SiteContent = {
  aboutLead: 'ژینو با یک باور ساده شروع شد: دسر خوب، حق هر خانواده است. امروز با هر طعمی که انتخاب می‌کنید، بخشی از همین باور سر سفره‌ی شما می‌نشیند.',
  contactLead: 'سؤال، پیشنهاد یا انتقادی دارید؟ از طریق فرم زیر برای ما بنویسید؛ در ساعات کاری پاسخ می‌دهیم.',
  recipesLead: 'دستور رسمی آماده‌سازی ژله و کاستر ژینو — ساده، سریع و دقیق.',
  footerCopyright: 'تمامی حقوق محفوظ است.',
  footerTagline: 'Quality, The ZHINO Way',
};

type ContentOverlay = Partial<SiteContent>;

function sanitize(raw: unknown): ContentOverlay | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const out: ContentOverlay = {};
  for (const key of Object.keys(DEFAULT_SITE_CONTENT) as Array<keyof SiteContent>) {
    if (typeof value[key] === 'string') out[key] = value[key] as string;
  }
  return out;
}

const store = createLocalStore<ContentOverlay>('zhino_admin_content_v1', {}, sanitize);
let remoteContent: ContentOverlay | null = null;
let remoteAttempted = false;
const remoteListeners = new Set<() => void>();

function notifyRemoteContent() {
  remoteListeners.forEach((listener) => listener());
}

export async function hydrateSiteContentFromSupabase(force = false): Promise<void> {
  if (!isSupabaseConfigured() || (remoteAttempted && !force)) return;
  remoteAttempted = true;
  try {
    remoteContent = await fetchRemoteContent();
  } catch (error) {
    remoteContent = null;
    if (import.meta.env.DEV) console.warn('[zhino] Supabase content unavailable; using bundled copy.', error);
  }
  notifyRemoteContent();
}

export function getSiteContent(): SiteContent {
  return { ...DEFAULT_SITE_CONTENT, ...(remoteContent ?? (isSupabaseConfigured() ? {} : store.get())) };
}

export async function saveSiteContent(next: SiteContent): Promise<void> {
  if (isSupabaseConfigured()) {
    await saveRemoteContent(next);
    await hydrateSiteContentFromSupabase(true);
    return;
  }
  const overlay: ContentOverlay = {};
  for (const key of Object.keys(DEFAULT_SITE_CONTENT) as Array<keyof SiteContent>) {
    if (next[key] !== DEFAULT_SITE_CONTENT[key]) overlay[key] = next[key];
  }
  store.set(overlay);
}

export function resetSiteContent(): void {
  if (isSupabaseConfigured()) {
    void hydrateSiteContentFromSupabase(true);
    return;
  }
  store.reset();
}

export function useSiteContent(): SiteContent {
  const local = useLocalStore(store);
  const remote = useSyncExternalStore(
    (listener) => {
      remoteListeners.add(listener);
      return () => remoteListeners.delete(listener);
    },
    () => remoteContent,
    () => null,
  );
  useEffect(() => {
    void hydrateSiteContentFromSupabase();
  }, []);
  return { ...DEFAULT_SITE_CONTENT, ...(remote ?? (isSupabaseConfigured() ? {} : local)) };
}
