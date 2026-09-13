// ============================================================
// ZHINO — Supabase repository-structure validation (offline, read-only)
//
// This script NEVER connects to any database and NEVER reads secrets.
// It only validates the files committed in this repository:
//
//   1. required files exist (supabase/migrations/*.sql, supabase/verify.sql)
//   2. migration filenames follow <14-digit-timestamp>_<snake_case>.sql
//   3. migration versions are unique and lexically ordered (the order the
//      Supabase CLI applies them in)
//   4. no destructive statements (DROP TABLE/SCHEMA, TRUNCATE, DELETE FROM)
//      hide inside a migration
//   5. supabase/verify.sql is read-only (SELECT-only statements)
//   6. no obvious secret material is committed anywhere in the repo
//
// Usage: node scripts/verify-supabase.mjs
// ============================================================

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
const fail = (msg) => {
  console.error('FAIL: ' + msg);
  failures += 1;
};
const ok = (msg) => console.log('PASS: ' + msg);

// ── 1. Required files ─────────────────────────────────────────
const migrationsDir = join(root, 'supabase', 'migrations');
const verifyPath = join(root, 'supabase', 'verify.sql');

if (!existsSync(migrationsDir)) {
  fail('supabase/migrations/ directory is missing');
} else {
  ok('supabase/migrations/ exists');
}
if (!existsSync(verifyPath)) {
  fail('supabase/verify.sql is missing');
} else {
  ok('supabase/verify.sql exists');
}
if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}

// ── 2. Migration naming ───────────────────────────────────────
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
if (files.length === 0) {
  fail('supabase/migrations/ contains no .sql files');
} else {
  ok(`found ${files.length} migration file(s)`);
}

const NAME_RE = /^(\d{14})_[a-z0-9_]+\.sql$/;
const versions = [];
for (const f of files) {
  const m = f.match(NAME_RE);
  if (!m) {
    fail(`migration name "${f}" does not match <YYYYMMDDHHMMSS>_<snake_case>.sql`);
  } else {
    versions.push(m[1]);
  }
}
if (versions.length === files.length) ok('all migration names follow the CLI convention');

// ── 3. Ordering / duplicates ──────────────────────────────────
const dupes = versions.filter((v, i) => versions.indexOf(v) !== i);
if (dupes.length > 0) {
  fail(`duplicate migration version(s): ${[...new Set(dupes)].join(', ')}`);
} else {
  ok('no duplicate migration versions');
}
const sorted = [...versions].sort();
if (versions.join() !== sorted.join()) {
  fail('migration versions are not in ascending order');
} else {
  ok('migration versions are strictly ordered');
}

// ── 4. No destructive statements inside migrations ────────────
// Comments are stripped first so documentation mentioning these words
// does not trigger a false positive.
const stripSql = (sql) =>
  sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

const DESTRUCTIVE = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\bdrop\s+database\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
];
for (const f of files) {
  const sql = stripSql(readFileSync(join(migrationsDir, f), 'utf8'));
  const hits = DESTRUCTIVE.filter((re) => re.test(sql));
  if (hits.length > 0) {
    fail(`migration "${f}" contains destructive statement(s): ${hits.map((r) => r.source).join(', ')}`);
  }
}
ok('no destructive statements (DROP TABLE/SCHEMA/DATABASE, TRUNCATE, DELETE FROM) in migrations');

// ── 5. verify.sql must be read-only ───────────────────────────
const verifySql = stripSql(readFileSync(verifyPath, 'utf8'));
const statements = verifySql
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);
const nonSelect = statements.filter((s) => !/^(select|with|explain)\b/i.test(s));
if (nonSelect.length > 0) {
  fail(`supabase/verify.sql contains ${nonSelect.length} non-SELECT statement(s) — it must stay read-only`);
} else {
  ok(`supabase/verify.sql is read-only (${statements.length} SELECT statements)`);
}

// ── 6. No committed secret material ───────────────────────────
// Scans git-TRACKED files only (node_modules/dist are never tracked).
// Patterns require realistic token length to avoid false positives on
// documentation that merely names a prefix.
const SECRET_PATTERNS = [
  { name: 'Supabase personal access token', re: /sbp_[A-Za-z0-9]{20,}/ },
  { name: 'Supabase secret API key', re: /sb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: 'JWT (service_role/anon key)', re: /eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/ },
  // Placeholders are allowed: %s (printf templates), ${VAR}/$VAR (shell),
  // [YOUR-PASSWORD]-style docs. Only a literal credential should match.
  { name: 'Postgres URL with embedded password', re: /postgres(?:ql)?:\/\/[^\s:'"]+:(?![%$[{<])[^\s@'"$%[\]{}<>]+@/ },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];
let tracked = [];
try {
  tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
} catch {
  console.log('SKIP: git not available — secret scan skipped');
}
let secretHits = 0;
for (const file of tracked) {
  let text;
  try {
    text = readFileSync(join(root, file), 'utf8');
  } catch {
    continue; // binary or unreadable — skip
  }
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(text)) {
      fail(`possible committed secret (${name}) in ${file}`);
      secretHits += 1;
    }
  }
}
if (secretHits === 0 && tracked.length > 0) {
  ok(`no committed secret material found in ${tracked.length} tracked files`);
}

// ── result ────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\n${failures} Supabase check(s) failed.`);
  process.exit(1);
}
console.log('\nAll Supabase structure checks passed.');
