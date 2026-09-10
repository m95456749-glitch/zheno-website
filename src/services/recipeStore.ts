// ============================================================
// ZHINO — recipe content (admin-editable, storefront-consumed)
//
// The base recipes (src/data/recipes.ts — the two official
// preparation methods) are the default. Admin edits are a
// localStorage overlay: per-recipe overrides, new recipes, and
// removals. Identical output until an admin changes something.
//
// Future backend: upsertRecipe/removeRecipe/resetRecipes become
// API calls; getActiveRecipes hydrates from the backend.
// ============================================================

import { RECIPES } from '../data/recipes';
import type { Recipe } from '../data/recipes';
import { createLocalStore, useLocalStore } from './localStore';

interface RecipeOverlay {
  /** full replacement of a base (or added) recipe */
  overrides: Record<string, Recipe>;
  /** recipes created in admin */
  additions: Recipe[];
  /** base recipe ids removed in admin */
  removed: string[];
}

const EMPTY_OVERLAY: RecipeOverlay = { overrides: {}, additions: [], removed: [] };

function isRecipe(value: unknown): value is Recipe {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Recipe;
  return (
    typeof r.id === 'string' &&
    typeof r.title === 'string' &&
    typeof r.summary === 'string' &&
    (r.category === 'jelly' || r.category === 'custard') &&
    typeof r.emoji === 'string' &&
    Array.isArray(r.ingredients) &&
    r.ingredients.every((x) => typeof x === 'string') &&
    Array.isArray(r.steps) &&
    r.steps.every((x) => typeof x === 'string')
  );
}

function sanitize(raw: unknown): RecipeOverlay | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const overrides: Record<string, Recipe> = {};
  if (typeof r.overrides === 'object' && r.overrides && r.overrides !== null) {
    for (const [id, value] of Object.entries(r.overrides as Record<string, unknown>)) {
      if (id && isRecipe(value)) overrides[id] = value;
    }
  }
  const additions = Array.isArray(r.additions)
    ? (r.additions as unknown[]).filter(isRecipe)
    : [];
  const removed = Array.isArray(r.removed)
    ? (r.removed as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  return { overrides, additions, removed };
}

const store = createLocalStore<RecipeOverlay>('zhino_admin_recipes_v1', EMPTY_OVERLAY, sanitize);

/* merge (cached per overlay version — stable refs for React) */
let cachedOverlay: RecipeOverlay | null = null;
let cachedList: Recipe[] = [];

function mergedList(overlay: RecipeOverlay): Recipe[] {
  if (cachedOverlay === overlay) return cachedList;
  const list: Recipe[] = [];
  for (const base of RECIPES) {
    if (overlay.removed.includes(base.id)) continue;
    list.push(overlay.overrides[base.id] ?? base);
  }
  for (const added of overlay.additions) {
    if (!list.some((r) => r.id === added.id)) list.push(added);
  }
  cachedOverlay = overlay;
  cachedList = list;
  return list;
}

/** Recipes shown by the site (base + admin changes). */
export function getActiveRecipes(): Recipe[] {
  return mergedList(store.get());
}

/** Edit an existing recipe or add a new one (same shape either way). */
export function upsertRecipe(recipe: Recipe): void {
  const overlay = store.get();
  const isBase = RECIPES.some((r) => r.id === recipe.id);
  const additions = overlay.additions.filter((r) => r.id !== recipe.id);
  if (isBase) {
    store.set({
      overrides: { ...overlay.overrides, [recipe.id]: recipe },
      additions,
      removed: overlay.removed.filter((id) => id !== recipe.id),
    });
  } else {
    store.set({
      overrides: overlay.overrides,
      additions: [...additions, recipe],
      removed: overlay.removed,
    });
  }
}

export function removeRecipe(id: string): void {
  const overlay = store.get();
  const overrides = { ...overlay.overrides };
  delete overrides[id];
  store.set({
    overrides,
    additions: overlay.additions.filter((r) => r.id !== id),
    removed: overlay.removed.includes(id) ? overlay.removed : [...overlay.removed, id],
  });
}

/** Discard every recipe change (back to the two official methods). */
export function resetRecipes(): void {
  store.reset();
}

/** Recipes as a hook (admin pages). */
export function useActiveRecipes(): Recipe[] {
  const overlay = useLocalStore(store);
  return mergedList(overlay);
}
