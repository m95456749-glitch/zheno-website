-- ZHINO Supabase verification queries
-- Run this in Supabase Dashboard -> SQL Editor after applying the two
-- migrations in filename order. This file is read-only and contains no secrets.

-- 1. Tables and RLS
select
  t.tablename as table_name,
  t.rowsecurity as rls_enabled
from pg_tables t
where t.schemaname = 'public'
  and t.tablename in (
    'flavors', 'products', 'product_variants', 'inventory',
    'recipes', 'site_content', 'site_settings', 'orders', 'order_items',
    'product_images'
  )
order by t.tablename;

-- 2. Foreign-key relationships
select
  tc.table_name,
  kcu.column_name,
  ccu.table_name as references_table,
  ccu.column_name as references_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
order by tc.table_name, kcu.column_name;

-- 3. Indexes created by the migration
select tablename, indexname
from pg_indexes
where schemaname = 'public'
  and tablename in ('products', 'product_variants', 'inventory', 'recipes', 'orders', 'order_items', 'product_images')
order by tablename, indexname;

-- 4. RLS policies
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 5. RPC functions
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_admin', 'set_inventory_stock', 'adjust_inventory', 'create_order', 'set_primary_product_image')
order by p.proname, arguments;

-- 6. Enum values
select t.typname as enum_name, e.enumlabel as value
from pg_type t
join pg_enum e on e.enumtypid = t.oid
where t.typnamespace = 'public'::regnamespace
  and t.typname in ('product_category', 'order_status', 'shipping_method')
order by t.typname, e.enumsortorder;

-- 7. Seed counts and required image-path shape
select
  (select count(*) from public.flavors) as flavors,
  (select count(*) from public.products) as products,
  (select count(*) from public.product_variants) as variants,
  (select count(*) from public.inventory) as inventory_rows,
  (select count(*) from public.recipes) as recipes,
  (select count(*) from public.site_content) as content_rows,
  (select count(*) from public.site_settings) as settings_rows,
  (select count(*) from public.products where image_url like 'images/products/%') as product_image_paths;

-- Expected seed counts: 22, 22, 22, 22, 2, 5, 1, 22.
select id, name, image_url
from public.products
order by id;

-- 8. Product image gallery (migration 20260919000000_product_images.sql)
-- Registered legacy photos must equal the number of products that carry
-- an image_url, and no product may have two primary images.
select
  (select count(*) from public.product_images) as image_rows,
  (select count(*) from public.product_images where source = 'legacy') as legacy_rows,
  (select count(*) from public.product_images where source = 'upload') as uploaded_rows,
  (select count(*) from public.product_images where is_primary) as primary_rows,
  (select count(*) from public.products where image_url is not null and btrim(image_url) <> '') as products_with_image,
  (select count(*) from (
     select product_id from public.product_images
     where is_primary group by product_id having count(*) > 1
   ) duplicates) as products_with_two_primaries;

-- 9. Storage bucket + its policies (admin-only writes, public reads)
select b.id as bucket, b.public as public_read, b.file_size_limit, b.allowed_mime_types
from storage.buckets b
where b.id = 'product-images'
order by b.id;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'product_images_storage_%'
order by policyname;

-- 10. Gallery joined to the catalog — what the admin panel lists
select
  p.id as product_id,
  p.name as product_name,
  f.name as flavor,
  i.source,
  i.is_primary,
  i.storage_bucket,
  i.storefront_url
from public.product_images i
join public.products p on p.id = i.product_id
join public.flavors f on f.id = p.flavor_id
order by p.id, i.is_primary desc, i.created_at;
