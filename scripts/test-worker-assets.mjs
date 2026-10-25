// Run against local Wrangler or the actual workers.dev URL. Never writes data.
// Build first. Remote tests require the same build-time variables as deployment.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = new URL(process.argv[2] || 'http://127.0.0.1:8787');
assert.ok(base.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(base.hostname), 'Remote tests require HTTPS');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const index = await readFile('dist/index.html');
assert.match(index.toString(), /<script\b[^>]*type="module"/);
assert.match(index.toString(), /<style\b/);
assert.doesNotMatch(index.toString(), /(?:src|href)=["']https?:\/\/[^"']*(?:github\.io|fastly|fonts\.googleapis)/i);

async function get(path) {
  const response = await fetch(new URL(path, base), {
    headers: { 'Sec-Fetch-Mode': 'navigate' },
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  assert.equal(new URL(response.url).origin, base.origin, `${path}: unexpected cross-origin redirect`);
  return { response, bytes: Buffer.from(await response.arrayBuffer()) };
}

for (const path of ['/', '/products', '/products/jelly-pomegranate', '/cart', '/checkout', '/recipes', '/about', '/contact', '/assistant', '/admin/login', '/admin/products', '/admin/product-images', '/admin/orders', '/nonexistent-route-test']) {
  const { response, bytes } = await get(path);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.equal(digest(bytes), digest(index), `${path}: not the built SPA shell`);
  console.log(`PASS: SPA navigation ${path}`);
}

let count = 0;
async function checkAssets(dir) {
  for (const entry of await readdir(`dist/${dir}`, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) { await checkAssets(path); continue; }
    const local = await readFile(`dist/${path}`);
    assert.ok(local.length < 25 * 1024 * 1024, `${path}: exceeds Workers asset limit`);
    const { response, bytes } = await get(`/${path}`);
    assert.equal(digest(bytes), digest(local), `${path}: wrong asset bytes (possibly HTML fallback)`);
    const type = response.headers.get('content-type') || '';
    if (/\.(jpg|jpeg|png|webp|svg)$/i.test(path)) assert.match(type, /^image\//, path);
    if (path.endsWith('.woff2')) assert.match(type, /font\/woff2|application\/font-woff2/, path);
    count++;
  }
}
await checkAssets('images');
await checkAssets('fonts');
console.log(`PASS: ${count} image/font files match build bytes and MIME types`);
console.log('PASS: production JavaScript and CSS are inline in the verified HTML (existing single-file build).');
console.log('HTTP/asset test only: run npm run smoke for React behavior. Hosted Supabase and Iranian network access require separate live checks.');
