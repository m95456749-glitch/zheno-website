import { syntheticImageCatalog } from './product-image-local-fixture.mjs';
// API v3 SECURITY and data-preservation regressions. Disposable PGlite only.
// Initial schema runs ONCE per empty fixture; seed/v1/v2 never execute.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const read=file=>readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8');
const final=read('20260922000000_product_images_reliable_bootstrap.sql');
const admin=`reset role;set role authenticated;set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"role":"admin"}}';`;
const anon=`reset role;set request.jwt.claims='{}';set role anon;`;
const ordinary=`reset role;set request.jwt.claims='{}';set role authenticated;`;
let count=0;
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function auth.uid() returns uuid language sql as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
 grant usage on schema auth,storage,public to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{"size":1024,"mimetype":"image/jpeg"}',unique(bucket_id,name));
 alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to anon,authenticated;
 create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
 insert into supabase_migrations.schema_migrations(version,name) values('20260912000000','initial_schema'),('20260912000001','seed_catalog');`);
 await db.exec(read('20260912000000_initial_schema.sql').replace('create extension if not exists pgcrypto;',''));
 await db.exec(syntheticImageCatalog); // No seed SQL replay.
 return db;
}
async function check(name,fn){const db=await fixture();try{await fn(db);console.log('PASS: '+name);count++;}finally{await db.close();}}
const rows=async(db,sql,params=[])=> (await db.query(sql,params)).rows;
const products=db=>rows(db,'select to_jsonb(p) v from public.products p order by id');
const images=db=>rows(db,'select to_jsonb(i) v from public.product_images i order by id');
async function fails(db,pattern){await assert.rejects(db.exec(final),pattern);await db.exec('rollback');}
const request=(extra={})=>({operation_id:randomUUID(),...extra});
const rpc=(db,action,i,payload=request(),expected=i.storefront_url)=>db.query('select public.manage_product_image($1,$2,$3,$4,$5) result',[action,i.product_id,i.id,expected,payload]);
await check('zero-bucket installation preserves ALL product fields/raw URLs/timestamps; UPDATE audit stays empty',async db=>{
 await db.exec(`update products set image_url='   ' where id='jelly-peach';
 update products set image_url=' https://legacy.example/photo.jpg ' where id='jelly-orange';
 create table public.audit_updates(id text);
 create function public.test_product_audit() returns trigger language plpgsql as $$ begin insert into public.audit_updates values(new.id);return new;end $$;
 create trigger custom_product_audit after update on public.products for each row execute function public.test_product_audit();`);
 const before=await products(db);await db.exec(final);assert.deepEqual(await products(db),before);
 const gallery=await images(db);
 const all=async()=>({products:await products(db),gallery:await images(db),buckets:await rows(db,'select to_jsonb(b) v from storage.buckets b order by id'),
   queue:await rows(db,'select to_jsonb(q) v from product_image_cleanup q order by storage_path'),
   ops:await rows(db,'select to_jsonb(o) v from product_image_operations o order by operation_id'),
   contract:await rows(db,'select * from product_image_contract')});
 const snapshot=await all();await db.exec(final);assert.deepEqual(await all(),snapshot);await db.exec(final);assert.deepEqual(await all(),snapshot);
 assert.equal((await rows(db,'select * from audit_updates')).length,0);
 assert.equal(gallery.filter(({v})=>v.product_id==='jelly-orange'&&v.is_primary)[0].v.storefront_url,' https://legacy.example/photo.jpg ');
 const [bucket]=await rows(db,"select * from storage.buckets where id='product-images'");
 assert.equal(bucket.public,true);assert.equal(bucket.file_size_limit,8388608);
 assert.deepEqual(bucket.allowed_mime_types,['image/jpeg','image/png','image/webp','image/avif','image/gif']);
});
await check('full reruns after primary/alt/deletion preserve EVERY current field and receipt timestamp',async db=>{
 await db.exec(final);const [i]=await rows(db,"select * from product_images where product_id='jelly-strawberry'");
 await db.exec(admin);await rpc(db,'alt',i,request({alt_text:'ویرایش واقعی'}));
 await rpc(db,'delete',i,request({allow_empty:true}));await db.exec('reset role');
 await db.exec("insert into product_image_cleanup(storage_path,completed_at) values('old-done.jpg',now()),('old-pending.jpg',null)");
 const snap=async()=>({p:await products(db),i:await images(db),q:await rows(db,'select to_jsonb(q) v from product_image_cleanup q order by storage_path'),
   o:await rows(db,'select to_jsonb(o) v from product_image_operations o order by operation_id')});
 const before=await snap();await db.exec(final);assert.deepEqual(await snap(),before);await db.exec(final);assert.deepEqual(await snap(),before);
});
await check('private bucket aborts BEFORE creation; no product/bucket/history change',async db=>{
 await db.exec("insert into storage.buckets(id,name,public) values('product-images','product-images',false)");
 const before=await products(db);await fails(db,/bucket is private/);assert.deepEqual(await products(db),before);
 assert.equal((await rows(db,"select public from storage.buckets where id='product-images'"))[0].public,false);
 assert.equal((await rows(db,"select to_regclass('public.product_images') t"))[0].t,null);
 assert.equal((await rows(db,'select count(*)::int n from supabase_migrations.schema_migrations'))[0].n,2);
});
await check('unexpected recorded predecessor rejected, WITHOUT executing its SQL',async db=>{
 await db.exec("insert into supabase_migrations.schema_migrations(version,name) values('20260919000000','product_images')");
 await fails(db,/unsupported migration history/);assert.equal((await rows(db,'select count(*)::int n from storage.buckets'))[0].n,0);
});
await check('partial gallery is refused rather than guessed/repaired',async db=>{
 await db.exec('create table public.product_images(id uuid primary key,product_id text);insert into product_images values(gen_random_uuid(),\'preserve-me\')');
 const before=await images(db);await fails(db,/incompatible column/);assert.deepEqual(await images(db),before);
});
for(const [label,sql,pattern] of [
 ['wrong same-name index','drop index product_images_one_primary;create index product_images_one_primary on product_images(is_primary)',/incompatible index/],
 ['missing required column','alter table product_images drop column width',/incompatible column/],
 ['changed cleanup column type','alter table product_image_cleanup alter column attempt_count type bigint',/schema\/security drift/],
 ['changed RPC grant','grant execute on function public.manage_product_image(text,text,uuid,text,jsonb) to anon',/schema\/security drift/],
 ['unknown private gallery column',"alter table product_images add column private_note text default 'internal-only'",/unreviewed gallery column/],
 ['missing primary key','alter table product_images drop constraint product_images_pkey',/schema\/security drift/],
 ['missing UUID default','alter table product_images alter column id drop default',/schema\/security drift/],
 ['changed bucket configuration',"update storage.buckets set file_size_limit=123 where id='product-images'",/schema\/security drift/],
 ['unknown trigger',"create function public.test_image_trigger() returns trigger language plpgsql as $$ begin raise exception 'must_not_fire';end $$;create trigger custom_image_trigger before update on product_images for each row execute function public.test_image_trigger()",/unreviewed gallery trigger/],
 ['unknown rule','create rule custom_image_rule as on update to product_images do also notify custom_gallery_event',/unreviewed gallery rule/],
]) await check(`${label}: rerun fails closed, product/gallery data unchanged`,async db=>{
 await db.exec(final);await db.exec(sql);const p=await products(db),i=await images(db);
 await fails(db,pattern);assert.deepEqual(await products(db),p);assert.deepEqual(await images(db),i);
});
await check('hostile default table/column/function permissions are revoked on initial installation',async db=>{
 await db.exec('alter default privileges in schema public grant all on tables to public,anon,authenticated;alter default privileges in schema public grant execute on functions to anon,authenticated;');
 await db.exec(final);
 for(const r of ['anon','authenticated'])for(const t of ['product_images','product_image_cleanup','product_image_operations','product_image_contract']){
  assert.equal((await rows(db,"select has_table_privilege($1,$2,'TRUNCATE,UPDATE,INSERT,DELETE') b",[r,'public.'+t]))[0].b,false);
 }
 await db.exec(admin);await assert.rejects(db.exec('truncate public.product_images'),/permission denied/);
 await assert.rejects(db.exec('select * from public.product_image_operations'),/permission denied/);
});
await check('inherited unsafe defaults cause atomic rollback, not a permissive installation',async db=>{
 await db.exec('create role inherited_gallery_writer;grant inherited_gallery_writer to anon;alter default privileges in schema public grant truncate on tables to inherited_gallery_writer;');
 const before=await products(db);await fails(db,/inherited\/remaining write privileges/);assert.deepEqual(await products(db),before);
 assert.equal((await rows(db,"select to_regclass('public.product_images') t"))[0].t,null);
 assert.equal((await rows(db,'select count(*)::int n from storage.buckets'))[0].n,0);
});
await check('runtime restrictive guards survive broad policies; inactive data/receipts remain hidden',async db=>{
 await db.exec(final);await db.exec("update products set active=false where id='jelly-strawberry'");
 await db.exec(`grant all on product_images,product_image_operations,product_image_contract to anon,authenticated;
 create policy accidental_all on product_images for all to anon,authenticated using(true) with check(true);
 create policy accidental_ops on product_image_operations for all to anon,authenticated using(true) with check(true);
 create policy accidental_contract on product_image_contract for all to anon,authenticated using(true) with check(true);`);
 await db.exec(anon);
 assert.equal((await rows(db,"select * from product_images where product_id='jelly-strawberry'")).length,0);
 assert.equal((await rows(db,'select * from product_image_contract')).length,0);
 await db.exec(admin);assert.equal((await rows(db,"update product_images set alt_text='blocked' returning id")).length,0);
 await db.exec(ordinary);await assert.rejects(db.exec('select claim_product_image_cleanup(20)'),/admin_required/);
 await assert.rejects(db.exec('select public.product_image_api_version()'),/admin_required/);
 await db.exec(anon);await assert.rejects(db.exec('select public.product_image_api_version()'),/permission denied/);
});
await check('other buckets keep their own policies; live and legacy references cannot be deleted',async db=>{
 await db.exec(final);await db.exec("insert into storage.buckets(id,name,public) values('other','other',true);create policy other_access on storage.objects for all to anon using(bucket_id='other') with check(bucket_id='other');");
 await db.exec(anon);await db.exec("insert into storage.objects(bucket_id,name) values('other','first');update storage.objects set name='second' where bucket_id='other'");
 assert.equal((await rows(db,"delete from storage.objects where bucket_id='other' returning name"))[0].name,'second');
 await assert.rejects(db.exec("insert into storage.objects(bucket_id,name) values('product-images','bad.jpg')"),/row-level security/);
 await db.exec('reset role');const path='products/jelly-strawberry/aaaaaaaa-0000-4000-8000-000000000021.jpg';
 await db.query('update products set image_url=$1 where id=$2',['https://external.example/'+path,'jelly-strawberry']);
 await db.exec(admin);assert.equal((await rows(db,'select retire_product_image_upload($1) b',[path]))[0].b,false);
 await db.query("insert into storage.objects(bucket_id,name) values('product-images',$1)",[path]);
 assert.equal((await rows(db,'delete from storage.objects where name=$1 returning id',[path])).length,0);
});
await check('URL escaping/query variants protect referenced bytes conservatively',async db=>{
 await db.exec(final);const path='products/p/aaaaaaaa-0000-4000-8000-000000000099.jpg';
 for(const url of ['https://x/'+path,'https://x/'+path.replaceAll('/','%2F'),'https://x/'+path.replaceAll('/','%252F')+'?token=not-a-real-token'])
  assert.equal((await rows(db,'select public.product_image_url_references($1,$2) b',[url,path]))[0].b,true);
});
await check('temporary shadows cannot redirect data/authorization; private core RPC stays inaccessible',async db=>{
 await db.exec(final);const [i]=await rows(db,"select * from public.product_images where product_id='jelly-strawberry'");
 await db.exec('create temporary table product_images(id text);create temporary table products(id text);create function pg_temp.is_admin() returns boolean language sql as $$ select true $$;set search_path=pg_temp,public;');
 await db.exec(ordinary);await assert.rejects(db.exec('select public.product_image_api_version()'),/admin_required/);
 await db.exec(admin);await rpc(db,'alt',i,request({alt_text:'safe shadow'}));
 assert.equal((await rows(db,'select alt_text from public.product_images where id=$1',[i.id]))[0].alt_text,'safe shadow');
 await assert.rejects(db.query('select public.execute_product_image_operation($1,$2,$3,$4,$5)',['delete',i.product_id,i.id,i.storefront_url,{}]),/permission denied/);
});
await check('leased cleanup: backoff, healthy job 21, expired claim fencing, and replayable completion',async db=>{
 await db.exec(final);
 for(let n=1;n<=21;n++)await db.query('insert into product_image_cleanup(storage_path) values($1)',[`products/p/aaaaaaaa-0000-4000-8000-${String(n).padStart(12,'0')}.jpg`]);
 await db.exec(admin);const jobs=await rows(db,'select * from claim_product_image_cleanup(20)');assert.equal(jobs.length,20);
 assert.equal((await rows(db,'select count(*)::int n from claim_product_image_cleanup(20)'))[0].n,1);
 for(const j of jobs)assert.equal((await rows(db,'select complete_product_image_cleanup($1,$2,false) b',[j.storage_path,j.claim_id]))[0].b,false);
 assert.equal((await rows(db,'select count(*)::int n from claim_product_image_cleanup(20)'))[0].n,0);
 assert.equal((await rows(db,'select bool_and(attempt_count=1 and next_attempt_at>now()) b from product_image_cleanup'))[0].b,true);
 const j=jobs[0];await db.exec('reset role');await db.query("update product_image_cleanup set lease_until=now()-interval '1 second',next_attempt_at=now()-interval '1 second' where storage_path=$1",[j.storage_path]);
 await db.exec(admin);const [next]=await rows(db,'select * from claim_product_image_cleanup(20)');assert.notEqual(next.claim_id,j.claim_id);
 assert.equal((await rows(db,'select complete_product_image_cleanup($1,$2,true) b',[j.storage_path,j.claim_id]))[0].b,false);
 assert.equal((await rows(db,'select complete_product_image_cleanup($1,$2,true) b',[next.storage_path,next.claim_id]))[0].b,true);
 assert.equal((await rows(db,'select complete_product_image_cleanup($1,$2,true) b',[next.storage_path,next.claim_id]))[0].b,true);
});
await check('cleanup cannot accept success while object exists; completed paths stay retired',async db=>{
 await db.exec(final);const path='products/p/aaaaaaaa-0000-4000-8000-000000000071.jpg';
 await db.query("insert into storage.objects(bucket_id,name) values('product-images',$1)",[path]);
 await db.exec(admin);await db.query('select retire_product_image_upload($1)',[path]);
 const [j]=await rows(db,'select * from claim_product_image_cleanup(20)');
 assert.equal((await rows(db,'select complete_product_image_cleanup($1,$2,true) b',[path,j.claim_id]))[0].b,false);
 await db.query('delete from storage.objects where name=$1',[path]);
 await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('product-images',$1)",[path]),/row-level security/);
});
console.log(`\n${count} v3 migration safety checks passed — LOCAL PGlite, NOT hosted Supabase.`);
