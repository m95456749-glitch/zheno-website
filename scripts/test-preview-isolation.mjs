// Build with public dummy endpoints to ensure BRANCH previews cannot inherit
// them, while the production branch still receives the configured values.
//
// Two Cloudflare build systems can build this repository and each one names the
// branch with a different variable:
//   • Workers Builds → WORKERS_CI=1 / WORKERS_CI_BRANCH
//   • Pages          → CF_PAGES=1   / CF_PAGES_BRANCH
// Both are exercised below. Every value used here is an obvious sentinel: no
// real project URL, key or endpoint is read, written or logged.
//
// The script finishes by rebuilding WITHOUT any sentinel, so `dist/` is never
// left pointing at the fake backend — running this test can therefore never be
// followed by an accidental `npm run deploy` of the sentinel bundle.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const SENTINEL = 'preview-isolation-sentinel';
const FAKE_PROJECT = SENTINEL.replace(/-/g, '_');

const inherited = {
  VITE_SUPABASE_URL: `https://${SENTINEL}.supabase.co`,
  VITE_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${FAKE_PROJECT}`,
  VITE_API_BASE_URL: `https://${SENTINEL}.example/api`,
  VITE_ASSISTANT_API_URL: `https://${SENTINEL}.example/assistant`,
  VITE_ADMIN_AUTH_MODE: 'supabase',
};

const CLEARED = [
  'WORKERS_CI', 'WORKERS_CI_BRANCH', 'CF_PAGES', 'CF_PAGES_BRANCH', 'CF_PAGES_URL',
  'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY',
  'VITE_API_BASE_URL', 'VITE_ASSISTANT_API_URL', 'VITE_ADMIN_AUTH_MODE',
];

/** Strip any Cloudflare/CI markers so one case cannot leak into the next. */
function baseEnv() {
  const env = { ...process.env };
  for (const name of CLEARED) delete env[name];
  return env;
}

function build(label, markers, extraEnv) {
  const result = spawnSync('npm', ['run', 'build'], {
    stdio: 'inherit',
    env: { ...baseEnv(), ...markers, ...extraEnv },
  });
  assert.equal(result.status, 0, `${label}: build failed`);
  return readFileSync('dist/index.html', 'utf8');
}

// Assertions are written as booleans on purpose: a failed doesNotMatch() would
// print the whole 1 MB bundle into the CI log.
function assertIsolated(label, html) {
  assert.equal(html.includes(SENTINEL), false, `${label}: bundle leaked an inherited backend endpoint`);
  assert.equal(html.toLowerCase().includes(`sb_publishable_${FAKE_PROJECT}`), false,
    `${label}: bundle leaked the inherited publishable key`);
}

function assertNotIsolated(label, html) {
  assert.equal(html.includes(SENTINEL), true, `${label}: production build lost its configured backend endpoint`);
}

/* ── completeness guard ─────────────────────────────────────────
 * The isolation list in vite.config.ts is explicit. If someone adds a new
 * browser variable (VITE_*) to src/ and forgets to add it there, branch
 * previews would silently start shipping that value. This guard fails the
 * test instead.
 * -------------------------------------------------------------- */
function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}

const configSource = readFileSync('vite.config.ts', 'utf8');
// Only the previewDefine table counts: "NAME: value," lines inside that block.
const defineBlock = configSource.slice(configSource.indexOf('const previewDefines'));
const isolatedNames = new Set(
  [...defineBlock.matchAll(/^\s*(VITE_[A-Z0-9_]+):/gm)].map((match) => match[1]),
);
assert.ok(isolatedNames.size >= 5, 'could not read the isolation list from vite.config.ts');

const usedNames = new Set();
for (const file of sourceFiles('src')) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g)) usedNames.add(match[1]);
}
const missing = [...usedNames].filter((name) => !isolatedNames.has(name));
assert.deepEqual(missing, [],
  `these VITE_* variables are read by src/ but not cleared in branch previews: ${missing.join(', ')}`);

/* ── scenarios ──────────────────────────────────────────────── */

// 1. Workers Builds, pull-request branch.
assertIsolated(
  'Workers Builds branch preview',
  build('Workers Builds branch preview', { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'arena/preview-isolation-test' }, inherited),
);

// 2. Cloudflare Pages, non-production branch (the gap this test closes).
assertIsolated(
  'Cloudflare Pages branch preview',
  build('Cloudflare Pages branch preview', { CF_PAGES: '1', CF_PAGES_BRANCH: 'arena/preview-isolation-test' }, inherited),
);

// 3. Production branch of both systems must NOT be isolated: the dashboard
//    variables have to reach the production bundle.
assertNotIsolated(
  'Workers Builds production branch',
  build('Workers Builds production branch', { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, inherited),
);
assertNotIsolated(
  'Cloudflare Pages production branch',
  build('Cloudflare Pages production branch', { CF_PAGES: '1', CF_PAGES_BRANCH: 'main' }, inherited),
);

// 4. Leave a clean, sentinel-free build behind (no sentinel env at all).
const clean = build('clean rebuild', {}, {});
assert.equal(clean.includes(SENTINEL), false, 'clean rebuild still contains the sentinel');

console.log(`PASS: ${usedNames.size} browser variables are all covered by the preview isolation list`);
console.log('PASS: branch previews (Workers Builds and Pages) exclude inherited backend endpoints and public key');
console.log('PASS: the production branch keeps its configured backend endpoints in both systems');
console.log('PASS: dist/ is left with a clean build (no sentinel values)');
