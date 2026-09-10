/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ENABLE_CHECKOUT?: string;
  readonly VITE_ENABLE_ACCOUNT?: string;
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
