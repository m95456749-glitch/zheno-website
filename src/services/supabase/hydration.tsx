// ============================================================
// ZHINO — optional Supabase bootstrap
// ============================================================
// Hydration is deliberately best-effort: no project variables means no
// network request, and a missing/unmigrated project never white-screens the
// existing storefront. The service modules remain the only data consumers.

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { isSupabaseConfigured } from './client';
import { hydrateCatalogFromSupabase } from '../catalog';
import { hydrateRecipesFromSupabase } from '../recipeStore';
import { hydrateSiteContentFromSupabase } from '../siteContent';
import { hydrateSettingsFromSupabase } from '../settings';

export async function hydratePublicSupabaseData(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await Promise.all([
    hydrateCatalogFromSupabase(),
    hydrateRecipesFromSupabase(),
    hydrateSiteContentFromSupabase(),
    hydrateSettingsFromSupabase(),
  ]);
}

/** Re-renders the existing route tree after optional public data arrives. */
export function SupabaseBootstrap({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void hydratePublicSupabaseData().finally(() => setVersion((version) => version + 1));
  }, []);
  return <Fragment key={version}>{children}</Fragment>;
}
