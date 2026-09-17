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
  /**
   * «دستیار ژینو» — آدرس کامل Endpoint هوش مصنوعی روی Backend خودمان
   * (مثلاً https://api.example.com/assistant/chat).
   *
   * خالی بماند → اگر Supabase پیکربندی شده باشد، از Supabase Edge
   * Function استفاده می‌شود (…/functions/v1/zhino-assistant) و در غیر
   * این صورت دستیار با موتور محلی فروشگاه پاسخ می‌دهد.
   *
   * ⚠️ اینجا فقط «آدرس» می‌آید. کلید مدل هوش مصنوعی هیچ‌وقت در
   * فرانت‌اند یا در فایل‌های محیطی VITE_* قرار نمی‌گیرد؛ کلید فقط در
   * Secrets سرور (Supabase Edge Function یا Backend) نگه داشته می‌شود.
   */
  readonly VITE_ASSISTANT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
