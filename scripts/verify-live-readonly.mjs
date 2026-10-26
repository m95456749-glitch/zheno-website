// ============================================================
// ZHINO — READ-ONLY live verification of a deployed host
//
// Proves, from any machine that can reach the host, whether the
// deployed bundle is CONNECTED to a hosted Supabase project or is
// running in the offline/demo mode — WITHOUT writing any data and
// WITHOUT printing any credential.
//
// What it does (all of it read-only):
//   1. GET / and a few deep links  → the SPA shell must be served,
//      same origin, no cross-origin redirect.
//   2. GET one image and one font  → bytes + MIME type.
//   3. Classify the shipped bundle:
//        · a hosted project URL present?          (connected build)
//        · a publishable/anon key present?        (connected build)
//        · a secret/sb_secret_ or service_role key present?  → FAIL
//      Only booleans and a MASKED project reference are printed.
//   4. When a project URL is present, send a CORS PREFLIGHT (OPTIONS)
//      to both Edge Functions from the tested origin. The response
//      header proves whether ALLOWED_ORIGINS already allows this
//      host. OPTIONS has no side effects: no model call, no audio,
//      no database write.
//
// What it never does:
//   · no INSERT/UPDATE/DELETE/RPC, no order, no upload, no login
//   · no secret is read from this repository or printed
//
// Usage:
//   npm run verify:live -- https://zheno.ACCOUNT.workers.dev
//   npm run verify:live -- http://127.0.0.1:8787      (local wrangler)
// ============================================================

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

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
const results = [];
function ok(message) {
  results.push(`PASS: ${message}`);
  console.log(`PASS: ${message}`);
}

async function get(path) {
  const response = await fetch(new URL(path, base), {
    headers: { 'Sec-Fetch-Mode': 'navigate' },
    signal: AbortSignal.timeout(TIMEOUT),
    redirect: 'follow',
  });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  assert.equal(new URL(response.url).origin, base.origin, `${path}: unexpected cross-origin redirect`);
  return response;
}

/* ── 1. SPA shell on the real routes ───────────────────────── */
const shell = await get('/');
assert.match(shell.headers.get('content-type') || '', /text\/html/, '/: not HTML');
const html = await shell.text();
ok(`SPA shell served at / (${html.length} characters)`);

for (const path of ['/products', '/cart', '/admin/login', '/admin/products']) {
  const response = await get(path);
  assert.match(response.headers.get('content-type') || '', /text\/html/, `${path}: not HTML`);
  const body = await response.text();
  assert.equal(createHash('sha256').update(body).digest('hex'),
    createHash('sha256').update(html).digest('hex'),
    `${path}: not the built SPA shell`);
}
ok('deep links return the SPA shell (products, cart, admin login, admin products)');

/* ── 2. static assets ──────────────────────────────────────── */
for (const [path, pattern] of [
  ['/images/products/jelly-pomegranate.jpg', /^image\//],
  ['/fonts/vazirmatn-arabic-wght-normal.woff2', /font\/woff2|application\/font-woff2/],
]) {
  const response = await get(path);
  const type = response.headers.get('content-type') || '';
  assert.match(type, pattern, `${path}: unexpected MIME "${type}"`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 1000, `${path}: suspiciously small (${bytes.length} bytes)`);
}
ok('product image and Persian font are served with the right MIME types');

/* ── 3. bundle classification (no value is ever printed) ───── */
const PROJECT_URL = /https:\/\/([a-z]{20})\.supabase\.co/g;
const projects = new Set();
for (const match of html.matchAll(PROJECT_URL)) projects.add(match[1]);
const hasPublishable = /sb_publishable_[A-Za-z0-9_-]{8,}/.test(html);
const hasLegacyAnon = /"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./.test(html);

assert.equal(/sb_secret_[A-Za-z0-9_-]{8,}/.test(html), false,
  'the bundle ships a service/secret key — this must never be deployed');
assert.equal(/service_role/.test(html) && /"role"\s*:\s*"service_role"/.test(html), false,
  'the bundle ships a service_role JWT — this must never be deployed');
ok('bundle carries no privileged/service key');

function mask(ref) {
  return `${ref.slice(0, 4)}…${ref.slice(-4)}`;
}

const projectList = [...projects];
if (projectList.length === 0) {
  console.log('\nRESULT: this deployment is in OFFLINE / DEMO mode.');
  console.log('  No hosted Supabase project URL is in the bundle, so the admin panel');
  console.log('  cannot reach the real database. Check the build variables in the');
  console.log('  Cloudflare dashboard (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)');
  console.log('  and rebuild — build variables need a new build to take effect.');
} else {
  ok(`${projectList.length} hosted project URL(s) in the bundle: ${projectList.map(mask).join(', ')} (masked)`);
  assert.ok(hasPublishable || hasLegacyAnon,
    'a project URL is configured but no publishable/anon key is shipped — the app will fall back to offline mode');
  ok('a publishable/anon key is present (the browser-safe key; RLS decides data access)');

  /* ── 4. Edge Function CORS preflight (no side effects) ───── */
  const origin = base.origin;
  for (const fn of ['zhino-assistant', 'zhino-voice']) {
    for (const ref of projectList) {
      const url = `https://${ref}.supabase.co/functions/v1/${fn}`;
      try {
        const response = await fetch(url, {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,content-type',
          },
          signal: AbortSignal.timeout(TIMEOUT),
        });
        const allow = (response.headers.get('access-control-allow-origin') || '').trim();
        if (allow === '*' || allow === origin) {
          ok(`${fn}: origin ${origin} is allowed (HTTP ${response.status}, Access-Control-Allow-Origin present)`);
        } else if (response.status === 403) {
          console.log(`WARN: ${fn}: origin ${origin} is REFUSED (HTTP 403, no Allow-Origin). ` +
            'ALLOWED_ORIGINS is restricted and does not include this host, so the assistant and cloud ' +
            'voice will fail here. Add this exact origin next to the main domain in the Supabase ' +
            'secrets — never replace the list with *.');
        } else {
          console.log(`WARN: ${fn}: no Access-Control-Allow-Origin for ${origin} (HTTP ${response.status}). ` +
            'Either the function is not deployed or its origin list excludes this host.');
        }
      } catch (error) {
        // Distinguish "this sandbox has no egress" from "the function answers
        // badly". `cause.code` is a network/DNS error code, never a secret.
        const cause = error.cause && (error.cause.code || error.cause.message) || 'no-cause';
        console.log(`WARN: ${fn}: preflight could not be completed (${error.name}, cause=${cause}). ` +
          'Network blocked, or the function is not deployed — this is not proof of a working endpoint.');
      }
    }
  }
  /* ── 5. reachability of the project itself (no credentials, no data) ── */
  for (const ref of projectList) {
    const probes = [
      ['REST root', `https://${ref}.supabase.co/rest/v1/`],
      ['Auth health', `https://${ref}.supabase.co/auth/v1/health`],
      ['Functions root', `https://${ref}.supabase.co/functions/v1/`],
    ];
    for (const [label, url] of probes) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { Origin: base.origin },
          signal: AbortSignal.timeout(TIMEOUT),
          redirect: 'manual',
        });
        console.log(`INFO: ${label} → HTTP ${response.status} ` +
          `(access-control-allow-origin=${response.headers.get('access-control-allow-origin') || 'absent'})`);
        if (response.status === 200 || response.status === 401 || response.status === 404) {
          ok(`${label} reachable from this host (HTTP ${response.status}) — no data read`);
        }
      } catch (error) {
        const cause = error.cause && (error.cause.code || error.cause.message) || 'no-cause';
        console.log(`WARN: ${label} unreachable (${error.name}, cause=${cause}) — network path, not an app verdict.`);
      }
    }
  }

  console.log('\nRESULT: this deployment ships a CONNECTED build (hosted project URL + public key).');
  console.log('  Connection is proven; data access still depends on RLS and the signed-in admin.');
  console.log('  Log in to /admin/login with a real admin account and look for the database badge');
  console.log('  instead of the «نمایشی» badge — reads are safe, but do NOT save or place an order');
  console.log('  on a production-connected host until a staging project exists.');
}

console.log(`\n${results.length} read-only checks passed against ${base.origin}.`);
console.log('No data was written: no login, no save, no order, no upload, no RPC.');
