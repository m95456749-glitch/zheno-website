// Build with public dummy endpoints to ensure BRANCH previews cannot inherit
// them, while the production branch still receives the configured values.
//
// Two Cloudflare build systems can build this repository and each one names the
// branch with a different variable:
//   • Workers Builds → WORKERS_CI=1 / WORKERS_CI_BRANCH
//   • Pages          → CF_PAGES=1   / CF_PAGES_BRANCH
// Both are exercised below. Every value used here is an obvious sentinel: no
// real project URL, key or endpoint is read, written or logged.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const SENTINEL = 'preview-isolation-sentinel';

const inherited = {
  VITE_SUPABASE_URL: `https://${SENTINEL}.supabase.co`,
  VITE_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${SENTINEL.replace(/-/g, '_')}`,
  VITE_API_BASE_URL: `https://${SENTINEL}.example/api`,
  VITE_ASSISTANT_API_URL: `https://${SENTINEL}.example/assistant`,
  VITE_ADMIN_AUTH_MODE: 'supabase',
};

/** Strip any Cloudflare/CI markers so one case cannot leak into the next. */
function baseEnv() {
  const env = { ...process.env };
  for (const name of ['WORKERS_CI', 'WORKERS_CI_BRANCH', 'CF_PAGES', 'CF_PAGES_BRANCH', 'CF_PAGES_URL',
    'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY',
    'VITE_API_BASE_URL', 'VITE_ASSISTANT_API_URL', 'VITE_ADMIN_AUTH_MODE']) {
    delete env[name];
  }
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

function assertIsolated(label, html) {
  assert.doesNotMatch(html, new RegExp(SENTINEL), `${label}: bundle leaked an inherited backend endpoint`);
  assert.doesNotMatch(html, new RegExp(`sb_publishable_${SENTINEL.replace(/-/g, '_')}`),
    `${label}: bundle leaked the inherited publishable key`);
}

function assertNotIsolated(label, html) {
  assert.match(html, new RegExp(SENTINEL), `${label}: production build lost its configured backend endpoint`);
}

// 1. Workers Builds, pull-request branch.
assertIsolated(
  'Workers Builds branch preview',
  build('Workers Builds branch preview', { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'arena/preview-isolation-test' }, inherited),
);

// 2. Cloudflare Pages, non-production branch (the gap this test now closes).
assertIsolated(
  'Cloudflare Pages branch preview',
  build('Cloudflare Pages branch preview', { CF_PAGES: '1', CF_PAGES_BRANCH: 'arena/preview-isolation-test' }, inherited),
);

// 3. Production branch of both systems, and a plain local build, must NOT be
//    isolated: the dashboard variables have to reach the production bundle.
assertNotIsolated(
  'Workers Builds production branch',
  build('Workers Builds production branch', { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, inherited),
);
assertNotIsolated(
  'Cloudflare Pages production branch',
  build('Cloudflare Pages production branch', { CF_PAGES: '1', CF_PAGES_BRANCH: 'main' }, inherited),
);

console.log('PASS: branch previews (Workers Builds and Pages) exclude inherited backend endpoints and public key');
console.log('PASS: the production branch keeps its configured backend endpoints in both systems');
