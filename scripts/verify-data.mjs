// ============================================================
// ZHINO — product data consistency check (text-based, no build needed)
// Usage: node scripts/verify-data.mjs
// ============================================================

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/data/products.ts'), 'utf8');

let failures = 0;
const fail = (msg) => {
  console.error('FAIL: ' + msg);
  failures += 1;
};
const ok = (msg) => console.log('PASS: ' + msg);

// Official catalog (see task spec / README)
const expectedJelly = ['انار', 'توت فرنگی', 'هلو', 'تمشک', 'بلوبری', 'پرتقال', 'آناناس', 'آلبالو'];
const expectedCustard = ['موز', 'طالبی', 'توت فرنگی', 'کاکائو', 'هفت میوه', 'پرتقال', 'محلبی وانیلی'];

// Parse product blocks: id / category / flavorId / name / shortName
const productRe =
  /\{\s*id: '([^']+)',\s*category: '(jelly|custard)',\s*flavorId: '([^']+)',\s*name: '([^']+)',\s*shortName: '([^']+)',/g;
const products = [...src.matchAll(productRe)].map((m) => ({
  id: m[1],
  category: m[2],
  flavorId: m[3],
  name: m[4],
  shortName: m[5],
}));

const jelly = products.filter((p) => p.category === 'jelly');
const custard = products.filter((p) => p.category === 'custard');

if (products.length === 15) ok(`product count = 15`);
else fail(`expected 15 products, found ${products.length}`);

if (jelly.length === 8) ok('jelly count = 8');
else fail(`expected 8 jelly products, found ${jelly.length}`);

if (custard.length === 7) ok('custard count = 7');
else fail(`expected 7 custard products, found ${custard.length}`);

for (const name of expectedJelly) {
  if (jelly.some((p) => p.shortName.includes(name))) ok(`jelly flavor present: ${name}`);
  else fail(`missing jelly flavor: ${name}`);
}
for (const name of expectedCustard) {
  if (custard.some((p) => p.shortName.includes(name))) ok(`custard flavor present: ${name}`);
  else fail(`missing custard flavor: ${name}`);
}

// Standard weight + price: 250g / 200,000 Tomans for every variant
const priceCount = (src.match(/price: 200000/g) ?? []).length;
if (priceCount === 15) ok('all 15 variants priced at 200000');
else fail(`expected 15 variants at price 200000, found ${priceCount}`);

const gramsCount = (src.match(/weightGrams: 250/g) ?? []).length;
if (gramsCount === 15) ok('all 15 variants weigh 250g');
else fail(`expected 15 variants at 250g, found ${gramsCount}`);

const weightLabelCount = (src.match(/weight: '２５０ گرم'|weight: '۲۵۰ گرم'/g) ?? []).length;
if (weightLabelCount === 15) ok("all 15 variants labeled '۲۵۰ گرم'");
else fail(`expected 15 weight labels '۲۵۰ گرم', found ${weightLabelCount}`);

// Unique ids + SKUs
const ids = new Set(products.map((p) => p.id));
if (ids.size === products.length) ok('product ids are unique');
else fail('duplicate product ids detected');

const skus = [...src.matchAll(/sku: '([^']+)'/g)].map((m) => m[1]);
if (new Set(skus).size === skus.length && skus.length === 15) ok('SKUs are unique (15)');
else fail(`SKU problem: found ${skus.length} skus, ${new Set(skus).size} unique`);

// Every flavorId referenced by a product must exist in FLAVORS
const flavorIds = new Set(
  [...src.matchAll(/^\s{2}([a-z0-9-]+|'[a-z0-9-]+'): \{\s*$/gm)].map((m) => m[1].replace(/'/g, '')),
);
for (const p of products) {
  if (!flavorIds.has(p.flavorId)) fail(`product ${p.id} references unknown flavor ${p.flavorId}`);
}
if (failures === 0) ok('all product flavorIds resolve to FLAVORS entries');

// Shipping constants
if (src.includes('FREE_SHIPPING_THRESHOLD = 700000')) ok('free-shipping threshold = 700000');
else fail('FREE_SHIPPING_THRESHOLD is not 700000');

console.log(failures === 0 ? '\nAll data checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
