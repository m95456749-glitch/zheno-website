// Actual two-session PostgreSQL contention, NOT PGlite or mocked transactions.
// Passwordless loopback only. No seed/v1/v2 execution, no Docker/Remote required.
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { localImageTestUrl, imageHarness, syntheticImageCatalog, imageBaselineHistory } from './product-image-local-fixture.mjs';

const endpoint=localImageTestUrl(process.env.TEST_POSTGRES_URL);
const root=new pg.Client({connectionString:endpoint.href});await root.connect();
const name='zhino_concurrency_'+randomUUID().replaceAll('-','');
const manifest=JSON.parse(readFileSync('supabase/product-image-migration-manifest.json','utf8'));
assert.equal(manifest.target,'20260922000000_product_images_reliable_bootstrap.sql');
const migration=readFileSync('supabase/migrations/'+manifest.target,'utf8');
const clients=[];let checks=0;
const pass=message=>{checks++;console.log('PASS: '+message);};
const fixtureAdmin='{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"role":"admin"}}';
async function begin(c,role='authenticated',claims=fixtureAdmin){
 await c.query('begin');await c.query(`set local role ${role}`);
 await c.query("select set_config('request.jwt.claims',$1,true),set_config('statement_timeout','8000',true)",[claims]);
}
const payload=p=>({operation_id:randomUUID(),...p});
const rpc=(c,action,imageId,expected,p={},product='jelly-strawberry')=>c.query(
 'select public.manage_product_image($1,$2,$3,$4,$5) result',[action,product,imageId,expected,p]);
const outcome=promise=>promise.then(result=>({result}),error=>({error}));
async function rollback(c){await c.query('rollback');}
try{
 await root.query(`do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;end $$;`);
 await root.query(`create database ${name}`);
 const address=new URL(endpoint);address.pathname='/'+name;
 for(let n=0;n<3;n++){const c=new pg.Client({connectionString:address.href});await c.connect();clients.push(c);}
 const [db,a,b]=clients;
 await db.query(imageHarness);
 await db.query(readFileSync('supabase/migrations/20260912000000_initial_schema.sql','utf8'));
 await db.query(syntheticImageCatalog);await db.query(imageBaselineHistory);
 await db.query(`update products set image_url=' https://legacy.example/old-photo.jpg ' where id='jelly-orange';
 update products set image_url='   ' where id='jelly-peach';
 create table audit_updates(product_id text);
 grant insert(product_id) on public.audit_updates to authenticated;
 create function public.test_v3_product_audit() returns trigger language plpgsql as $$ begin insert into public.audit_updates values(new.id);return new;end $$;
 create trigger custom_product_audit after update on public.products for each row execute function public.test_v3_product_audit();`);
 const products=async()=>(await db.query('select to_jsonb(p) v from public.products p order by id')).rows;
 const before=await products();await db.query(migration);assert.deepEqual(await products(),before);
 assert.equal((await db.query('select count(*)::int n from audit_updates')).rows[0].n,0);
 pass('PG17 standalone v3: zero buckets, raw/blank URLs and ALL product timestamps preserved; no UPDATE trigger fired');
 const pidA=(await a.query('select pg_backend_pid() n')).rows[0].n;
 const pidB=(await b.query('select pg_backend_pid() n')).rows[0].n;
 const url=async()=>(await db.query("select image_url from products where id='jelly-strawberry'")).rows[0].image_url;
 const audit=async()=>(await db.query('select count(*)::int n from audit_updates')).rows[0].n;
 const invariant=async()=>assert.equal((await db.query(`select count(*)::int n from products p where
  (select count(*) from product_images i where i.product_id=p.id and i.is_primary)
   <> case when p.image_url is null or btrim(p.image_url)='' then 0 else 1 end
  or exists(select 1 from product_images i where i.product_id=p.id and i.is_primary and i.storefront_url is distinct from p.image_url)`)).rows[0].n,0);
 async function blocked(){
  const until=Date.now()+4000;
  do {if((await db.query('select $1::int=any(pg_blocking_pids($2)) waiting',[pidA,pidB])).rows[0].waiting)return;
   await delay(10);
  }while(Date.now()<until);
  assert.fail('Expected actual B->A blocking was not observed; contention proof failed.');
 }
 async function settle(pending,errorPattern){
  await a.query('commit');const result=await pending;
  if(errorPattern){assert.ok(result.error,'Stale operation unexpectedly succeeded');assert.match(result.error.message,errorPattern);await rollback(b);}
  else {assert.equal(result.error,undefined);await b.query('commit');}
  await invariant();return result.result;
 }
 async function image(){
  const id=randomUUID(),path=`products/jelly-strawberry/${id}.jpg`;
  await db.query("insert into storage.objects(bucket_id,name) values('product-images',$1)",[path]);
  return {id,path,payload:payload({storage_path:path,storefront_url:`https://fixture.invalid/storage/v1/object/public/product-images/${path}`,
   width:800,height:600,mime_type:'image/jpeg',size_bytes:1024,alt_text:'Local fixture',make_primary:true})};
 }
 const legacy=(await db.query("select * from product_images where product_id='jelly-strawberry'")).rows[0];
 const x=await image(),y=await image();let current=await url();
 await begin(a);await rpc(a,'register',x.id,current,x.payload);await begin(b);
 let pending=outcome(rpc(b,'register',y.id,current,y.payload));await blocked();
 assert.equal((await db.query('select count(*)::int n from product_images where id=$1',[x.id])).rows[0].n,0);
 assert.equal(await url(),current);await settle(pending,/image_conflict/);
 assert.equal(await url(),x.payload.storefront_url);
 pass('genuine contention: competing primary registrations; uncommitted state invisible, stale writer rejected');

 const z=await image();z.payload.make_primary=false;current=await url();
 await begin(a);await rpc(a,'register',z.id,current,z.payload);await begin(b);
 pending=outcome(b.query('select retire_product_image_upload($1) retired',[z.path]));await blocked();
 assert.equal((await settle(pending)).rows[0].retired,false);
 assert.equal((await db.query('select count(*)::int n from storage.objects where name=$1',[z.path])).rows[0].n,1);
 pass('genuine contention: registration wins retirement race; committed live file cannot be retired');

 const retired=await image();current=await url();
 await begin(a);await a.query('select retire_product_image_upload($1)',[retired.path]);await begin(b);
 pending=outcome(rpc(b,'register',retired.id,current,retired.payload));await blocked();await settle(pending,/image_retired/);
 assert.equal((await db.query('select count(*)::int n from product_images where id=$1',[retired.id])).rows[0].n,0);
 pass('genuine contention: retirement wins; late registration rejected, no resurrected object reference');

 current=await url();await begin(a);await rpc(a,'primary',z.id,current,payload({}));await begin(b);
 pending=outcome(rpc(b,'primary',legacy.id,current,payload({})));await blocked();await settle(pending,/image_conflict/);
 assert.equal(await url(),z.payload.storefront_url);
 pass('genuine contention: competing primary selections keep exactly one matching primary');

 current=await url();await begin(a);await rpc(a,'delete',z.id,current,payload({}));await begin(b);
 pending=outcome(rpc(b,'primary',x.id,current,payload({})));await blocked();await settle(pending,/image_conflict/);
 assert.equal(await url(),legacy.storefront_url);
 assert.equal((await db.query('select count(*)::int n from product_image_cleanup where storage_path=$1',[z.path])).rows[0].n,1);
 pass('genuine contention: delete vs promotion; server fallback and retirement atomic');

 current=await url();const same=payload({});const updates=await audit();
 await begin(a);const first=await rpc(a,'delete',legacy.id,current,same);await begin(b);
 pending=outcome(rpc(b,'delete',legacy.id,current,same));await blocked();
 const replay=await settle(pending);assert.deepEqual(replay.rows,first.rows);
 assert.equal(await audit(),updates+1);assert.equal(await url(),x.payload.storefront_url);
 assert.equal((await db.query('select count(*)::int n from product_image_operations where operation_id=$1',[same.operation_id])).rows[0].n,1);
 pass('genuine contention: identical DELETE operation replays one durable receipt, only one product UPDATE');

 current=await url();const beforeLast=await products();await begin(a);
 await assert.rejects(rpc(a,'delete',x.id,current,payload({})),/last_product_image/);await rollback(a);
 assert.deepEqual(await products(),beforeLast);
 const last=payload({allow_empty:true});await begin(a);await rpc(a,'delete',x.id,current,last);await a.query('commit');
 const afterLast=await products();await begin(b);await rpc(b,'delete',x.id,current,last);await b.query('commit');
 assert.deepEqual(await products(),afterLast);assert.equal(await url(),null);await invariant();
 pass('last-image consent enforced; committed DELETE replay preserves every product timestamp');

 const raw=(await db.query("select * from product_images where product_id='jelly-orange'")).rows[0];
 await begin(a);await a.query("update products set image_url='https://legacy.example/new-photo.jpg' where id='jelly-orange'");await a.query('commit');
 await begin(a);await rpc(a,'primary',raw.id,'https://legacy.example/new-photo.jpg',payload({}),'jelly-orange');await a.query('commit');
 assert.equal((await db.query("select image_url from products where id='jelly-orange'")).rows[0].image_url,raw.storefront_url);
 assert.equal((await db.query("select count(*)::int n from product_images where product_id='jelly-orange'")).rows[0].n,2);
 await invariant();pass('real PG primary promotion preserves whitespace legacy URL exactly, without duplicate gallery row');

 for(let n=0;n<23;n++)await db.query('insert into product_image_cleanup(storage_path) values($1)',[`products/fixture/${randomUUID()}.jpg`]);
 const total=(await db.query('select count(*)::int n from product_image_cleanup where completed_at is null')).rows[0].n;
 await begin(a);const jobsA=(await a.query('select * from claim_product_image_cleanup(20)')).rows;
 await begin(b);const jobsB=(await b.query('select * from claim_product_image_cleanup(20)')).rows;
 assert.equal(jobsA.length,20);assert.equal(jobsB.length,Math.min(20,total-20));
 assert.equal(new Set([...jobsA,...jobsB].map(j=>j.storage_path)).size,jobsA.length+jobsB.length);
 await b.query('commit');await a.query('commit');
 pass('concurrent cleanup claimers skip actual locked rows; disjoint batches and no starvation behind leased jobs');

 const job=[...jobsA,...jobsB].find(j=>j.storage_path.startsWith('products/fixture/'));
 await db.query("update product_image_cleanup set lease_until=now()-interval '1 second',next_attempt_at=now()-interval '1 second' where storage_path=$1",[job.storage_path]);
 await begin(a);const next=(await a.query('select * from claim_product_image_cleanup(1)')).rows[0];assert.equal(next.storage_path,job.storage_path);
 await begin(b);pending=outcome(b.query('select complete_product_image_cleanup($1,$2,true) done',[job.storage_path,job.claim_id]));
 await blocked();assert.equal((await settle(pending)).rows[0].done,false);
 await begin(a);assert.equal((await a.query('select complete_product_image_cleanup($1,$2,true) done',[next.storage_path,next.claim_id])).rows[0].done,true);await a.query('commit');
 pass('genuine contention: expired-lease worker cannot complete newly claimed job; current claimant can');

 for(const role of ['anon','authenticated']){
  await begin(a,role,'{}');
  await assert.rejects(a.query('select claim_product_image_cleanup(20)'),role==='anon'?/permission denied/:/admin_required/);await rollback(a);
 }
 await begin(a);assert.equal((await a.query('delete from storage.objects where name=$1 returning id',[y.path])).rows.length,0);await a.query('commit');
 pass('native PG anon/nonadmin mutation rejection and Storage protection for unretired objects');

 const all=async()=>(await db.query(`select jsonb_build_object(
  'p',(select jsonb_agg(to_jsonb(p) order by id) from products p),
  'i',(select jsonb_agg(to_jsonb(i) order by id) from product_images i),
  'q',(select jsonb_agg(to_jsonb(q) order by storage_path) from product_image_cleanup q),
  'o',(select jsonb_agg(to_jsonb(o) order by operation_id) from product_image_operations o),
  'b',(select jsonb_agg(to_jsonb(b) order by id) from storage.buckets b),
  's',(select jsonb_agg(to_jsonb(s) order by id) from storage.objects s)) snapshot`)).rows;
 const finalSnapshot=await all(),auditCount=await audit();
 await db.query(migration);assert.deepEqual(await all(),finalSnapshot);assert.equal(await audit(),auditCount);
 await db.query(migration);assert.deepEqual(await all(),finalSnapshot);assert.equal(await audit(),auditCount);
 pass('FULL SQL reruns after actual races/cleanup preserve ALL products, URLs, timestamps, gallery, queue, receipts and objects');
 console.log(`\n${checks} v3 real PostgreSQL checks passed; seven observed lock-contention races plus simultaneous skip-locked claims. NOT hosted Storage.`);
}finally{
 // Each connection closes (rolling back any failed transaction) before database removal.
 for(const c of clients)await c.end();
 await root.query(`drop database if exists ${name}`);await root.end();
}
