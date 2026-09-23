-- Read-only post-upgrade contract. Used by scripts/product-image-migrate.py.
-- No fixed seed counts, no product names/URLs or customer data in the result.
-- The migration's stronger snapshot assertions execute BEFORE its COMMIT.
select json_build_object(
  'id_types',
    exists(select 1 from public.product_image_contract where version=3 and fingerprint=public.product_image_schema_fingerprint()) and
    (select count(*)=3 from information_schema.columns where table_schema='public' and
      ((table_name='products' and column_name='id' and data_type='text') or
       (table_name='product_images' and column_name='product_id' and data_type='text') or
       (table_name='product_images' and column_name='id' and data_type='uuid'))),
  'primary_consistent',
    not exists(select 1 from public.products p where
      (select count(*) from public.product_images i where i.product_id=p.id and i.is_primary)
        <> case when p.image_url is null or btrim(p.image_url)='' then 0 else 1 end
      or exists(select 1 from public.product_images i where i.product_id=p.id and i.is_primary
        and i.storefront_url is distinct from p.image_url)),
  'bucket_config',
    exists(select 1 from storage.buckets where id='product-images' and public
      and file_size_limit=8388608
      and allowed_mime_types=array['image/jpeg','image/png','image/webp','image/avif','image/gif']),
  'rls_enabled',
    (select count(*)=6 from pg_class where oid in
      ('public.products'::regclass,'public.product_images'::regclass,
       'public.product_image_cleanup'::regclass,'storage.objects'::regclass,'public.product_image_operations'::regclass,'public.product_image_contract'::regclass) and relrowsecurity),
  'browser_writes_revoked',
    not exists(select 1 from (values('anon'),('authenticated')) r(role_name)
      cross join (values('public.product_images'),('public.product_image_cleanup'),('public.product_image_operations'),('public.product_image_contract')) t(table_name)
      where has_table_privilege(r.role_name,t.table_name,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
        or has_any_column_privilege(r.role_name,t.table_name,'INSERT,UPDATE,REFERENCES')),
  'private_helpers_revoked',
    not exists(select 1 from (values('anon'),('authenticated')) r(role_name)
      cross join (values('public.reconcile_product_image(text,text,text)'),
        ('public.product_image_path_referenced(text)'),('public.product_image_url_references(text,text)'),
        ('public.normalize_product_image_url()'),('public.sync_product_primary_image()'),('public.execute_product_image_operation(text,text,uuid,text,jsonb)'),('public.product_image_schema_fingerprint()')) f(fn)
      where has_function_privilege(r.role_name,f.fn,'EXECUTE')),
  'rpc_acl_and_search_path',
    (select bool_and(not has_function_privilege('anon',f.fn,'EXECUTE')
       and has_function_privilege('authenticated',f.fn,'EXECUTE')
       and p.prosecdef and p.proconfig @> array['search_path=pg_catalog, pg_temp'])
     from (values('public.manage_product_image(text,text,uuid,text,jsonb)'),
       ('public.set_primary_product_image(uuid)'),('public.retire_product_image_upload(text)'),
       ('public.complete_product_image_cleanup(text,uuid,boolean)'),('public.claim_product_image_cleanup(integer)'),('public.product_image_api_version()')) f(fn)
     join pg_proc p on p.oid=f.fn::regprocedure),
  'storage_guards',
    (select count(*)=3 from pg_policies where schemaname='storage' and tablename='objects'
      and permissive='RESTRICTIVE' and roles @> array['anon','authenticated']::name[]
      and (policyname,cmd) in (('product_images_storage_insert_guard','INSERT'),
        ('product_images_storage_update_guard','UPDATE'),('product_images_storage_delete_guard','DELETE'))),
  'gallery_write_guards',
    (select count(*)=12 from pg_policies where schemaname='public'
      and tablename in ('product_images','product_image_cleanup','product_image_operations','product_image_contract') and permissive='RESTRICTIVE'
      and roles @> array['anon','authenticated']::name[]
      and (policyname,cmd) in (('image_insert_guard','INSERT'),('image_update_guard','UPDATE'),('image_delete_guard','DELETE'))),
  'product_triggers',
    (select count(*)=2 from pg_trigger where tgrelid='public.products'::regclass
      and not tgisinternal and tgenabled='O'
      and tgname in ('products_normalize_image_url','products_sync_primary_image'))
);
