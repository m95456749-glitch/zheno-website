/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ENABLE_CHECKOUT?: string;
  readonly VITE_ENABLE_ACCOUNT?: string;
  /**
   * Supabase project URL (https://<ref>.supabase.co). Unset or empty =
   * frontend-only mode; no Supabase client is created and no request is
   * sent. Browser-side only — privileged access is never wired here.
   */
  readonly VITE_SUPABASE_URL?: string;
  /**
   * Supabase browser (anon / publishable) key, guarded by the project's RLS
   * policies. The service-role key has no place in this project: Vite
   * inlines every VITE_* value into the public bundle.
   */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /**
   * Admin panel authentication mode.
   * 'demo' (default) — no real auth; preview only (see
   * src/admin/auth/authService.ts). 'api' — requires
   * VITE_API_BASE_URL and talks to the backend's /admin/auth
   * endpoints.
   */
  readonly VITE_ADMIN_AUTH_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
