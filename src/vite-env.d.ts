/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ENABLE_CHECKOUT?: string;
  readonly VITE_ENABLE_ACCOUNT?: string;
  /** supabase (production), api (legacy backend), or demo (preview only). */
  readonly VITE_ADMIN_AUTH_MODE?: 'supabase' | 'api' | 'demo' | string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
