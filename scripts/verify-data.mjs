// ============================================================
// ZHINO — product data consistency check (text-based, no build needed)
// Usage: node scripts/verify-data.mjs
// ============================================================

import { existsSync, readFileSync } from 'node:fs';
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
const expectedJelly = ['انار', 'توت فرنگی', 'هلو', 'تمشک', 'بلوبری', 'پرتقال', 'آناناس', 'آلبالو', 'هندوانه', 'طالبی', 'شاتوت', 'انبه', 'انگور', 'کیوی', 'لیمو'];
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

if (products.length === 22) ok(`product count = 22`);
else fail(`expected 22 products, found ${products.length}`);

if (jelly.length === 15) ok('jelly count = 15');
else fail(`expected 15 jelly products, found ${jelly.length}`);

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
if (priceCount === 22) ok('all 22 variants priced at 200000');
else fail(`expected 22 variants at price 200000, found ${priceCount}`);

const gramsCount = (src.match(/weightGrams: 250/g) ?? []).length;
if (gramsCount === 22) ok('all 22 variants weigh 250g');
else fail(`expected 22 variants at 250g, found ${gramsCount}`);

const weightLabelCount = (src.match(/weight: '２５０ گرم'|weight: '۲۵۰ گرم'/g) ?? []).length;
if (weightLabelCount === 22) ok("all 22 variants labeled '۲۵۰ گرم'");
else fail(`expected 22 weight labels '۲۵۰ گرم', found ${weightLabelCount}`);

// Unique ids + SKUs
const ids = new Set(products.map((p) => p.id));
if (ids.size === products.length) ok('product ids are unique');
else fail('duplicate product ids detected');

const skus = [...src.matchAll(/sku: '([^']+)'/g)].map((m) => m[1]);
if (new Set(skus).size === skus.length && skus.length === 22) ok('SKUs are unique (22)');
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

// Official terminology: «پودر کاستر» — the spelling «کاستارد» is banned
if (!src.includes('کاستارد')) ok("no «کاستارد» anywhere — «پودر کاستر» used throughout");
else fail('found «کاستارد» — must be «کاستر» everywhere');

// Custard products must be labeled «پودر کاستر»
const kasterLabels = (src.match(/categoryLabel: 'پودر کاستر'/g) ?? []).length;
if (kasterLabels === 7) ok("all 7 custard products labeled 'پودر کاستر'");
else fail(`expected 7 'پودر کاستر' labels, found ${kasterLabels}`);

// ────────────────────────────────────────────────────────────
// Product ↔ real photo mapping
//
// Each jelly photograph carries the flavor name printed on the glass
// («ژله انار», «ژله بلوبری», …). That baked-in label — not the filename —
// is the ground truth, and each mapping below was confirmed by visually
// inspecting the photo. Custard has no production photography yet, so
// those products intentionally carry no imageUrl and fall back to the
// catalog-driven plated visual in ProductVisual.
//
// Season-2 notes (owner-confirmed, do not "fix"):
//  • jelly-cantaloupe uses the photo whose packet prints «ژله خربزه» —
//    the store sells this melon packet under the name «طالبی».
//  • jelly-mulberry uses the photo whose packet prints «ژله توت سیاه» —
//    «توت سیاه» and «شاتوت» are the same fruit (mulberry).
// ────────────────────────────────────────────────────────────
const expectedImages = {
  'jelly-pomegranate': 'images/products/jelly-pomegranate.jpg',
  'jelly-strawberry': 'images/products/jelly-strawberry.jpg',
  'jelly-peach': 'images/products/jelly-peach.jpg',
  'jelly-raspberry': 'images/products/jelly-raspberry.jpg',
  'jelly-blueberry': 'images/products/jelly-blueberry.jpg',
  'jelly-orange': 'images/products/jelly-orange.jpg',
  'jelly-pineapple': 'images/products/jelly-pineapple.jpg',
  'jelly-sour-cherry': 'images/products/jelly-sour-cherry.jpg',
  'jelly-watermelon': 'images/products/jelly-watermelon.jpg',
  'jelly-cantaloupe': 'images/products/jelly-cantaloupe.jpg',
  'jelly-mulberry': 'images/products/jelly-mulberry.jpg',
  'jelly-mango': 'images/products/jelly-mango.jpg',
  'jelly-grape': 'images/products/jelly-grape.jpg',
  'jelly-kiwi': 'images/products/jelly-kiwi.jpg',
  'jelly-lemon': 'images/products/jelly-lemon.jpg',
};

// Pull the imageUrl declared inside each product block
const declaredImages = new Map();
for (const m of src.matchAll(/\n  \{\n\s*id: '([^']+)',[\s\S]*?(?=\n  \},)/g)) {
  const block = m[0];
  const img = block.match(/imageUrl: '([^']*)'/);
  declaredImages.set(m[1], img ? img[1] : undefined);
}

for (const [id, expected] of Object.entries(expectedImages)) {
  const actual = declaredImages.get(id);
  if (actual === expected) ok(`${id} → ${expected}`);
  else fail(`${id} should map to ${expected}, found ${actual ?? '(none)'}`);

  const file = join(root, 'public', expected);
  if (existsSync(file)) ok(`photo exists on disk: public/${expected}`);
  else fail(`missing photo file: public/${expected}`);
}

// Photos must be one-to-one: no two products may share the same picture
const usedImages = [...declaredImages.values()].filter(Boolean);
if (new Set(usedImages).size === usedImages.length)
  ok('every product photo is used by exactly one product');
else fail('the same photo is assigned to more than one product');

// Custard products must NOT invent photography they do not have
const custardWithImages = custard.filter((p) => declaredImages.get(p.id));
if (custardWithImages.length === 0)
  ok('no custard product claims a photo (plated fallback is used)');
else fail(`custard products must not have images: ${custardWithImages.map((p) => p.id).join(', ')}`);

// Nothing may still point at the old unsorted camera filenames
if (!src.includes('images/IMG_')) ok('no legacy IMG_* paths remain in the catalog');
else fail('catalog still references legacy images/IMG_* paths');

console.log(failures === 0 ? '\nAll data checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
