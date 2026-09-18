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

for (const path of ['/admin/products?view=prices', '/admin/products?view=images']) {
  mustInclude('src/admin/pages/AdminDashboardPage.tsx', path, `direct product focus: ${path}`);
}

// The redesigned panel home is seven independent, side-by-side section
// cards (icon + short title + one-line description + a round button) —
// never a crowded icon grid again.
for (const label of ['محصولات', 'سفارش‌ها', 'ربات ژینو', 'تنظیمات', 'موجودی', 'دستور تهیه', 'محتوای سایت']) {
  mustInclude('src/admin/pages/AdminDashboardPage.tsx', `label: '${label}'`, `dashboard section card: ${label}`);
}
mustInclude('src/admin/pages/AdminDashboardPage.tsx', 'adm-card-action', 'dashboard card round button');
mustInclude('src/admin/admin.css', '.adm-card-grid', 'dashboard card grid style');
mustInclude('src/admin/pages/AdminAssistantPage.tsx', 'Accordion', 'assistant settings stay in collapsible groups');

for (const path of ['/admin/dashboard', '/admin/products', '/admin/orders', '/admin/inventory', '/admin/recipes', '/admin/site-content', '/admin/settings']) {
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

if (failures > 0) {
  console.error(`\n${failures} admin contract check(s) failed.`);
  process.exit(1);
}
console.log('\nAll admin contract checks passed.');
