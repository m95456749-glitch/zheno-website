// ============================================================
// ZHINO — READ-ONLY live verification of a deployed host
//
// Answers one question with evidence: is this deployment talking to a
// REAL hosted Supabase project, and is the host serving the built app
// correctly? It never writes anything and never prints a credential.
//
// What it does (every request is GET or OPTIONS):
//   1. GET /  → the SPA shell must be served (text/html, same origin).
//   2. GET a few deep links → must equal the shell byte-for-byte. A host
//      WITHOUT SPA rewrites (GitHub Pages) answers 404 with the shell in
//      the body: that is reported as WARN (the browser still renders the
//      app), not as a failure. Cloudflare Workers answers 200.
//   3. GET one product image and one font → bytes + MIME type.
//   4. Classify the bundle: hosted project URL? publishable/anon key?
//      privileged (secret/service_role) key? Only booleans and a MASKED
//      project reference are printed.
//   5. Probe the project host itself (REST root, Auth health, Functions
//      root) and the two Edge Function CORS preflights (OPTIONS) — no
//      key, no model call, no audio, no database write.
//
// Output contract: PASS: / WARN: / FAIL: / INFO: lines, then a single
// RESULT: line. Exit code 1 when any check FAILED (unreachable host,
// leaked privileged key, non-shell deep link), so CI can gate on it.
//
// Usage:
//   npm run verify:live -- https://zheno.<account>.workers.dev
//   npm run verify:live -- https://zheno.devs.surf
//   npm run verify:live -- http://127.0.0.1:8787      (local wrangler)
// ============================================================

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const raw = process.argv[2];
if (!raw) {
  console.error('Usage: node scripts/verify-live-readonly.mjs https://host[:port]');
  process.exit(2);
}

let base;
try {
  base = new URL(raw);
} catch {
  console.error('::error:: not a valid URL');
  process.exit(2);
}
const localHost = ['localhost', '127.0.0.1'].includes(base.hostname);
assert.ok(base.protocol === 'https:' || localHost, 'Use https:// (or http://127.0.0.1 for a local wrangler).');

const TIMEOUT = 20_000;
let passed = 0;
let warned = 0;
const failures = [];

function ok(message) {
  passed++;
  console.log(`PASS: ${message}`);
}
function warn(message) {
  warned++;
  console.log(`WARN: ${message}`);
}
/** Record a failed check and CONTINUE, so one bad path cannot hide the rest. */
function bad(message) {
  failures.push(message);
  console.log(`FAIL: ${message}`);
}
function info(message) {
  console.log(`INFO: ${message}`);
}
const sha = (text) => createHash('sha256').update(text).digest('hex');

/** GET with a network-error guard. Status is judged by the caller. */
async function get(path) {
  try {
    return await fetch(new URL(path, base), {
      headers: { 'Sec-Fetch-Mode': 'navigate' },
      signal: AbortSignal.timeout(TIMEOUT),
      redirect: 'follow',
    });
  } catch (error) {
    const cause = (error.cause && (error.cause.code || error.cause.message)) || 'no-cause';
    bad(`${path}: unreachable (${error.name}, cause=${cause})`);
    return null;
  }
}

/* ── 1. the shell ─────────────────────────────────────────── */
const shellResponse = await get('/');
if (!shellResponse) {
  console.log('\nRESULT: the host is unreachable from here — nothing else can be verified.');
  process.exit(1);
}
if (shellResponse.status !== 200) bad(`/: HTTP ${shellResponse.status}`);
if (new URL(shellResponse.url).origin !== base.origin) {
  bad(`/: unexpected cross-origin redirect to ${new URL(shellResponse.url).origin}`);
}
const contentType = shellResponse.headers.get('content-type') || '';
if (!/text\/html/.test(contentType)) bad(`/: unexpected content-type "${contentType}"`);
const html = await shellResponse.text();
if (html.length > 1000) ok(`SPA shell served at / (${html.length} characters)`);
else bad(`/: response is too small to be the app (${html.length} characters)`);
const shellHash = sha(html);

/* ── 2. deep links ────────────────────────────────────────── */
let softNotFound = 0;
let deepLinkProblems = 0;
for (const path of ['/products', '/cart', '/admin/login', '/admin/products']) {
  const response = await get(path);
  if (!response) { deepLinkProblems++; continue; }
  const body = await response.text();
  const isShell = sha(body) === shellHash;
  if (response.status === 200 && isShell) continue;
  if (response.status === 404 && isShell) { softNotFound++; continue; }
  bad(`${path}: HTTP ${response.status}${isShell ? ' (served the app shell)' : ' (content is not the app shell)'}`);
  deepLinkProblems++;
}
if (deepLinkProblems === 0) ok('deep links return the built app shell (products, cart, admin login, admin products)');
if (softNotFound > 0) {
  warn(`${softNotFound} deep link(s) answered HTTP 404 with the app shell in the body — ` +
    'this host has no SPA rewrite (GitHub Pages behaviour); browsers still render the app, ' +
    'but bots and strict clients see 404. Cloudflare Workers answers 200 here.');
}

/* ── 3. static assets ─────────────────────────────────────── */
let assetProblems = 0;
for (const [path, pattern] of [
  ['/images/products/jelly-pomegranate.jpg', /^image\//],
  ['/fonts/vazirmatn-arabic-wght-normal.woff2', /font\/woff2|application\/font-woff2/],
]) {
  const response = await get(path);
  if (!response) { assetProblems++; continue; }
  const type = response.headers.get('content-type') || '';
  if (response.status !== 200) { bad(`${path}: HTTP ${response.status}`); assetProblems++; continue; }
  if (!pattern.test(type)) { bad(`${path}: unexpected MIME "${type}"`); assetProblems++; continue; }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length <= 1000) { bad(`${path}: suspiciously small (${bytes.length} bytes)`); assetProblems++; }
}
if (assetProblems === 0) ok('product image and Persian font are served with the right MIME types');

/* ── 4. bundle classification (no value is ever printed) ──── */
const projects = new Set();
for (const match of html.matchAll(/https:\/\/([a-z]{20})\.supabase\.co/g)) projects.add(match[1]);
const hasPublishable = /sb_publishable_[A-Za-z0-9_-]{8,}/.test(html);
const hasLegacyAnon = /"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./.test(html);

if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(html)) {
  bad('the bundle ships a service/secret key — this must never be deployed');
} else if (/"role"\s*:\s*"service_role"/.test(html)) {
  bad('the bundle ships a service_role JWT — this must never be deployed');
} else {
  ok('bundle carries no privileged/service key');
}

const mask = (ref) => `${ref.slice(0, 4)}…${ref.slice(-4)}`;
const projectList = [...projects];
let connected = false;

if (projectList.length === 0) {
  warn('OFFLINE / DEMO mode: no hosted Supabase project URL is in the bundle. The admin panel ' +
    'cannot reach any database. Check the build variables (VITE_SUPABASE_URL / ' +
    'VITE_SUPABASE_PUBLISHABLE_KEY) and rebuild — they take effect only on a new build.');
} else {
  ok(`${projectList.length} hosted project URL(s) in the bundle: ${projectList.map(mask).join(', ')} (masked)`);
  if (hasPublishable || hasLegacyAnon) {
    ok('a publishable/anon key is present (the browser-safe key; RLS decides data access)');
  } else {
    bad('a project URL is configured but no publishable/anon key is shipped — the app falls back to offline mode');
  }

  /* ── 5. is the backend actually there? (no credentials) ── */
  for (const ref of projectList) {
    let reachable = 0;
    for (const [label, url] of [
      ['REST root', `https://${ref}.supabase.co/rest/v1/`],
      ['Auth health', `https://${ref}.supabase.co/auth/v1/health`],
      ['Functions root', `https://${ref}.supabase.co/functions/v1/`],
    ]) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { Origin: base.origin },
          signal: AbortSignal.timeout(TIMEOUT),
          redirect: 'manual',
        });
        reachable++;
        info(`${label} → HTTP ${response.status} ` +
          `(access-control-allow-origin=${response.headers.get('access-control-allow-origin') || 'absent'})`);
        if (response.status === 200) ok(`${label} answered 200 — the project host exists`);
      } catch (error) {
        const cause = (error.cause && (error.cause.code || error.cause.message)) || 'no-cause';
        warn(`${label} unreachable (${error.name}, cause=${cause})`);
      }
    }
    if (reachable === 0) {
      bad(`project ${mask(ref)} does not resolve at all (${ref}.supabase.co) — every backend call ` +
        'in the deployed app will fail: the admin panel cannot sign in and the storefront falls ' +
        'back to its static catalog. This is a deployment-configuration defect, not a network issue.');
    } else {
      connected = true;
    }

    for (const fn of ['zhino-assistant', 'zhino-voice']) {
      try {
        const response = await fetch(`https://${ref}.supabase.co/functions/v1/${fn}`, {
          method: 'OPTIONS',
          headers: {
            Origin: base.origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,content-type',
          },
          signal: AbortSignal.timeout(TIMEOUT),
        });
        const allow = (response.headers.get('access-control-allow-origin') || '').trim();
        if (allow === '*' || allow === base.origin) {
          ok(`${fn}: origin ${base.origin} is allowed (HTTP ${response.status})`);
        } else if (response.status === 403) {
          warn(`${fn}: origin ${base.origin} is REFUSED (HTTP 403). ALLOWED_ORIGINS is restricted and ` +
            'does not include this host — add this exact origin next to the main domain; never use *.');
        } else {
          warn(`${fn}: no Access-Control-Allow-Origin for ${base.origin} (HTTP ${response.status})`);
        }
      } catch (error) {
        const cause = (error.cause && (error.cause.code || error.cause.message)) || 'no-cause';
        warn(`${fn}: preflight could not be completed (${error.name}, cause=${cause})`);
      }
    }
  }

  if (connected) {
    console.log('\nRESULT: this deployment ships a CONNECTED build (hosted project URL + public key) ' +
      'and the project host answers HTTP.');
    console.log('  Data access is still decided by RLS and the signed-in admin — log in at /admin/login.');
  } else {
    console.log('\nRESULT: CONFIGURED BUT DEAD — the bundle points at a Supabase project whose host ' +
      'does not resolve. Treat the panel as unusable until the build variables are corrected.');
  }
}

/* ── summary ──────────────────────────────────────────────── */
if (projectList.length > 0 && !connected) failures.push('the configured Supabase project host does not resolve');
console.log(`\n${passed} read-only checks passed, ${warned} warnings, ${failures.length} failed, against ${base.origin}.`);
console.log('No data was written: no login, no save, no order, no upload, no RPC.');
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
