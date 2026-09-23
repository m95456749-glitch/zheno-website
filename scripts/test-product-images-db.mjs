import { syntheticImageCatalog } from './product-image-local-fixture.mjs';
// Actual PostgreSQL engine (PGlite), LOCAL ONLY. Auth JWT + Storage schemas are
// a harness, not a running Supabase service. No network or project credentials.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
async function suite() {
const db = new PGlite();
const sql = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url),'utf8');
let count = 0;
const ok = label => { count++; console.log(`PASS: ${label}`); };
const query = (text, params = []) => db.query(text, params);
const one = async text => (await query(text)).rows[0];
async function rejects(work, text) {
  await assert.rejects(work, e => e.message.includes(text)); ok(`rejects ${text}`);
}
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema storage;
  create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
  create function auth.uid() returns uuid language sql as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
  grant usage on schema auth, storage, public to anon, authenticated;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{"size":1024,"mimetype":"image/jpeg"}',unique(bucket_id,name));
  alter table storage.objects enable row level security;
  grant select,insert,update,delete on storage.objects to anon,authenticated;
`);
// PGlite has core gen_random_uuid but not the optional pgcrypto extension.
await db.exec(sql('20260912000000_initial_schema.sql').replace('create extension if not exists pgcrypto;',''));
await db.exec(syntheticImageCatalog); // No seed SQL replay.
const migration = sql('20260922000000_product_images_reliable_bootstrap.sql');
await db.exec(`create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
insert into supabase_migrations.schema_migrations(version,name) values('20260912000000','initial_schema'),('20260912000001','seed_catalog');`);
await db.exec(migration);
ok('standalone v3 from recorded catalog/seed only; zero buckets');
await db.exec(migration);
ok('second apply succeeds');
assert.equal((await one('select count(*)::int n from product_images')).n,22);
assert.equal((await one("select data_type from information_schema.columns where table_name='products' and column_name='id'")).data_type,'text');
assert.equal((await one("select data_type from information_schema.columns where table_name='product_images' and column_name='product_id'")).data_type,'text');
ok('22 mapped legacy rows; product and foreign key types are text');
const admin = `set role authenticated; set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"role":"admin"}}';`;
const ordinary = `set role authenticated; set request.jwt.claims = '{"app_metadata":{}}';`;
await db.exec(admin);
const pid = 'jelly-strawberry';
let url = 'images/products/jelly-strawberry.jpg';
const image = async n => {
  const id = `bbbbbbbb-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const path = `products/${pid}/${id}.jpg`;
  await query("insert into storage.objects(bucket_id,name) values('product-images',$1)",[path]);
  return { id, path, payload: { storage_path:path,storefront_url:`https://test.supabase.co/storage/v1/object/public/product-images/${path}`,
    width:800,height:600,mime_type:'image/jpeg',size_bytes:1024,alt_text:'عکس واقعی',make_primary:false } };
};
const rpc = async (action,id,payload={},expected=url,product=pid) =>
  (await query('select manage_product_image($1,$2,$3,$4,$5) result',[action,product,id,expected,{operation_id:randomUUID(),...payload}])).rows[0].result;
const a=await image(1);
await rpc('register',a.id,a.payload);
assert.equal((await one(`select image_url from products where id='${pid}'`)).image_url,url);
ok('adding an extra photo preserves primary');
await rpc('primary',a.id); url=a.payload.storefront_url;
assert.equal((await one(`select count(*)::int n from product_images where product_id='${pid}' and is_primary`)).n,1);
assert.equal((await one(`select image_url from products where id='${pid}'`)).image_url,url);
ok('primary RPC synchronizes storefront and gallery');
await rejects(()=>rpc('primary',a.id,{},url,'custard-banana'),'image_product_mismatch');
await rejects(()=>rpc('primary',a.id,{},'stale-url'),'image_conflict');
const b=await image(2);
await rejects(()=>rpc('register',b.id,{...b.payload,replace_id:a.id}),'replacement_requires_primary');
assert.equal((await one(`select count(*)::int n from product_images where id='${a.id}'`)).n,1);
ok('refused replacement preserves previous metadata and URL');
const replacement={...b.payload,make_primary:true,replace_id:a.id,operation_id:randomUUID()};const oldUrl=url;
await rpc('register',b.id,replacement); url=b.payload.storefront_url;
assert.equal((await one(`select count(*)::int n from product_images where id='${a.id}'`)).n,0);
assert.equal((await one(`select count(*)::int n from product_image_cleanup where storage_path='${a.path}'`)).n,1);
ok('replacement commits new primary and retirement together');
await rpc('register',b.id,replacement,oldUrl);
assert.equal((await one(`select count(*)::int n from product_images where id='${b.id}'`)).n,1);
ok('registration retry is idempotent after lost response');
assert.equal((await query('select retire_product_image_upload($1) allowed',[b.path])).rows[0].allowed,false);
ok('cleanup cannot retire a registered image');
// Storage behavior is exercised through SQL RLS, not through Supabase HTTP.
assert.equal((await query('delete from storage.objects where name=$1 returning id',[b.path])).rows.length,0);
assert.equal((await query('delete from storage.objects where name=$1 returning id',[a.path])).rows.length,1);
const claimed=(await query('select * from claim_product_image_cleanup(20)')).rows.find(j=>j.storage_path===a.path);
assert.equal((await query('select complete_product_image_cleanup($1,$2,true) done',[a.path,claimed.claim_id])).rows[0].done,true);
ok('Storage RLS protects live image, allows retired image; completion verified');
await rejects(()=>rpc('primary',a.id),'image_not_found');
await rejects(()=>query("insert into storage.objects(bucket_id,name) values('product-images',$1)",[a.path]),'row-level security');
await rpc('alt',b.id,{alt_text:'توضیح تازه'});
assert.equal((await one(`select alt_text from product_images where id='${b.id}'`)).alt_text,'توضیح تازه');
ok('alt metadata persists');
const legacy=(await query('select id from product_images where product_id=$1 and source=\'legacy\'',[pid])).rows[0];
await rpc('delete',legacy.id);
await rejects(()=>rpc('delete',b.id),'last_product_image');
assert.equal((await one(`select image_url from products where id='${pid}'`)).image_url,url);
const deletion={allow_empty:true,operation_id:randomUUID()};const beforeDelete=url;
const deleted=await rpc('delete',b.id,deletion); url=null;
assert.deepEqual(await rpc('delete',b.id,deletion,beforeDelete),deleted);
await rejects(()=>rpc('delete',b.id,{...deletion,allow_empty:false},beforeDelete),'image_operation_conflict');
ok('DELETE replay returns committed receipt; changed intent under same ID rejected');
assert.equal((await one(`select image_url from products where id='${pid}'`)).image_url,null);
ok('last-image deletion requires explicit consent, then clears URL atomically');
await rejects(()=>rpc('delete',b.id,{allow_empty:true}),'image_not_found');
// A product-form image change also obeys the gallery invariant.
await query("update products set image_url='   ' where id=$1",[pid]);
assert.equal((await one(`select image_url from products where id='${pid}'`)).image_url,null);
ok('blank product-form URL normalized to null');
await query("update products set image_url='https://example.org/photo.jpg' where id=$1",[pid]);
assert.equal((await one(`select count(*)::int n from product_images where product_id='${pid}' and is_primary and storefront_url='https://example.org/photo.jpg'`)).n,1);
ok('product form URL changes synchronize primary automatically');
await rejects(()=>query('update products set image_url=$1 where id=$2',[b.payload.storefront_url,pid]),'image_retired');
await db.exec(ordinary);
await rejects(()=>rpc('primary',legacy.id),'admin_required');
await rejects(()=>query('select retire_product_image_upload($1)',[a.path]),'admin_required');
await rejects(()=>query("insert into storage.objects(bucket_id,name) values('product-images','bad.jpg')"),'row-level security');
await rejects(()=>query("update product_images set alt_text='unauthorized'"),'permission denied');
ok('non-admin cannot mutate metadata, RPCs or Storage');
await db.exec('reset role');
// Ensure unrelated overly broad permissive policies do not bypass restrictive guards.
await db.exec('create policy broad_storage_write on storage.objects for all using(true) with check(true)');
await db.exec(ordinary);
await rejects(()=>query("insert into storage.objects(bucket_id,name) values('product-images','bad2.jpg')"),'row-level security');
await db.exec('reset role; set request.jwt.claims = \'{}\'; set role anon;');
assert.ok((await one('select count(*)::int n from product_images')).n>0);
ok('anonymous users can read active-product image metadata');
await db.exec('reset role');
await query("update products set active=false where id='custard-banana'");
await db.exec('set role anon');
assert.equal((await one("select count(*)::int n from product_images where product_id='custard-banana'")).n,0);
ok('anonymous metadata reads hide inactive products');
await db.exec('reset role');
const before=JSON.stringify((await query('select id,product_id,storefront_url,is_primary from product_images order by id')).rows);
await db.exec(migration);
const after=JSON.stringify((await query('select id,product_id,storefront_url,is_primary from product_images order by id')).rows);
assert.equal(after,before);
ok('third apply after uploads/deletions preserves gallery state');
await db.close();
console.log(`\n${count} local PostgreSQL checks passed (NOT remote Supabase).`);

}
await suite();
const drift = new PGlite();
await drift.exec('create table public.products(id uuid primary key default gen_random_uuid()); insert into public.products default values;');
await assert.rejects(drift.exec(readFileSync(new URL('../supabase/migrations/20260922000000_product_images_reliable_bootstrap.sql',import.meta.url),'utf8')), /products.id must be text/);
await drift.exec('rollback');
assert.equal((await drift.query('select count(*)::int n from products')).rows[0].n,1);
assert.equal((await drift.query("select to_regclass('public.product_images') t")).rows[0].t,null);
await drift.close();
console.log('PASS: unexpected real column type aborts before changes; original row preserved');
