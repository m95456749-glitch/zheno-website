// Disposable LOCAL test utilities. Never a production initializer or history repair.
import assert from 'node:assert/strict';

export function localImageTestUrl(raw) {
  assert.ok(raw, 'Set TEST_POSTGRES_URL to a disposable loopback PostgreSQL cluster.');
  const endpoint = new URL(raw);
  assert.ok(['postgres:', 'postgresql:'].includes(endpoint.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname), 'LOCAL test only.');
  assert.equal(endpoint.password, '', 'Use isolated local trust authentication, never credentials.');
  assert.ok([...endpoint.searchParams.keys()].every(key => key === 'sslmode'), 'No host overrides or connection options.');
  assert.ok([null, 'disable'].includes(endpoint.searchParams.get('sslmode')), 'This harness requires a TLS-disabled local cluster; never downgrade a TLS connection.');
  // Native initdb has ssl=off. CLI 2.117.0 requires TLS when this is omitted;
  // node-postgres does not. Explicit ONLY after all loopback guards pass.
  // Production runner retains mandatory sslmode=verify-full, unchanged.
  endpoint.searchParams.set('sslmode', 'disable');
  return endpoint;
}

export function localCliFailure(result) {
  const text = result.stderr ?? '';
  if (/server does not support SSL connections/i.test(text)) return 'local TLS mismatch: server ssl=off; explicit sslmode=disable required';
  if (/connection refused/i.test(text)) return 'local PostgreSQL is not listening';
  if (/read.only transaction/i.test(text)) return 'server rejected a write on a read-only connection';
  if (result.error?.code === 'ETIMEDOUT') return 'local CLI command timed out';
  if (result.error?.code === 'ENOENT') return 'pinned CLI executable missing';
  return `local CLI failed (exit ${result.status ?? 'none'}); raw output withheld`;
}

export const imageHarness = `
 create schema auth; create schema storage;
 create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function auth.uid() returns uuid language sql as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
 grant usage on schema auth,storage,public to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{"size":1024,"mimetype":"image/jpeg"}',unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to anon,authenticated;
 create schema supabase_migrations;
 create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text);
`;

// Synthetic catalog, NOT seed_catalog.sql. Fixed old timestamps and flags expose
// unwanted migration-time rewrites. IDs needed by shared regression assertions.
const ids = ['jelly-strawberry', 'custard-banana', 'jelly-orange', 'jelly-peach',
  ...Array.from({ length: 18 }, (_, i) => `fixture-${i + 1}`)];
export const syntheticImageCatalog = `
 insert into public.flavors(id,category,name,color,emoji)
 values('fixture-flavor','jelly','Local SQL fixture','#901020','');
 insert into public.products(id,category,flavor_id,name,short_name,category_label,image_url,featured,special,created_at,updated_at)
 values ${ids.map((id, i) => `('${id}','jelly','fixture-flavor','Fixture ${id}','Fixture ${i}','Fixture',
 'images/products/${id}.jpg',${i % 2 === 0},${i % 3 === 0},'2021-02-03T04:05:06Z','2023-07-08T09:10:11Z')`).join(',')};
`;

// Model the user-reported recorded baseline in the disposable harness ONLY.
// These fixture rows do not claim that seed SQL was executed during this test.
export const imageBaselineHistory = `
 insert into supabase_migrations.schema_migrations(version,name)
 values('20260912000000','initial_schema'),('20260912000001','seed_catalog');
`;
