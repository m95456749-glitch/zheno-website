// Real Supabase CLI + disposable LOCAL PostgreSQL. Auth/Storage are test schemas,
// not hosted Supabase. Never point this at an SSH tunnel or a production database.
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { localImageTestUrl, localCliFailure, imageHarness, syntheticImageCatalog, imageBaselineHistory } from './product-image-local-fixture.mjs';

const endpoint = localImageTestUrl(process.env.TEST_POSTGRES_URL);
const supplied = endpoint.href;
const cli = 'supabase';
const manifest = JSON.parse(readFileSync('supabase/product-image-migration-manifest.json', 'utf8'));
const source = name => readFileSync(`supabase/migrations/${name}`, 'utf8');
let checks = 0;
const pass = label => { checks++; console.log(`PASS: ${label}`); };
const command = args => spawnSync(cli, args, { encoding: 'utf8', timeout: 120000,
  env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && !key.startsWith('SUPABASE_'))) });
assert.equal(command(['--version']).stdout.trim(), manifest.cli_version);
const admin = new pg.Client({ connectionString: supplied });
await admin.connect();
// Roles are cluster-wide, test-only. Never alter an existing role or delete it.
await admin.query(`do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;`);
try {
 for (const scenario of ['standalone', 'private-bucket']) {
  const name = 'zhino_test_' + randomUUID().replaceAll('-', '');
  await admin.query(`create database ${name}`);
  const address = new URL(supplied); address.pathname = '/' + name;
  const db = new pg.Client({ connectionString: address.href });
  const work = mkdtempSync(join(tmpdir(), 'zhino-cli-test-'));
  try {
   await db.connect(); await db.query(imageHarness);
   const baseline = [...manifest.required_baseline];
   // Existing catalog schema, then synthetic test rows. NEVER execute seed/v1/v2.
   await db.query(source('20260912000000_initial_schema.sql'));
   await db.query(syntheticImageCatalog);
   await db.query(imageBaselineHistory);
   if (scenario === 'private-bucket') await db.query("insert into storage.buckets(id,name,public) values('product-images','product-images',false)");
   const products = async () => (await db.query('select to_jsonb(p) v from products p order by id')).rows;
   const history = async () => (await db.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r => r.version);
   const before = await products(); const oldHistory = await history();
   mkdirSync(join(work,'supabase/migrations'), { recursive: true });
   copyFileSync('supabase/config.toml', join(work,'supabase/config.toml'));
   for (const file of [...baseline,manifest.target]) copyFileSync('supabase/migrations/'+file,join(work,'supabase/migrations',file));
   const readOnly = new URL(address); readOnly.searchParams.set('options','-c default_transaction_read_only=on');
   const result = args => command([...args,'--workdir',work]);
   if (scenario === 'standalone') {
    assert.equal((await db.query('show ssl')).rows[0].ssl,'off');
    const missingTls = new URL(readOnly);missingTls.searchParams.delete('sslmode');
    const control = result(['migration','list','--db-url',missingTls.href]);
    assert.notEqual(control.status,0,'Diagnostic must reproduce the original missing-sslmode failure.');
    assert.match(control.stderr,/server does not support SSL connections/i);
    assert.deepEqual(await products(),before);assert.deepEqual(await history(),oldHistory);
    pass('controlled regression: missing sslmode reproduces TLS mismatch, without executing migration SQL');
   }
   const list = result(['migration','list','--db-url',readOnly.href]);
   assert.equal(list.status,0,`Actual CLI migration list: ${localCliFailure(list)}`);
   const dry = result(['db','push','--dry-run','--skip-vault','--db-url',readOnly.href]);
   assert.equal(dry.status,0,`Actual CLI dry-run: ${localCliFailure(dry)}`);
   assert.deepEqual(await products(),before);assert.deepEqual(await history(),oldHistory);
   pass(`${scenario}: real CLI list/dry-run with server-enforced read-only default, no data/history changes`);
   const prohibited = result(['db','push','--skip-vault','--db-url',readOnly.href,'--yes']);
   assert.notEqual(prohibited.status,0,'Read-only server default must reject an attempted CLI apply.');
   assert.deepEqual(await products(),before);assert.deepEqual(await history(),oldHistory);
   pass(`${scenario}: actual write attempt through read-only CLI connection is rejected without data/history changes`);
   const pushed = result(['db','push','--skip-vault','--db-url',address.href,'--yes']);
   if (scenario === 'private-bucket') {
    assert.notEqual(pushed.status,0);assert.deepEqual(await products(),before);assert.deepEqual(await history(),oldHistory);
    assert.equal((await db.query("select public from storage.buckets where id='product-images'")).rows[0].public,false);
    assert.equal((await db.query("select to_regclass('public.product_images') as t")).rows[0].t,null);
    pass('actual CLI apply failure: private bucket unchanged, product data preserved, no partial table/history');
   } else {
    assert.equal(pushed.status,0,`Actual CLI apply: ${localCliFailure(pushed)}`);
    assert.deepEqual(await products(),before);
    assert.deepEqual(await history(),[...oldHistory,manifest.target.slice(0,14)].sort());
    const receipt = (await db.query(readFileSync('supabase/check-product-image-upgrade.sql','utf8'))).rows[0].json_build_object;
    assert.equal(Object.keys(receipt).length,10);assert.ok(Object.values(receipt).every(value => value===true));
    pass(`${scenario}: full migration applied via real CLI, all 10 postconditions true, history correct, products byte-equivalent JSON`);
    const listed = result(['migration','list','--db-url',readOnly.href]);
    assert.equal(listed.status,0,localCliFailure(listed));
    assert.ok(listed.stdout.includes(manifest.target.slice(0,14)));
    pass('real CLI migration list AFTER installation succeeds; exact recorded versions verified');
    const gallery = (await db.query('select to_jsonb(i) v from product_images i order by id')).rows;
    const again = result(['db','push','--skip-vault','--db-url',address.href,'--yes']);
    assert.equal(again.status,0);assert.deepEqual(await products(),before);
    assert.deepEqual((await db.query('select to_jsonb(i) v from product_images i order by id')).rows,gallery);
    pass(`${scenario}: repeated CLI push is a no-op; gallery IDs/timestamps and products unchanged`);
    const snapshot = async () => (await db.query(`select jsonb_build_object(
      'products',(select jsonb_agg(to_jsonb(p) order by id) from products p),
      'gallery',(select jsonb_agg(to_jsonb(i) order by id) from product_images i),
      'buckets',(select jsonb_agg(to_jsonb(b) order by id) from storage.buckets b),
      'queue',(select jsonb_agg(to_jsonb(q) order by storage_path) from product_image_cleanup q),
      'operations',(select jsonb_agg(to_jsonb(o) order by operation_id) from product_image_operations o)) state`)).rows;
    const fullBefore=await snapshot();
    await db.query(source(manifest.target));assert.deepEqual(await snapshot(),fullBefore);
    await db.query(source(manifest.target));assert.deepEqual(await snapshot(),fullBefore);
    pass('second and third FULL SQL execution via PG17 preserve every row field/timestamp (not CLI skipping)');
   }
  } finally {
   await db.end();rmSync(work,{ recursive: true, force: true });
   // name is generated locally, never a caller-provided database identifier.
   await admin.query(`drop database ${name}`);
  }
 }
} finally { await admin.end(); }
console.log(`\n${checks} real CLI/LOCAL PostgreSQL checks passed. NOT Remote Supabase.`);
