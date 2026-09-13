// ============================================================
// ZHINO — recipe service
// ============================================================
// Supabase is used when configured; bundled recipes remain the safe public
// fallback until a project is migrated. The admin UI talks only to this
// module, never to localStorage or Supabase directly.

import { useEffect, useSyncExternalStore } from 'react';
import { RECIPES } from '../data/recipes';
import type { Recipe } from '../data/recipes';
import { createLocalStore, useLocalStore } from './localStore';
import { isSupabaseConfigured } from './supabase/client';
import { fetchRemoteRecipes, removeRemoteRecipe, saveRemoteRecipe } from './supabase/repository';

interface RecipeOverlay {
  overrides: Record<string, Recipe>;
  additions: Recipe[];
  removed: string[];
}
const EMPTY_OVERLAY: RecipeOverlay = { overrides: {}, additions: [], removed: [] };

function isRecipe(value: unknown): value is Recipe {
  if (typeof value !== 'object' || value === null) return false;
  const recipe = value as Recipe;
  return (
    typeof recipe.id === 'string' &&
    typeof recipe.title === 'string' &&
    typeof recipe.summary === 'string' &&
    (recipe.category === 'jelly' || recipe.category === 'custard') &&
    typeof recipe.emoji === 'string' &&
    Array.isArray(recipe.ingredients) && recipe.ingredients.every((item) => typeof item === 'string') &&
    Array.isArray(recipe.steps) && recipe.steps.every((item) => typeof item === 'string')
  );
}

function sanitize(raw: unknown): RecipeOverlay | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const overrides: Record<string, Recipe> = {};
  if (typeof value.overrides === 'object' && value.overrides && value.overrides !== null) {
    for (const [id, recipe] of Object.entries(value.overrides as Record<string, unknown>)) {
      if (id && isRecipe(recipe)) overrides[id] = recipe;
    }
  }
  const additions = Array.isArray(value.additions) ? (value.additions as unknown[]).filter(isRecipe) : [];
  const removed = Array.isArray(value.removed)
    ? (value.removed as unknown[]).filter((item): item is string => typeof item === 'string')
    : [];
  return { overrides, additions, removed };
}

const store = createLocalStore<RecipeOverlay>('zhino_admin_recipes_v1', EMPTY_OVERLAY, sanitize);
let cachedOverlay: RecipeOverlay | null = null;
let cachedList: Recipe[] = [];
let remoteRecipes: Recipe[] | null = null;
let remoteAttempted = false;
const remoteListeners = new Set<() => void>();

function mergedList(overlay: RecipeOverlay): Recipe[] {
  if (cachedOverlay === overlay) return cachedList;
  const list: Recipe[] = [];
  for (const base of RECIPES) {
    if (!overlay.removed.includes(base.id)) list.push(overlay.overrides[base.id] ?? base);
  }
  for (const added of overlay.additions) {
    if (!list.some((recipe) => recipe.id === added.id)) list.push(added);
  }
  cachedOverlay = overlay;
  cachedList = list;
  return list;
}

function notifyRemoteRecipes() {
  remoteListeners.forEach((listener) => listener());
}

export async function hydrateRecipesFromSupabase(force = false): Promise<void> {
  if (!isSupabaseConfigured() || (remoteAttempted && !force)) return;
  remoteAttempted = true;
  try {
    remoteRecipes = await fetchRemoteRecipes(false);
  } catch (error) {
    remoteRecipes = null;
    if (import.meta.env.DEV) console.warn('[zhino] Supabase recipes unavailable; using bundled data.', error);
  }
  notifyRemoteRecipes();
}

export function getActiveRecipes(): Recipe[] {
  return remoteRecipes ?? (isSupabaseConfigured() ? RECIPES : mergedList(store.get()));
}

export async function upsertRecipe(recipe: Recipe): Promise<void> {
  if (isSupabaseConfigured()) {
    await saveRemoteRecipe(recipe);
    await hydrateRecipesFromSupabase(true);
    return;
  }
  const overlay = store.get();
  const isBase = RECIPES.some((item) => item.id === recipe.id);
  const additions = overlay.additions.filter((item) => item.id !== recipe.id);
  if (isBase) {
    store.set({
      overrides: { ...overlay.overrides, [recipe.id]: recipe },
      additions,
      removed: overlay.removed.filter((id) => id !== recipe.id),
    });
  } else {
    store.set({ overrides: overlay.overrides, additions: [...additions, recipe], removed: overlay.removed });
  }
}

export async function removeRecipe(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    await removeRemoteRecipe(id);
    await hydrateRecipesFromSupabase(true);
    return;
  }
  const overlay = store.get();
  const overrides = { ...overlay.overrides };
  delete overrides[id];
  store.set({
    overrides,
    additions: overlay.additions.filter((recipe) => recipe.id !== id),
    removed: overlay.removed.includes(id) ? overlay.removed : [...overlay.removed, id],
  });
}

export function resetRecipes(): void {
  if (isSupabaseConfigured()) {
    void hydrateRecipesFromSupabase(true);
    return;
  }
  store.reset();
}

export function useActiveRecipes(): Recipe[] {
  const overlay = useLocalStore(store);
  const remote = useSyncExternalStore(
    (listener) => {
      remoteListeners.add(listener);
      return () => remoteListeners.delete(listener);
    },
    () => remoteRecipes,
    () => null,
  );
  useEffect(() => {
    void hydrateRecipesFromSupabase();
  }, []);
  return remote ?? (isSupabaseConfigured() ? RECIPES : mergedList(overlay));
}
