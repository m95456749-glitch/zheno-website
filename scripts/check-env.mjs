// ============================================================
// ZHINO — environment / secret-leak guard
//
// Two modes, both fail-closed (exit 1 on any violation):
//
//   node scripts/check-env.mjs          pre-build: inspect the environment
//   node scripts/check-env.mjs --dist   post-build: inspect dist/ output
//
// What it guarantees:
//   1. A report of which optional Supabase/API variables are present — values
//      are NEVER printed (only their length), so the guard itself cannot leak
//      a key into CI logs.
//   2. No VITE_* variable (from the shell or from any .env file Vite would
//      load) is named or shaped like a privileged credential: service-role /
//      secret / password / token / database URL. Anything matching VITE_* is
//      inlined into the public bundle, so only the browser-safe anon
//      (publishable) key may live there.
//   3. No service-role JWT and no `sb_secret_` key in frontend source or in
//      the shipped bundle.
//   4. (--dist) If a Supabase URL was configured for the build, it actually
//      reached the bundle — i.e. the deployment env/secret wiring works.
//
// Usage:
//   npm run check:env && npm run build && npm run check:bundle
// ============================================================

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODE_DIST = process.argv.includes('--dist');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
const fail = (msg) => {
  console.error('FAIL: ' + msg);
  failures += 1;
};
const ok = (msg) => console.log('PASS: ' + msg);
const info = (msg) => console.log('INFO: ' + msg);

/* ── credential fingerprints ─────────────────────────────────────
 * Built from fragments so this file never contains a literal token
 * that a bundle scan would flag in its own source. */
const SECRET_PREFIX = ['sb', 'secret'].join('_') + '_'; // secret-key prefix
const ROLE_MARKER = ['service', 'role'].join('_'); // service_role

/**
 * Vars that are browser-safe by design. Everything else Vite-prefixed must
 * not look like a privileged credential.
 */
const ALLOWED_PUBLIC_KEYS = new Set([
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_API_BASE_URL',
  'VITE_ENABLE_CHECKOUT',
  'VITE_ENABLE_ACCOUNT',
  'VITE_ADMIN_AUTH_MODE',
]);

const FORBIDDEN_NAME = /SERVICE[_-]?ROLE|SECRET|PASSWORD|PASSPHRASE|PRIVATE[_-]?KEY|ACCESS[_-]?TOKEN|DATABASE[_-]?URL|ADMIN[_-]?KEY|API[_-]?SECRET/i;

/** Decode a JWT payload (no signature check) — returns {} when not a JWT. */
function jwtPayload(value) {
  const parts = String(value).split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1]) return {};
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return {};
  }
}

/** True when a value is a privileged (service_role) Supabase credential. */
function isPrivilegedValue(value) {
  const v = String(value).trim();
  if (!v) return false;
  if (v.startsWith(SECRET_PREFIX)) return true;
  const payload = jwtPayload(v);
  const role = String(payload.role ?? payload.type ?? '')
    .toLowerCase()
    .replace(/[_-]/g, '');
  return role === 'servicerole';
}

/* ── env sources ─────────────────────────────────────────────── */

/** Parse a dotenv-style file into a plain object (no expansion, no exec). */
function parseDotenv(file) {
  const out = {};
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function dotenvFiles() {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => name.startsWith('.env') && name !== '.env.example')
    .filter((name) => {
      try {
        return statSync(join(root, name)).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

/**
 * Effective build-time env for the VITE_* namespace: .env files override
 * nothing — Vite gives precedence to real process.env, so process.env wins.
 */
function collectViteEnv() {
  const merged = {};
  for (const file of dotenvFiles()) {
    for (const [key, value] of Object.entries(parseDotenv(join(root, file)))) {
      if (key.startsWith('VITE_')) merged[key] = value;
    }
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('VITE_')) merged[key] = value;
  }
  return merged;
}

/* ── checks ──────────────────────────────────────────────────── */

function checkEnvironment() {
  const files = dotenvFiles();
  info(files.length ? `.env files considered: ${files.join(', ')}` : 'no local .env file present');

  const env = collectViteEnv();

  for (const [key, value] of Object.entries(env)) {
    const privilegedName = FORBIDDEN_NAME.test(key) && !ALLOWED_PUBLIC_KEYS.has(key);
    if (privilegedName) {
      fail(`"${key}" is a VITE_* variable whose name marks it as privileged — Vite inlines every VITE_* value into the public bundle`);
      continue;
    }
    if (isPrivilegedValue(value)) {
      fail(`"${key}" carries a privileged Supabase credential (${ROLE_MARKER} / secret key) — only the anon/publishable key may be exposed to the browser`);
      continue;
    }
    ok(`${key}: set (${String(value).length} chars, value not printed)`);
  }

  for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_ADMIN_AUTH_MODE']) {
    if (!(key in env)) info(`${key}: unset — frontend-only (demo) mode, no network calls`);
  }

  if (env.VITE_SUPABASE_URL && !env.VITE_SUPABASE_ANON_KEY) {
    fail('VITE_SUPABASE_URL is set without VITE_SUPABASE_ANON_KEY — the connection would be half-configured');
  }
  if (!env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
    fail('VITE_SUPABASE_ANON_KEY is set without VITE_SUPABASE_URL — the connection would be half-configured');
  }
  if (env.VITE_SUPABASE_URL && !/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(env.VITE_SUPABASE_URL.trim())) {
    fail('VITE_SUPABASE_URL must be the https project URL (https://<project-ref>.supabase.co) — got something else');
  }

  // Frontend source must never carry a privileged credential, in code or in
  // shipped strings. Comments are skipped so docs can discuss the posture.
  const sourceFiles = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        walk(full);
      } else if (/\.(ts|tsx|js|jsx|mjs|css|html)$/.test(entry)) {
        sourceFiles.push(full);
      }
    }
  })(join(root, 'src'));
  sourceFiles.push(join(root, 'index.html'));

  let scanned = 0;
  for (const file of sourceFiles) {
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      scanned += 1;
      if (trimmed.includes(SECRET_PREFIX)) {
        fail(`${file.replace(root + '/', '')}:${index + 1} contains a Supabase secret key`);
      }
      const jwt = trimmed.match(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/);
      if (jwt && isPrivilegedValue(jwt[0])) {
        fail(`${file.replace(root + '/', '')}:${index + 1} embeds a ${ROLE_MARKER} JWT`);
      }
    });
  }
  ok(`frontend source scanned for privileged credentials (${scanned} lines)`);
}

function checkDist() {
  const distDir = join(root, 'dist');
  if (!existsSync(distDir)) {
    fail('dist/ not found — run `npm run build` before `npm run check:bundle`');
    return;
  }
  const bundles = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(html|js|css)$/.test(entry)) bundles.push(full);
    }
  })(distDir);

  const shipped = bundles.map((file) => ({ file, text: readFileSync(file, 'utf8') }));
  if (!shipped.length) {
    fail('dist/ contains no html/js/css to audit');
    return;
  }

  for (const { file, text } of shipped) {
    const rel = file.replace(root + '/', '');
    if (text.includes(SECRET_PREFIX)) fail(`${rel} ships a Supabase secret key`);
    if (text.includes(`"${ROLE_MARKER}"`) || text.includes(`'${ROLE_MARKER}'`)) {
      // Heuristic only: a library may name the role in a string. The precise
      // checks (secret-key prefix + service_role JWT payload) are the gate.
      console.warn(`WARN: ${rel} mentions "${ROLE_MARKER}" — review before publishing`);
    }
    for (const jwt of text.match(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g) ?? []) {
      if (isPrivilegedValue(jwt)) fail(`${rel} ships a ${ROLE_MARKER} JWT`);
    }
  }
  ok(`bundle audit — ${shipped.length} shipped file(s) contain no privileged credential`);

  // Positive control, active only once a connection layer exists: if some
  // frontend source actually reads VITE_SUPABASE_URL, the configured value
  // must be present in the bundle. On a branch without Supabase code the var
  // is intentionally inert (Vite inlines nothing that is never referenced), so
  // this is reported instead of failing the deploy.
  const configuredUrl = (collectViteEnv().VITE_SUPABASE_URL ?? '').trim();
  if (!configuredUrl) {
    info('VITE_SUPABASE_URL unset — bundle is frontend-only, no Supabase destination inlined');
    return;
  }
  const readsUrl = sourceMentions('VITE_SUPABASE_URL');
  if (!readsUrl) {
    console.warn(
      'WARN: VITE_SUPABASE_URL is configured but no frontend source reads it yet — ' +
        'this branch has no Supabase connection layer, so nothing was inlined.',
    );
    return;
  }
  if (shipped.some(({ text }) => text.includes(configuredUrl))) {
    ok('VITE_SUPABASE_URL is read by the app and reached the bundle (deployment env wiring verified)');
  } else {
    fail('the app reads VITE_SUPABASE_URL and a URL was configured, but dist/ does not contain it — the CI var/secret did not reach the build');
  }
}

/** True when any frontend source file references the given env var name. */
function sourceMentions(name) {
  const dir = join(root, 'src');
  if (!existsSync(dir)) return false;
  let found = false;
  (function walk(current) {
    for (const entry of readdirSync(current)) {
      if (found) return;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== 'node_modules' && !entry.startsWith('.')) walk(full);
      } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry) && !entry.endsWith('.d.ts') && readFileSync(full, 'utf8').includes(name)) {
        // .d.ts files only declare the variable — they are not runtime code,
        // so they must not make this check believe a connection layer exists.
        found = true;
      }
    }
  })(dir);
  return found;
}

if (MODE_DIST) checkDist();
else checkEnvironment();

if (failures > 0) {
  console.error(`\n${failures} environment/security check(s) failed.`);
  process.exit(1);
}
console.log('\nAll environment and secret-leak checks passed.');
