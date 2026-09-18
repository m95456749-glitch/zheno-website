// ============================================================
// ZHINO — shared Supabase sync for settings, content and recipes
//
// These tables already exist in the initial schema and have public
// read/admin-write RLS policies. This module keeps their database
// snapshot separate from the localStorage fallback, just like the
// catalog and order sync layers. No service key is ever used here.
// ============================================================

import { useSyncExternalStore } from 'react';
import type { Recipe } from '../data/recipes';
import type { SiteContent } from './siteContent';
import type { SiteSettings } from './settings';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';

export interface RemoteSiteData {
  settings?: SiteSettings;
  content: Partial<SiteContent>;
  recipes: Recipe[];
  /** recipe id → database active flag */
  recipeActive: Record<string, boolean>;
  loadedAt: string;
}

export type SiteDataPhase = 'offline' | 'loading' | 'ready' | 'syncing' | 'error';

export interface SiteDataSyncState {
  source: 'local' | 'remote';
  phase: SiteDataPhase;
  pending: number;
  error: string | null;
  lastSyncedAt: string | null;
}

const configured = isSupabaseConfigured();
let snapshot: RemoteSiteData | null = null;
let pending = 0;
let started = false;

let state: SiteDataSyncState = {
  source: configured ? 'remote' : 'local',
  phase: configured ? 'loading' : 'offline',
  pending: 0,
  error: null,
  lastSyncedAt: null,
};

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setState(patch: Partial<SiteDataSyncState>): void {
  state = { ...state, ...patch };
  emit();
}

function describe(error: { message?: string; details?: string | null; hint?: string | null; code?: string }): string {
  return [error.message, error.details, error.hint, error.code ? `(${error.code})` : '']
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ') || 'خطای ناشناخته';
}

function asNonNegativeInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function readSettingsRow(row: unknown): SiteSettings | undefined {
  if (!row || typeof row !== 'object') return undefined;
  const r = row as Record<string, unknown>;
  const freeShippingThreshold = asNonNegativeInt(r.free_shipping_threshold);
  const standardShippingCost = asNonNegativeInt(r.standard_shipping_cost);
  const expressShippingCost = asNonNegativeInt(r.express_shipping_cost);
  const lowStockThreshold = asNonNegativeInt(r.low_stock_threshold);
  if (
    freeShippingThreshold === null ||
    standardShippingCost === null ||
    expressShippingCost === null ||
    lowStockThreshold === null
  ) {
    return undefined;
  }
  return { freeShippingThreshold, standardShippingCost, expressShippingCost, lowStockThreshold };
}

function readRecipeRow(row: unknown): { recipe: Recipe; active: boolean } | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (
    typeof r.id !== 'string' ||
    typeof r.title !== 'string' ||
    typeof r.summary !== 'string' ||
    (r.category !== 'jelly' && r.category !== 'custard') ||
    typeof r.emoji !== 'string' ||
    !Array.isArray(r.ingredients) ||
    !r.ingredients.every((value) => typeof value === 'string') ||
    !Array.isArray(r.steps) ||
    !r.steps.every((value) => typeof value === 'string')
  ) {
    return null;
  }
  return {
    recipe: {
      id: r.id,
      title: r.title,
      summary: r.summary,
      category: r.category,
      emoji: r.emoji,
      ingredients: r.ingredients,
      steps: r.steps,
    },
    active: r.active === true,
  };
}

/** Latest database snapshot, or null until the first successful read. */
export function getRemoteSiteData(): RemoteSiteData | null {
  return snapshot;
}

export function getSiteDataSyncState(): SiteDataSyncState {
  return state;
}

export function subscribeSiteDataSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A shared subscription makes storefront pages update after an admin save. */
export function useRemoteSiteData(): RemoteSiteData | null {
  return useSyncExternalStore(subscribeSiteDataSync, getRemoteSiteData);
}

export function useSiteDataSync(): SiteDataSyncState {
  return useSyncExternalStore(subscribeSiteDataSync, getSiteDataSyncState);
}

/** Fetch all non-sensitive site-management data under the current JWT. */
export async function refreshSiteData(options: { silent?: boolean } = {}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    snapshot = null;
    setState({ source: 'local', phase: 'offline', pending: 0, error: null, lastSyncedAt: null });
    return;
  }

  if (!options.silent) setState({ phase: snapshot ? 'syncing' : 'loading' });

  try {
    const [settingsRes, contentRes, recipesRes] = await Promise.all([
      supabase
        .from('site_settings')
        .select('id,free_shipping_threshold,standard_shipping_cost,express_shipping_cost,low_stock_threshold')
        .eq('id', 'default')
        .maybeSingle(),
      supabase.from('site_content').select('key,value,published'),
      supabase.from('recipes').select('id,title,summary,category,ingredients,steps,emoji,active').order('id'),
    ]);

    if (settingsRes.error) throw new Error(`خواندن تنظیمات ناموفق بود: ${describe(settingsRes.error)}`);
    if (contentRes.error) throw new Error(`خواندن محتوای سایت ناموفق بود: ${describe(contentRes.error)}`);
    if (recipesRes.error) throw new Error(`خواندن دستورها ناموفق بود: ${describe(recipesRes.error)}`);

    const content: Partial<SiteContent> = {};
    for (const row of (contentRes.data ?? []) as unknown as Array<Record<string, unknown>>) {
      if (typeof row.key === 'string' && typeof row.value === 'string') {
        content[row.key as keyof SiteContent] = row.value;
      }
    }

    const recipes: Recipe[] = [];
    const recipeActive: Record<string, boolean> = {};
    for (const row of recipesRes.data ?? []) {
      const parsed = readRecipeRow(row);
      if (parsed) {
        recipes.push(parsed.recipe);
        recipeActive[parsed.recipe.id] = parsed.active;
      }
    }

    snapshot = {
      settings: readSettingsRow(settingsRes.data),
      content,
      recipes,
      recipeActive,
      loadedAt: new Date().toISOString(),
    };
    setState({ source: 'remote', phase: pending > 0 ? 'syncing' : 'ready', error: null, lastSyncedAt: snapshot.loadedAt });
  } catch (error) {
    setState({
      source: 'remote',
      phase: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Run a write, then replace the optimistic/local view with database truth. */
export function runRemoteSiteWrite(label: string, write: () => Promise<void>): void {
  pending += 1;
  setState({ source: 'remote', phase: 'syncing', pending, error: null });

  void (async () => {
    let failure: string | null = null;
    try {
      await write();
    } catch (error) {
      failure = `${label} — ${error instanceof Error ? error.message : String(error)}`;
    }
    await refreshSiteData({ silent: true });
    pending = Math.max(0, pending - 1);
    setState({
      source: 'remote',
      phase: failure ? 'error' : pending > 0 ? 'syncing' : 'ready',
      pending,
      error: failure,
    });
  })();
}

async function requireSupabase() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase پیکربندی نشده است.');
  return supabase;
}

export async function pushRemoteSettings(settings: SiteSettings): Promise<void> {
  const supabase = await requireSupabase();
  const { error } = await supabase.from('site_settings').upsert(
    {
      id: 'default',
      free_shipping_threshold: settings.freeShippingThreshold,
      standard_shipping_cost: settings.standardShippingCost,
      express_shipping_cost: settings.expressShippingCost,
      low_stock_threshold: settings.lowStockThreshold,
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(describe(error));
}

export async function pushRemoteContent(content: SiteContent): Promise<void> {
  const supabase = await requireSupabase();
  const rows = Object.entries(content).map(([key, value]) => ({ key, value, published: true }));
  const { error } = await supabase.from('site_content').upsert(rows, { onConflict: 'key' });
  if (error) throw new Error(describe(error));
}

/**
 * Generic public key/value write, used by the assistant voice settings.
 * These are plain published site_content rows — the exact same table and
 * RLS the storefront content editor already writes to (admin-only writes,
 * public reads). Nothing secret may ever be stored through this helper:
 * the rows are readable by every visitor by design.
 */
export async function pushRemoteVoiceSettings(rows: Record<string, string>): Promise<void> {
  const supabase = await requireSupabase();
  const payload = Object.entries(rows).map(([key, value]) => ({ key, value, published: true }));
  const { error } = await supabase.from('site_content').upsert(payload, { onConflict: 'key' });
  if (error) throw new Error(describe(error));
}

export async function pushRemoteRecipe(recipe: Recipe, active = true): Promise<void> {
  const supabase = await requireSupabase();
  const { error } = await supabase.from('recipes').upsert(
    {
      id: recipe.id,
      title: recipe.title,
      summary: recipe.summary,
      category: recipe.category,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      emoji: recipe.emoji,
      active,
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(describe(error));
}

export async function setRemoteRecipeActive(id: string, active: boolean): Promise<void> {
  const supabase = await requireSupabase();
  const { error } = await supabase.from('recipes').update({ active }).eq('id', id);
  if (error) throw new Error(describe(error));
}

/** Reset is non-destructive: official recipes are upserted; additions are hidden. */
export async function resetRemoteRecipes(defaults: Recipe[]): Promise<void> {
  const supabase = await requireSupabase();
  const { error: defaultsError } = await supabase.from('recipes').upsert(
    defaults.map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      summary: recipe.summary,
      category: recipe.category,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      emoji: recipe.emoji,
      active: true,
    })),
    { onConflict: 'id' },
  );
  if (defaultsError) throw new Error(describe(defaultsError));

  const extraIds = (snapshot?.recipes ?? []).map((recipe) => recipe.id).filter((id) => !defaults.some((r) => r.id === id));
  if (extraIds.length > 0) {
    const { error } = await supabase.from('recipes').update({ active: false }).in('id', extraIds);
    if (error) throw new Error(describe(error));
  }
}

/** Start once at app boot and refresh when an admin session changes. */
export function startSiteDataSync(): void {
  const supabase = getSupabase();
  if (!supabase || started) return;
  started = true;
  void refreshSiteData();
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      void refreshSiteData({ silent: true });
    }
  });
}
