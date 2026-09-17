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
  // Phase 5 — the assistant's model key must live in server secrets only
  // (Supabase Edge Function secrets or the backend's environment), never
  // in this repository and never in a VITE_* variable.
  { name: 'AI provider key (sk-…)', re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: 'AI provider key (Google AI…)', re: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { name: 'AI key literal in code', re: /AI_API_KEY\s*[:=]\s*['"`][A-Za-z0-9_-]{12,}['"`]/ },
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

// ── 7. Assistant Edge Function (offline structure check) ──────
// Phase 5 ships a Deno proxy for the model. The rules that make it
// safe are structural, so they are checked without any connection:
// the file exists, reads its key from the environment, and never
// hardcodes one (the secret scan above covers the rest).
const assistantFn = join(root, 'supabase', 'functions', 'zhino-assistant', 'index.ts');
if (!existsSync(assistantFn)) {
  fail('supabase/functions/zhino-assistant/index.ts is missing');
} else {
  ok('assistant Edge Function exists');
  const fn = readFileSync(assistantFn, 'utf8');
  const readsEnv = /Deno\.env\.get\(/.test(fn) && /AI_API_KEY|OPENAI_API_KEY/.test(fn);
  if (readsEnv) ok('assistant Edge Function reads its model key from the environment');
  else fail('assistant Edge Function must read the model key from Deno.env');

  const literalKey = /(?:AI_API_KEY|OPENAI_API_KEY)\s*[:=]\s*['"`][A-Za-z0-9_-]{12,}['"`]/.test(fn);
  if (!literalKey) ok('assistant Edge Function contains no hardcoded API key');
  else fail('assistant Edge Function contains a hardcoded API key');

  const browserSafe = /Deno\.serve/.test(fn) && /not_configured/.test(fn);
  if (browserSafe) ok('assistant Edge Function degrades gracefully when unconfigured');
  else fail('assistant Edge Function must answer not_configured when secrets are missing');

  // Phase 6 — the function reads the store itself. It may only touch the
  // public catalog/content tables, only with the anon key, and only
  // read-only: no orders, no customer data, never a service key.
  const readTables = Array.from(fn.matchAll(/restSelect<[^>]*>\(\s*'([a-z_]+)\?/g)).map((m) => m[1]);
  const allowedTables = ['products', 'product_variants', 'inventory', 'recipes', 'site_settings'];
  const offLimits = readTables.filter((table) => !allowedTables.includes(table));
  if (offLimits.length === 0 && readTables.length >= 3) {
    ok(`assistant Edge Function reads only public store tables (${readTables.join(', ')})`);
  } else {
    fail(`assistant Edge Function reads unexpected tables: ${offLimits.join(', ') || '(none found)'}`);
  }

  // Comments are stripped first: the documentation deliberately *names*
  // these things while explaining that they are forbidden. URLs keep their
  // `//`, so only block comments and full-line comments are removed.
  const fnsCode = fn
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  if (/(orders|order_items)/.test(fnsCode)) {
    fail('assistant Edge Function must never read orders/order_items (customer data)');
  } else {
    ok('assistant Edge Function never touches orders or customer data');
  }

  if (/SERVICE_ROLE|service_role/.test(fnsCode)) {
    fail('assistant Edge Function must not use a service_role key');
  } else {
    ok('assistant Edge Function never uses a service_role key');
  }

  if (/SUPABASE_ANON_KEY|apikey/.test(fn)) {
    ok('assistant Edge Function reads the store with the public anon key (RLS applies)');
  } else {
    fail('assistant Edge Function must read the store with the public anon key');
  }

  // Input limits must stay in place: message cap, body cap, rate limit.
  const limits = [
    ['MAX_MESSAGE_CHARS', 'user input is length-capped'],
    ['MAX_BODY_BYTES', 'oversized bodies are rejected'],
    ['RATE_LIMIT_MAX', 'a rate limit exists'],
    ['MAX_CATALOG_CHARS', 'the catalog block is capped'],
  ];
  for (const [token, label] of limits) {
    if (fn.includes(token)) ok(`assistant Edge Function — ${label}`);
    else fail(`assistant Edge Function is missing its guard: ${label}`);
  }
}

// ── 8. Assistant front-end boundaries (offline) ────────────────
// The browser side of the assistant must stay read-only, order-free and
// key-free: it may only talk to the shared storefront services and to
// the secure proxy.
{
  const assistantFiles = [
    'src/services/assistant/types.ts',
    'src/services/assistant/knowledge.ts',
    'src/services/assistant/engine.ts',
    'src/services/assistant/client.ts',
    'src/services/assistant/voice.ts',
    'src/components/assistant/useAssistantChat.ts',
    'src/components/assistant/useAssistantSpeech.ts',
    'src/components/assistant/useAssistantCloudVoice.ts',
    'src/components/assistant/useAssistantVoice.ts',
    'src/components/assistant/speechText.ts',
    'src/components/assistant/AssistantChat.tsx',
    'src/pages/AssistantPage.tsx',
  ];
  const missing = assistantFiles.filter((file) => !existsSync(join(root, file)));
  if (missing.length === 0) ok(`assistant front-end modules exist (${assistantFiles.length} files)`);
  else fail(`assistant front-end files are missing: ${missing.join(', ')}`);

  let violations = 0;
  for (const file of assistantFiles) {
    if (!existsSync(join(root, file))) continue;
    const code = readFileSync(join(root, file), 'utf8');
    // No order/customer modules, no direct order table access, no service key.
    if (/(orderStore|supabaseOrders|from\('orders'\)|from\('order_items'\))/.test(code)) {
      fail(`${file} must not touch orders or customer data`);
      violations += 1;
    }
    if (/(service_role|sb_secret_|SERVICE_ROLE)/.test(code)) {
      fail(`${file} must not contain service-role material`);
      violations += 1;
    }
    if (/(AI_API_KEY|OPENAI_API_KEY|\bsk-[A-Za-z0-9]{10,})/.test(code)) {
      fail(`${file} must not contain a model API key`);
      violations += 1;
    }
  }
  if (violations === 0) {
    ok('assistant front-end stays free of orders, service keys and model keys');
  }

  // Phase 8/9 — the DEVICE voice layer must stay inside the browser. Reading
  // an answer with the phone's own engine uses the page's own speechSynthesis;
  // it may never open a request, never use a cloud voice service and never
  // hand the customer's own words to anything (only the assistant's answer is
  // spoken, see smoke test 34b).
  const speechPath = join(root, 'src', 'components', 'assistant', 'useAssistantSpeech.ts');
  if (existsSync(speechPath)) {
    const speech = readFileSync(speechPath, 'utf8');
    const outsourced = [
      ['fetch(', 'a network call'],
      ['XMLHttpRequest', 'a network call'],
      ['WebSocket', 'a socket'],
      ['https?://', 'a hard-coded external service'],
      ['navigator.mediaDevices', 'the microphone'],
      ['getUserMedia', 'the microphone'],
    ].filter(([needle]) => speech.includes(needle));
    if (outsourced.length === 0) {
      ok('device voice layer is browser-only (speechSynthesis, no service, no microphone)');
    } else {
      fail(`device voice layer must stay inside the browser, found: ${outsourced.map(([, label]) => label).join(', ')}`);
    }
    if (speech.includes('speechSynthesis')) ok('device voice layer uses the browser\'s own Text-to-Speech');
    else fail('device voice layer must use window.speechSynthesis');
  } else {
    fail('src/components/assistant/useAssistantSpeech.ts is missing');
  }

  // Phase 9 — the CLOUD voice layer speaks Persian on devices that have no
  // Persian voice installed. It is allowed to make a request, but only to
  // our own proxy: it must never hold a provider key, never name a provider
  // endpoint, and never reach the microphone.
  const cloudVoicePath = join(root, 'src', 'services', 'assistant', 'voice.ts');
  if (existsSync(cloudVoicePath)) {
    const cloudVoice = readFileSync(cloudVoicePath, 'utf8');

    // The endpoint is derived from the project URL / our own backend var —
    // never a hardcoded third-party host.
    const hardcodedHost = /https?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9.-]+/i.test(
      cloudVoice.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\n)\s*\/\/[^\n]*/g, '\n'),
    );
    if (!hardcodedHost) ok('cloud voice layer calls only our own endpoint (no third-party host in the browser)');
    else fail('cloud voice layer must not hardcode a third-party voice host');

    if (cloudVoice.includes('zhino-voice')) ok('cloud voice layer goes through the zhino-voice Edge Function');
    else fail('cloud voice layer must route through the zhino-voice Edge Function');

    const providerKeys = [
      ['AZURE_SPEECH_KEY', 'an Azure Speech key'],
      ['Ocp-Apim-Subscription-Key', 'a provider auth header'],
      ['SPEECH_KEY', 'a speech key'],
      ['x-goog-api-key', 'a provider auth header'],
    ].filter(([needle]) => cloudVoice.includes(needle));
    if (providerKeys.length === 0) {
      ok('cloud voice layer holds no provider credential');
    } else {
      fail(`cloud voice layer must not carry provider credentials: ${providerKeys.map(([, l]) => l).join(', ')}`);
    }

    if (!/navigator\.mediaDevices|getUserMedia/.test(cloudVoice)) {
      ok('cloud voice layer never touches the microphone');
    } else {
      fail('cloud voice layer must never touch the microphone');
    }
  } else {
    fail('src/services/assistant/voice.ts is missing');
  }

  // Phase 9 — a LONG answer must be read to the end. The assistant may reply
  // with up to 4000 characters while one call to the voice service is capped
  // far lower, so the player has to split the answer on sentence boundaries
  // and play the pieces in sequence. Sending the answer as a single blind
  // slice would silently swallow everything past the cap.
  const playerPath = join(root, 'src', 'components', 'assistant', 'useAssistantCloudVoice.ts');
  const splitterPath = join(root, 'src', 'components', 'assistant', 'speechText.ts');
  if (existsSync(playerPath) && existsSync(splitterPath)) {
    const player = readFileSync(playerPath, 'utf8');
    const splitter = readFileSync(splitterPath, 'utf8');

    if (/splitForSpeech\s*\(/.test(player)) {
      ok('cloud voice layer splits long answers instead of truncating them');
    } else {
      fail('cloud voice layer must split long answers (splitForSpeech) or the end is never spoken');
    }

    // The cap used by the browser must stay below the server-side cap,
    // otherwise the service rejects the piece and the customer hears nothing.
    const voiceFnPath = join(root, 'supabase', 'functions', 'zhino-voice', 'index.ts');
    const fnSource = existsSync(voiceFnPath) ? readFileSync(voiceFnPath, 'utf8') : '';
    const serverCap = Number(fnSource.match(/MAX_TEXT_CHARS\s*=\s*(\d+)/)?.[1] ?? 0);
    const clientCap = Number(splitter.match(/CLOUD_MAX_CHUNK\s*=\s*(\d+)/)?.[1] ?? 0);
    if (serverCap > 0 && clientCap > 0 && clientCap <= serverCap) {
      ok(`voice chunk size (${clientCap}) stays within the service limit (${serverCap})`);
    } else {
      fail(`voice chunk size (${clientCap}) must stay within the service limit (${serverCap})`);
    }

    // The splitter must never drop text: it is the single guarantee that the
    // whole answer is spoken.
    if (/\.slice\(0,\s*\d+\)/.test(player)) {
      fail('cloud voice layer must not slice the answer to a fixed length (that truncates it)');
    } else {
      ok('cloud voice layer never clips the answer to a fixed length');
    }
  } else {
    fail('cloud voice player/splitter modules are missing');
  }

  // Phase 9 — the voice Edge Function: key from the environment only, no
  // hardcoded credential, graceful when unconfigured, and no table access
  // at all (unlike the assistant function, this one reads nothing).
  const voiceFn = join(root, 'supabase', 'functions', 'zhino-voice', 'index.ts');
  if (!existsSync(voiceFn)) {
    fail('supabase/functions/zhino-voice/index.ts is missing');
  } else {
    ok('voice Edge Function exists');
    const fn = readFileSync(voiceFn, 'utf8');

    if (/Deno\.env\.get\(/.test(fn) && /AZURE_SPEECH_KEY/.test(fn)) {
      ok('voice Edge Function reads its key from the environment');
    } else {
      fail('voice Edge Function must read its key from Deno.env');
    }

    const literalVoiceKey = /AZURE_SPEECH_KEY\s*[:=]\s*['"`][A-Za-z0-9_-]{12,}['"`]/.test(fn);
    if (!literalVoiceKey) ok('voice Edge Function contains no hardcoded API key');
    else fail('voice Edge Function contains a hardcoded API key');

    if (/Deno\.serve/.test(fn) && /not_configured/.test(fn)) {
      ok('voice Edge Function degrades gracefully when unconfigured');
    } else {
      fail('voice Edge Function must answer not_configured when secrets are missing');
    }

    if (!/\/rest\/v1\/|from\('/.test(fn)) {
      ok('voice Edge Function touches no database table (synthesis only)');
    } else {
      fail('voice Edge Function must not read any database table');
    }

    if (/(service_role|sb_secret_|SERVICE_ROLE)/.test(fn)) {
      fail('voice Edge Function must never use a service_role key');
    } else {
      ok('voice Edge Function never uses a service_role key');
    }

    // The customer's text is escaped before it becomes SSML: a reply can
    // never inject a tag that changes how the engine behaves.
    if (/escapeXml/.test(fn)) ok('voice Edge Function escapes text before building SSML');
    else fail('voice Edge Function must escape text before building SSML');

    for (const [token, label] of [
      ['MAX_TEXT_CHARS', 'spoken text is length-capped'],
      ['MAX_BODY_BYTES', 'oversized bodies are rejected'],
      ['RATE_LIMIT_MAX', 'a rate limit exists'],
    ]) {
      if (fn.includes(token)) ok(`voice Edge Function — ${label}`);
      else fail(`voice Edge Function is missing its guard: ${label}`);
    }

    // The reply must never leak the provider's raw error or the key.
    if (/result\.error/.test(fn) && /console\.error/.test(fn) && !/message:\s*.*result\.error/.test(fn)) {
      ok('voice Edge Function keeps upstream error detail out of the response');
    } else {
      fail('voice Edge Function must not return raw upstream error detail');
    }
  }

  // Phase 8 — nothing technical is shown to a customer. Comments are stripped
  // first (the source documents the rules it follows), and then the visible UI
  // files must not contain a single internal word: those belong to the
  // services layer, which keeps talking to the database and the model exactly
  // as before — quietly.
  const chatUiFiles = [
    'src/components/assistant/AssistantChat.tsx',
    'src/components/assistant/useAssistantChat.ts',
    'src/pages/AssistantPage.tsx',
  ];
  const internalWords = ['دیتابیس', 'موتور محلی', 'کاتالوگ', 'سوپابیس', 'همگام‌سازی'];
  for (const file of chatUiFiles) {
    if (!existsSync(join(root, file))) continue;
    const visible = readFileSync(join(root, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|\n)\s*\/\/[^\n]*/g, '\n');
    const leaks = internalWords.filter((word) => visible.includes(word));
    if (leaks.length === 0) ok(`${file} shows no internal wording to customers`);
    else fail(`${file} prints internal details to the customer: ${leaks.join(', ')}`);
  }

  // The grounding layer must read the shared storefront services, so the
  // assistant can never disagree with the shop about a price.
  const knowledge = existsSync(join(root, 'src/services/assistant/knowledge.ts'))
    ? readFileSync(join(root, 'src/services/assistant/knowledge.ts'), 'utf8')
    : '';
  for (const [token, label] of [
    ["from '../catalog'", 'the storefront catalog service'],
    ["from '../settings'", 'the shipping settings service'],
    ["from '../recipeStore'", 'the recipe service'],
  ]) {
    if (knowledge.includes(token)) ok(`assistant grounding uses ${label}`);
    else fail(`assistant grounding must use ${label}`);
  }
  if (/\b(200000|700000|50000)\b/.test(knowledge)) {
    fail('assistant grounding must not hardcode prices or shipping amounts');
  } else {
    ok('assistant grounding hardcodes no price or shipping amount');
  }
}

// ── result ────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\n${failures} Supabase check(s) failed.`);
  process.exit(1);
}
console.log('\nAll Supabase structure checks passed.');
