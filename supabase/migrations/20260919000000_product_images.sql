-- ZHINO / ژینو — product image gallery (admin panel ⇄ Supabase Storage)
-- Apply with: supabase db push   (runs after the two 20260912 migrations)
--
-- WHAT THIS ADDS
--   public.product_images — one row per product photo, linked to
--   public.products, plus the «product-images» Storage bucket that holds
--   the uploaded files. The admin panel's «تصاویر محصولات» section reads
--   and writes exactly these two things.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH
--   * public.products.image_url keeps its current value for all 22
--     products (the migrate workflow verifies that count), so the
--     storefront, cart and checkout render exactly as before.
--   * No file in public/images/ is moved, renamed or removed. The
--     existing photos are only REGISTERED here as source = 'legacy'
--     rows so the manager sees them in one gallery.
--   * No row of any existing table is updated or removed by this file.
--
-- SECURITY MODEL (same posture as the rest of the schema)
--   * Reads: anonymous visitors see only images of ACTIVE products
--     (mirrors the product_variants policy). An admin sees everything.
--   * Writes: only a signed-in account whose JWT app_metadata carries
--     {"role":"admin"} — enforced by public.is_admin() in every policy
--     and inside the RPC below. The browser only ever holds the
--     publishable key (src/services/supabaseClient.ts).
--   * The Storage bucket is PUBLIC-READ by design (a storefront photo
--     is public), but only an admin can insert, overwrite or remove an
--     object, and only image/* MIME types up to 8 MB are accepted.
--   * There is no `delete from` statement in this migration: removing
--     an image is a runtime, admin-authorised action performed by the
--     panel (row first, then the storage object), never a migration.

-- ── 1. table ────────────────────────────────────────────────

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,

  -- Where the bytes live:
  --   'product-images' → this project's Supabase Storage bucket
  --   'site-public'    → a file already committed in public/images/
  --                      (registered, never deleted by the panel)
  storage_bucket text not null default 'product-images',
  storage_path text not null,

  -- The URL written into public.products.image_url when this row
  -- becomes the primary image: a site-root-relative path for legacy
  -- files, an absolute https:// Storage URL for uploads.
  storefront_url text not null,

  alt_text text not null default '',
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  mime_type text not null default 'image/jpeg',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  -- 'legacy' = an existing public/images file, 'upload' = Storage object
  source text not null default 'upload' check (source in ('upload', 'legacy')),
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint product_images_unique_path unique (storage_bucket, storage_path)
);

comment on table public.product_images is
  'ZHINO product photo gallery. One row per image; the primary row''s storefront_url is mirrored into products.image_url, which is the only field the storefront reads.';
comment on column public.product_images.storage_bucket is
  'product-images = Supabase Storage bucket; site-public = a committed public/images file (registered only, never deleted).';
comment on column public.product_images.storefront_url is
  'Value written to products.image_url when the row is the primary image.';
comment on column public.product_images.uploaded_by is
  'auth.uid() of the admin who added the row (database default); null for seeded legacy photos.';

create index if not exists product_images_product_idx
  on public.product_images (product_id, is_primary desc, sort_order, created_at);

-- At most ONE primary image per product. The RPC below clears the old
-- flag and sets the new one in a single transaction, so this index can
-- never be hit by a correct caller — it exists to make a half-applied
-- client-side write impossible instead of merely unlikely.
-- Consequence for callers: a new row is always inserted with
-- is_primary = false and then promoted through
-- public.set_primary_product_image(image_id).
create unique index if not exists product_images_one_primary
  on public.product_images (product_id) where is_primary;

drop trigger if exists product_images_touch_updated_at on public.product_images;
create trigger product_images_touch_updated_at
  before update on public.product_images
  for each row execute function public.touch_updated_at();

-- ── 2. row level security ───────────────────────────────────

alter table public.product_images enable row level security;

-- Anonymous: images of products the storefront may show. Admin: all.
drop policy if exists product_images_public_read on public.product_images;
create policy product_images_public_read on public.product_images for select using (
  public.is_admin()
  or exists (
    select 1 from public.products p
    where p.id = product_id and p.active
  )
);

drop policy if exists product_images_admin_write on public.product_images;
create policy product_images_admin_write on public.product_images
  for all using (public.is_admin()) with check (public.is_admin());

-- Paired with the policies, exactly like every other table here:
-- guests may read, only a signed-in (RLS-checked) admin may write.
grant select on public.product_images to anon, authenticated;
grant insert, update, delete on public.product_images to authenticated;

-- ── 3. atomic «make this the primary image» ─────────────────

-- One transaction: clear the previous primary flag, raise this row, and
-- mirror its storefront_url into products.image_url — the single field
-- the storefront reads. A partial write (two primaries, or a gallery
-- that disagrees with the shop) is therefore impossible.
create or replace function public.set_primary_product_image(p_image_id uuid)
returns setof public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  image_row public.product_images;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;

  select * into image_row
    from public.product_images
   where id = p_image_id
   for update;
  if not found then raise exception 'image_not_found'; end if;

  update public.product_images
     set is_primary = false
   where product_id = image_row.product_id
     and id <> image_row.id
     and is_primary;

  update public.product_images
     set is_primary = true,
         sort_order = 0
   where id = image_row.id;

  return query
    update public.products
       set image_url = image_row.storefront_url
     where id = image_row.product_id
    returning *;
end;
$$;

comment on function public.set_primary_product_image(uuid) is
  'Admin-only: marks one product_images row as the product''s primary image and mirrors its storefront_url into products.image_url.';

revoke all on function public.set_primary_product_image(uuid) from public;
grant execute on function public.set_primary_product_image(uuid) to authenticated;

-- ── 4. storage bucket ───────────────────────────────────────
-- Public read (storefront photos are public by nature), admin-only
-- write, and hardened at the bucket level: 8 MB per file, image MIME
-- types only. Supabase rejects anything else before it reaches RLS.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Reading a product photo must not require a session (the storefront is
-- guest-only), but the bucket is scoped: no policy here exposes any
-- other bucket's objects.
drop policy if exists product_images_storage_read on storage.objects;
create policy product_images_storage_read on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists product_images_storage_insert on storage.objects;
create policy product_images_storage_insert on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists product_images_storage_update on storage.objects;
create policy product_images_storage_update on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists product_images_storage_delete on storage.objects;
create policy product_images_storage_delete on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- ── 5. register the photos the site already ships ───────────
-- Read-only registration: products.image_url is NOT modified, so the
-- verified seed counts (22 products, 22 'images/products/%' paths) stay
-- exactly as they are. Re-running is a no-op.

insert into public.product_images (
  product_id, storage_bucket, storage_path, storefront_url,
  alt_text, is_primary, source, mime_type
)
select
  p.id,
  'site-public',
  p.image_url,
  p.image_url,
  coalesce(nullif(btrim(p.short_name), ''), p.name),
  true,
  'legacy',
  case
    when p.image_url ilike '%.webp' then 'image/webp'
    when p.image_url ilike '%.png'  then 'image/png'
    when p.image_url ilike '%.avif' then 'image/avif'
    when p.image_url ilike '%.gif'  then 'image/gif'
    else 'image/jpeg'
  end
from public.products p
where p.image_url is not null
  and btrim(p.image_url) <> ''
on conflict (storage_bucket, storage_path) do nothing;
