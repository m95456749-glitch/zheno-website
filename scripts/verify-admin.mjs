// ============================================================
// ZHINO — offline admin feature contract checks
//
// This is intentionally dependency-free. It catches accidental
// removal of the stage-three contracts in code review without
// connecting to Supabase or reading any credentials.
// ============================================================

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(new URL('.', import.meta.url).pathname, '..');
let failures = 0;
const pass = (message) => console.log(`PASS: ${message}`);
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  failures += 1;
};
const read = (file) => readFileSync(join(root, file), 'utf8');
const mustInclude = (file, needle, label) => {
  if (read(file).includes(needle)) pass(label);
  else fail(`${file} is missing ${label}`);
};

for (const file of [
  'src/admin/pages/AdminDashboardPage.tsx',
  'src/services/dashboardPreferences.ts',
  'src/services/siteDataSync.ts',
  'src/admin/pages/AdminInventoryPage.tsx',
]) {
  if (existsSync(join(root, file))) pass(`admin stage-three file exists: ${file}`);
  else fail(`admin stage-three file is missing: ${file}`);
}

// The six statistics cards were removed from the dashboard together with
// their (now effect-less) customization panel. Their identities stay
// contracted on the untouched preferences service so the cards can be
// restored later without re-inventing the ids.
for (const id of ['new-orders', 'preparing-orders', 'shipped-orders', 'completed-orders', 'sales', 'low-stock']) {
  mustInclude('src/services/dashboardPreferences.ts', `'${id}'`, `dashboard card contract: ${id}`);
}

// «قیمت‌ها» stays a focus view of the products page. «تصاویر محصولات»
// now has its own gallery section (upload / replace / delete / primary).
mustInclude('src/admin/pages/AdminDashboardPage.tsx', '/admin/products?view=prices', 'direct product focus: /admin/products?view=prices');
mustInclude('src/admin/pages/AdminDashboardPage.tsx', '/admin/product-images', 'direct product shortcut: /admin/product-images');

/* ── «تصاویر محصولات» — the product image gallery contract ── */

const IMAGES_MIGRATION = 'supabase/migrations/20260922000000_product_images_reliable_bootstrap.sql';
for (const file of [
  IMAGES_MIGRATION,
  'src/services/productImages.ts',
  'src/services/supabaseProductImages.ts',
  'src/utils/imageFile.ts',
  'src/admin/pages/AdminProductImagesPage.tsx',
]) {
  if (existsSync(join(root, file))) pass(`product images file exists: ${file}`);
  else fail(`product images file is missing: ${file}`);
}

// Route + navigation reachability
mustInclude('src/App.tsx', 'path="product-images"', 'admin route: product-images');
mustInclude('src/admin/nav.ts', "to: '/admin/product-images'", 'admin nav entry: تصاویر محصولات');
mustInclude('src/admin/nav.ts', "label: 'تصاویر محصولات'", 'admin nav label: تصاویر محصولات');

// Database side: gallery table, RLS, admin-only writes, Storage bucket
mustInclude(IMAGES_MIGRATION, 'create table if not exists public.product_images', 'product_images table');
mustInclude(IMAGES_MIGRATION, 'alter table public.product_images enable row level security', 'product_images RLS enabled');
mustInclude(IMAGES_MIGRATION, 'create policy image_insert_guard', 'product_images admin-only write policy');
mustInclude(IMAGES_MIGRATION, 'public.is_admin()', 'product_images policies use is_admin()');
mustInclude(IMAGES_MIGRATION, "insert into storage.buckets", 'product-images storage bucket');
mustInclude(IMAGES_MIGRATION, 'create policy product_images_storage_insert', 'storage insert policy');
mustInclude(IMAGES_MIGRATION, 'create policy product_images_storage_delete', 'storage delete policy');
mustInclude(IMAGES_MIGRATION, 'set_primary_product_image', 'atomic primary-image RPC');
mustInclude(IMAGES_MIGRATION, 'image_url = i.storefront_url', 'primary image is mirrored into products.image_url');
mustInclude(IMAGES_MIGRATION, "'legacy',true", 'existing site photos are registered as legacy');
// Partial/unknown installations fail closed. Valid reruns preserve all data: the
// registration INSERT is guarded so a product that already has gallery
// rows is skipped (un-guarded re-runs tripped the one-primary-per-product
// partial unique index and aborted the whole statement).
mustInclude(IMAGES_MIGRATION, 'if p_url is not null and btrim(p_url)', 'legacy re-registration is guarded (idempotent re-apply)');

// PostgreSQL comments are whitespace, not SQL. Preserve quoted strings,
// identifiers and dollar bodies so comment markers inside them cannot swallow
// subsequent executable statements. PostgreSQL block comments may be nested.
function withoutSqlComments(sql) {
  let result = '', i = 0;
  while (i < sql.length) {
    if (sql.startsWith('--', i)) {
      result += ' '; i += 2;
      while (i < sql.length && sql[i] !== '\n' && sql[i] !== '\r') i++;
    } else if (sql.startsWith('/*', i)) {
      result += ' '; i += 2; let depth = 1;
      while (i < sql.length && depth) {
        if (sql.startsWith('/*', i)) { depth++; i += 2; }
        else if (sql.startsWith('*/', i)) { depth--; i += 2; }
        else { if (sql[i] === '\n' || sql[i] === '\r') result += sql[i]; i++; }
      }
      if (depth) throw new Error('Unterminated SQL block comment in admin contract check');
    } else if (sql[i] === "'" || sql[i] === '"') {
      const start = i, quote = sql[i++];
      const escaped = quote === "'" && /[eE]/.test(sql[start - 1] ?? '')
        && (start < 2 || !/[A-Za-z0-9_$]/.test(sql[start - 2]));
      let closed = false;
      while (i < sql.length) {
        if (escaped && sql[i] === '\\') { i += 2; continue; }
        if (sql[i++] !== quote) continue;
        if (sql[i] === quote) { i++; continue; }
        closed = true; break;
      }
      if (!closed) throw new Error('Unterminated SQL quote in admin contract check');
      result += sql.slice(start, i);
    } else if (sql[i] === '$' && /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.test(sql.slice(i))) {
      const tag = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)[0];
      const end = sql.indexOf(tag, i + tag.length);
      if (end < 0) throw new Error('Unterminated SQL dollar quote in admin contract check');
      result += sql.slice(i, end + tag.length); i = end + tag.length;
    } else result += sql[i++];
  }
  return result;
}

// Keep the existing UPDATE assertion and body treatment unchanged; only add
// comment-aware preprocessing. Regressions prove real UPDATEs remain visible.
const hasProductUpdate = sql => /update\s+public\.products(?!\s+set\s+image_url)/i.test(
  withoutSqlComments(sql).replace(/\$\$[\s\S]*?\$\$/g, ''),
);
for (const [label, sql, expected] of [
  ['documented prohibition is not SQL', '-- Reconciliation ONLY. Never UPDATE public.products during migration.', false],
  ['block documentation is not SQL', '/* UPDATE public.products SET name=\'x\'; */ select 1;', false],
  ['nested PostgreSQL comments', '/* outer /* nested */ UPDATE public.products SET name=\'x\'; */ select 1;', false],
  ['real product UPDATE still rejected', "UPDATE public.products SET name='x';", true],
  ['inline comment preserves token boundary', "UPDATE/* note */public.products SET name='x';", true],
  ['UPDATE following a line comment', "-- documentation\nUPDATE public.products SET name='x';", true],
  ['CR line endings', "-- documentation\rUPDATE public.products SET name='x';", true],
  ['URL marker cannot hide real SQL', "SELECT 'https://example.invalid/a--b'; UPDATE public.products SET name='x';", true],
  ['quoted block marker cannot hide real SQL', "SELECT '/*'; UPDATE public.products SET name='x'; -- */", true],
  ['quoted identifier cannot hide real SQL', 'SELECT "column--name"; UPDATE public.products SET name=\'x\';', true],
  ['comment dollar markers cannot hide real SQL', "-- $$\nUPDATE public.products SET name='x';\n-- $$", true],
  ['existing runtime body treatment preserved', "CREATE FUNCTION example() RETURNS void LANGUAGE plpgsql AS $$ BEGIN UPDATE public.products SET name='x'; END $$;", false],
]) {
  if (hasProductUpdate(sql) === expected) pass(`SQL comment parser: ${label}`);
  else fail(`SQL comment parser regression: ${label}`);
}

// The migration must not rewrite what the storefront already reads
const imagesMigration = read(IMAGES_MIGRATION);
if (!hasProductUpdate(imagesMigration)) {
  pass('migration body never rewrites products rows outside the RPC');
} else {
  fail('migration must not update products rows outside set_primary_product_image()');
}

// Client side: the storefront keeps reading the ONE field it always read
mustInclude('src/services/supabaseProductImages.ts', 'manage_product_image', 'promotion goes through the database RPC');
mustInclude('src/services/productImages.ts', 'products.image_url', 'gallery documents the storefront contract');
mustInclude('supabase/migrations/20260922000000_product_images_reliable_bootstrap.sql', "i.source = 'upload'", 'only uploaded Storage objects are ever removed');
mustInclude('src/utils/responsiveImages.ts', 'isAbsoluteUrl', 'absolute (Storage/data) image URLs bypass the site base');
mustInclude('src/utils/imageFile.ts', 'MAX_IMAGE_BYTES', 'upload size limit is enforced in the browser too');
mustInclude('src/utils/imageFile.ts', 'ACCEPTED_IMAGE_TYPES', 'upload type allowlist is enforced in the browser too');

// UI: preview before saving, explicit confirmation, primary selection
mustInclude('src/admin/pages/AdminProductImagesPage.tsx', 'prepareProductImage', 'the dialog previews the exact bytes it will send');
mustInclude('src/admin/pages/AdminProductImagesPage.tsx', 'حذف قطعی تصویر', 'deletion asks for an explicit confirmation');
mustInclude('src/admin/pages/AdminProductImagesPage.tsx', 'تصویر اصلی محصول شود', 'primary image can be chosen while uploading');
mustInclude('src/admin/pages/AdminProductImagesPage.tsx', 'جایگزینی تصویر اصلی', 'replacing the current photo is a first-class action');
mustInclude('src/admin/pages/AdminProductImagesPage.tsx', 'پیش‌نمایش', 'the manager sees a preview');
mustInclude('src/admin/admin.css', '.adm-images-grid', 'gallery layout style');

// The redesigned panel home is seven independent, side-by-side section
// cards (icon + short title + one-line description + a round button) —
// never a crowded icon grid again.
for (const label of ['محصولات', 'سفارش‌ها', 'ربات ژینو', 'تنظیمات', 'موجودی', 'دستور تهیه', 'محتوای سایت']) {
  mustInclude('src/admin/pages/AdminDashboardPage.tsx', `label: '${label}'`, `dashboard section card: ${label}`);
}
mustInclude('src/admin/pages/AdminDashboardPage.tsx', 'adm-card-action', 'dashboard card round button');
mustInclude('src/admin/admin.css', '.adm-card-grid', 'dashboard card grid style');
mustInclude('src/admin/pages/AdminAssistantPage.tsx', 'Accordion', 'assistant settings stay in collapsible groups');

for (const path of ['/admin/dashboard', '/admin/products', '/admin/product-images', '/admin/orders', '/admin/inventory', '/admin/recipes', '/admin/site-content', '/admin/settings']) {
  mustInclude('src/admin/nav.ts', `to: '${path}'`, `admin route: ${path}`);
}

mustInclude('src/services/siteDataSync.ts', "from('recipes')", 'remote recipes read');
mustInclude('src/services/siteDataSync.ts', "from('site_content')", 'remote content read');
mustInclude('src/services/siteDataSync.ts', "from('site_settings')", 'remote settings read');
mustInclude('src/services/supabaseCatalog.ts', "'adjust_inventory'", 'atomic inventory adjustment RPC');
mustInclude('src/admin/pages/AdminInventoryPage.tsx', 'کاهش یک عدد', 'inventory decrement control');
mustInclude('src/admin/pages/AdminInventoryPage.tsx', 'افزایش یک عدد', 'inventory increment control');
mustInclude('src/admin/pages/AdminProductsPage.tsx', 'Number.isSafeInteger(price)', 'price validation');
mustInclude('src/admin/pages/AdminProductsPage.tsx', 'فقط مسیر images/', 'safe product image path validation');
mustInclude('src/admin/pages/AdminInventoryPage.tsx', 'Number.isSafeInteger(n)', 'inventory validation');

const migration = read('supabase/migrations/20260912000000_initial_schema.sql');
for (const policy of ['recipes_admin_write', 'content_admin_write', 'settings_admin_write', 'orders_admin_read']) {
  if (migration.includes(`create policy ${policy}`)) pass(`RLS policy present: ${policy}`);
  else fail(`RLS policy missing: ${policy}`);
}


for (const text of ['image_conflict', 'replacement_requires_primary', 'last_product_image', 'as restrictive', 'product_image_cleanup', 'for update']) {
  mustInclude('supabase/migrations/20260922000000_product_images_reliable_bootstrap.sql', text, `image safety v3: ${text}`);
}

if (failures > 0) {
  console.error(`\n${failures} admin contract check(s) failed.`);
  process.exit(1);
}
console.log('\nAll admin contract checks passed.');
