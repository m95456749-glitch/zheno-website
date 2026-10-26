// Offline regression tests for the pure catalog write validation used
// by the admin product form and catalog service. No network, database
// or credentials are involved.

import { buildSync } from 'esbuild';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const code = buildSync({
  stdin: {
    contents: "export * from './src/services/catalogValidation';",
    resolveDir: root,
    sourcefile: 'catalog-validation-test-entry.ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  logLevel: 'silent',
}).outputFiles[0].text;

const validation = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);

const {
  MAX_DB_INTEGER,
  findSkuConflict,
  generateSku,
  isDbIntegerInRange,
  isValidSku,
  normalizeSku,
  validateProductForSave,
} = validation;

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`PASS: ${label}`);
}

function variant(productId, overrides = {}) {
  return {
    id: `${productId}-250`,
    productId,
    weight: '۲۵۰ گرم',
    weightGrams: 250,
    price: 200000,
    sku: 'ZJ-STR-250',
    stock: 25,
    available: true,
    ...overrides,
  };
}

function product(id, variants) {
  return {
    id,
    category: 'jelly',
    flavorId: 'strawberry-j',
    name: `Product ${id}`,
    shortName: id,
    categoryLabel: 'پودر ژله',
    variants,
  };
}

const existing = product('jelly-strawberry', [variant('jelly-strawberry')]);
const other = product('jelly-peach', [
  variant('jelly-peach', { id: 'jelly-peach-250', sku: 'ZJ-PCH-250' }),
]);

check('SKU normalization and format are stable', () => {
  assert.equal(normalizeSku(' zj-pom-250 '), 'ZJ-POM-250');
  assert.equal(isValidSku('ZJ-POM-250'), true);
  assert.equal(isValidSku('ZJ POM 250'), false);
  assert.equal(isValidSku('AB'), false);
});

check('automatic SKU keeps the existing convention', () => {
  assert.equal(generateSku('jelly', 'pomegranate', 250), 'ZJ-POM-250');
  assert.equal(generateSku('custard', 'banana', 250), 'ZC-BAN-250');
});

check('database integer range rejects values a PostgreSQL integer cannot hold', () => {
  assert.equal(isDbIntegerInRange(MAX_DB_INTEGER, 0), true);
  assert.equal(isDbIntegerInRange(MAX_DB_INTEGER + 1, 0), false);
  assert.equal(isDbIntegerInRange(1.5, 0), false);
  assert.equal(isDbIntegerInRange(-1, 0), false);
});

check('duplicate SKU detection is case-insensitive and ignores the same variant', () => {
  assert.equal(findSkuConflict([existing, other], ' zj-str-250 ')?.product.id, 'jelly-strawberry');
  assert.equal(findSkuConflict([existing, other], 'ZJ-STR-250', 'jelly-strawberry-250'), null);
  assert.equal(findSkuConflict([existing, other], 'ZJ-NEW-250'), null);
});

check('a valid edited product may keep its own SKU', () => {
  assert.equal(validateProductForSave(existing, [existing, other]), null);
});

check('a product without a variant is rejected before any write starts', () => {
  assert.equal(validateProductForSave(product('variantless', []), [existing]), 'product_has_no_variant');
});

check('another product cannot reuse an existing SKU', () => {
  const duplicate = product('new-product', [variant('new-product', { id: 'new-product-250' })]);
  assert.equal(validateProductForSave(duplicate, [existing, other]), 'duplicate_sku');
});

check('preserved extra variants are also checked for duplicate SKUs', () => {
  const edited = product('jelly-peach', [
    variant('jelly-peach', { id: 'jelly-peach-250', sku: 'ZJ-PCH-250' }),
    variant('jelly-peach', { id: 'jelly-peach-500', sku: ' zj-pch-250 ' }),
  ]);
  assert.equal(validateProductForSave(edited, [existing, other]), 'duplicate_sku_in_product');
});

check('invalid numeric values and mismatched variant ownership are rejected', () => {
  assert.equal(
    validateProductForSave(
      product('bad-price', [variant('bad-price', { id: 'bad-price-250', sku: 'ZJ-BAD-250', price: MAX_DB_INTEGER + 1 })]),
      [existing],
    ),
    'invalid_price',
  );
  assert.equal(
    validateProductForSave(
      product('bad-stock', [variant('bad-stock', { id: 'bad-stock-250', sku: 'ZJ-BST-250', stock: -1 })]),
      [existing],
    ),
    'invalid_stock',
  );
  assert.equal(
    validateProductForSave(
      product('bad-owner', [variant('someone-else', { id: 'bad-owner-250', sku: 'ZJ-OWN-250' })]),
      [existing],
    ),
    'variant_product_mismatch',
  );
});

console.log(`\nAll ${passed} catalog validation checks passed.`);
