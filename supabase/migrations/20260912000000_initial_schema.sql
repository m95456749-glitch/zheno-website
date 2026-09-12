-- ZHINO / ژینو — Supabase + PostgreSQL foundation
-- Apply with: supabase db push
-- This migration contains no credentials. Public checkout uses the
-- security-definer RPC below; the browser never receives a service key.

create extension if not exists pgcrypto;

do $$ begin
  create type public.product_category as enum ('jelly', 'custard');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_status as enum ('new', 'confirmed', 'preparing', 'shipped', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.shipping_method as enum ('standard', 'express');
exception when duplicate_object then null;
end $$;

create table if not exists public.flavors (
  id text primary key,
  category public.product_category not null,
  name text not null,
  color text not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  category public.product_category not null,
  flavor_id text not null references public.flavors(id) on delete restrict,
  name text not null,
  short_name text not null,
  category_label text not null,
  image_url text,
  active boolean not null default true,
  featured boolean not null default false,
  special boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id text primary key,
  product_id text not null references public.products(id) on delete restrict,
  weight text not null,
  weight_grams integer not null check (weight_grams > 0),
  price integer not null check (price >= 0),
  sku text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory (
  variant_id text primary key references public.product_variants(id) on delete cascade,
  current_stock integer not null default 0 check (current_stock >= 0),
  low_stock_threshold integer not null default 30 check (low_stock_threshold >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id text primary key,
  title text not null,
  summary text not null,
  category public.product_category not null,
  ingredients text[] not null default '{}',
  steps text[] not null default '{}',
  emoji text not null default '🍮',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_content (
  key text primary key,
  value text not null,
  published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  id text primary key default 'default' check (id = 'default'),
  free_shipping_threshold integer not null default 700000 check (free_shipping_threshold >= 0),
  standard_shipping_cost integer not null default 50000 check (standard_shipping_cost >= 0),
  express_shipping_cost integer not null default 100000 check (express_shipping_cost >= 0),
  low_stock_threshold integer not null default 30 check (low_stock_threshold >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key default ('ZH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  status public.order_status not null default 'new',
  customer_first_name text not null,
  customer_last_name text not null,
  customer_phone text not null,
  customer_email text,
  shipping_province text not null,
  shipping_city text not null,
  shipping_address text not null,
  shipping_postal_code text not null,
  shipping_method public.shipping_method not null,
  subtotal integer not null check (subtotal >= 0),
  shipping_cost integer not null check (shipping_cost >= 0),
  total integer not null check (total = subtotal + shipping_cost),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id) on delete restrict,
  variant_id text not null references public.product_variants(id) on delete restrict,
  product_name text not null,
  weight text not null,
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  total_price integer generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now()
);

create index if not exists flavors_category_idx on public.flavors(category);
create index if not exists products_active_idx on public.products(active);
create index if not exists product_variants_product_idx on public.product_variants(product_id);
create index if not exists inventory_low_stock_idx on public.inventory(current_stock, active);
create index if not exists recipes_active_idx on public.recipes(active);
create index if not exists orders_status_created_idx on public.orders(status, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists flavors_touch_updated_at on public.flavors;
create trigger flavors_touch_updated_at before update on public.flavors for each row execute function public.touch_updated_at();
drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at before update on public.products for each row execute function public.touch_updated_at();
drop trigger if exists variants_touch_updated_at on public.product_variants;
create trigger variants_touch_updated_at before update on public.product_variants for each row execute function public.touch_updated_at();
drop trigger if exists inventory_touch_updated_at on public.inventory;
create trigger inventory_touch_updated_at before update on public.inventory for each row execute function public.touch_updated_at();
drop trigger if exists recipes_touch_updated_at on public.recipes;
create trigger recipes_touch_updated_at before update on public.recipes for each row execute function public.touch_updated_at();
drop trigger if exists content_touch_updated_at on public.site_content;
create trigger content_touch_updated_at before update on public.site_content for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch_updated_at on public.site_settings;
create trigger settings_touch_updated_at before update on public.site_settings for each row execute function public.touch_updated_at();
drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at before update on public.orders for each row execute function public.touch_updated_at();

-- Admin authorization is deliberately based on Supabase Auth app_metadata,
-- not a browser-provided flag. Set {"role":"admin"} in app_metadata for
-- an operator using the Supabase dashboard or a trusted server-side tool.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.flavors enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory enable row level security;
alter table public.recipes enable row level security;
alter table public.site_content enable row level security;
alter table public.site_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Storefront reads only active catalog/content. Admin reads and writes use
-- the authenticated JWT role claim. No anonymous order/customer reads exist.
drop policy if exists flavors_public_read on public.flavors;
create policy flavors_public_read on public.flavors for select using (true);
drop policy if exists flavors_admin_write on public.flavors;
create policy flavors_admin_write on public.flavors for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select using (active or public.is_admin());
drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists variants_public_read on public.product_variants;
create policy variants_public_read on public.product_variants for select using (
  public.is_admin() or exists (select 1 from public.products p where p.id = product_id and p.active)
);
drop policy if exists variants_admin_write on public.product_variants;
create policy variants_admin_write on public.product_variants for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists inventory_public_read on public.inventory;
create policy inventory_public_read on public.inventory for select using (
  public.is_admin() or exists (
    select 1 from public.product_variants v join public.products p on p.id = v.product_id
    where v.id = variant_id and p.active
  )
);
drop policy if exists inventory_admin_write on public.inventory;
create policy inventory_admin_write on public.inventory for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists recipes_public_read on public.recipes;
create policy recipes_public_read on public.recipes for select using (active or public.is_admin());
drop policy if exists recipes_admin_write on public.recipes;
create policy recipes_admin_write on public.recipes for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists content_public_read on public.site_content;
create policy content_public_read on public.site_content for select using (published or public.is_admin());
drop policy if exists content_admin_write on public.site_content;
create policy content_admin_write on public.site_content for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists settings_public_read on public.site_settings;
create policy settings_public_read on public.site_settings for select using (true);
drop policy if exists settings_admin_write on public.site_settings;
create policy settings_admin_write on public.site_settings for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists orders_admin_read on public.orders;
create policy orders_admin_read on public.orders for select using (public.is_admin());
drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update on public.orders for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists order_items_admin_read on public.order_items;
create policy order_items_admin_read on public.order_items for select using (public.is_admin());

-- PostgREST table privileges are intentionally paired with the RLS policies.
-- There are no anonymous privileges on order headers/items.
grant select on public.flavors, public.products, public.product_variants, public.inventory, public.recipes, public.site_content, public.site_settings to anon, authenticated;
grant insert, update, delete on public.flavors, public.products, public.product_variants, public.inventory, public.recipes, public.site_content, public.site_settings to authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;

-- Admin stock writes are atomic and cannot make stock negative. Checkout
-- uses the separate create_order RPC below, which locks and decrements rows
-- in the same transaction as the order insert.
create or replace function public.set_inventory_stock(p_variant_id text, p_current_stock integer)
returns setof public.inventory
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  if p_current_stock is null or p_current_stock < 0 then raise exception 'invalid_stock'; end if;
  return query
    update public.inventory
       set current_stock = p_current_stock
     where variant_id = p_variant_id
     returning *;
  if not found then raise exception 'inventory_not_found'; end if;
end;
$$;

create or replace function public.adjust_inventory(p_variant_id text, p_delta integer)
returns setof public.inventory
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  return query
    update public.inventory
       set current_stock = current_stock + p_delta
     where variant_id = p_variant_id and current_stock + p_delta >= 0
     returning *;
  if not found then raise exception 'inventory_update_would_be_negative_or_missing'; end if;
end;
$$;

revoke all on function public.set_inventory_stock(text, integer) from public;
grant execute on function public.set_inventory_stock(text, integer) to authenticated;
revoke all on function public.adjust_inventory(text, integer) from public;
grant execute on function public.adjust_inventory(text, integer) to authenticated;

-- Guest checkout is intentionally limited to this RPC. It validates prices,
-- active catalog rows, shipping rules, and stock on the database side, so the
-- browser cannot set a cheaper total or oversell inventory.
create or replace function public.create_order(
  p_customer jsonb,
  p_shipping jsonb,
  p_items jsonb,
  p_shipping_method public.shipping_method
)
returns table(order_id text, subtotal integer, shipping_cost integer, total integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  variant_id_value text;
  quantity_value integer;
  product_id_value text;
  product_name_value text;
  weight_value text;
  unit_price_value integer;
  computed_subtotal integer := 0;
  computed_shipping integer := 0;
  free_threshold integer;
  standard_cost integer;
  express_cost integer;
  new_order_id text;
  updated_count integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'order_items_required';
  end if;
  if coalesce(nullif(trim(p_customer ->> 'firstName'), ''), '') = ''
     or coalesce(nullif(trim(p_customer ->> 'lastName'), ''), '') = ''
     or coalesce(nullif(trim(p_customer ->> 'phone'), ''), '') = ''
     or coalesce(nullif(trim(p_shipping ->> 'province'), ''), '') = ''
     or coalesce(nullif(trim(p_shipping ->> 'city'), ''), '') = ''
     or coalesce(nullif(trim(p_shipping ->> 'address'), ''), '') = ''
     or coalesce(nullif(trim(p_shipping ->> 'postalCode'), ''), '') = '' then
    raise exception 'customer_and_shipping_required';
  end if;

  select s.free_shipping_threshold, s.standard_shipping_cost, s.express_shipping_cost
    into free_threshold, standard_cost, express_cost
    from public.site_settings s where s.id = 'default';
  free_threshold := coalesce(free_threshold, 700000);
  standard_cost := coalesce(standard_cost, 50000);
  express_cost := coalesce(express_cost, 100000);

  -- Validate all requested variants while taking row locks. Duplicate variant
  -- ids are rejected rather than silently multiplying a client-side quantity.
  for item in select value from jsonb_array_elements(p_items)
  loop
    variant_id_value := nullif(item ->> 'variant_id', '');
    quantity_value := (item ->> 'quantity')::integer;
    if variant_id_value is null or quantity_value is null or quantity_value < 1 then
      raise exception 'invalid_order_item';
    end if;
    if (select count(*) from jsonb_array_elements(p_items) x where x ->> 'variant_id' = variant_id_value) > 1 then
      raise exception 'duplicate_order_item';
    end if;

    select v.product_id, p.name, v.weight, v.price, i.current_stock
      into product_id_value, product_name_value, weight_value, unit_price_value, updated_count
      from public.product_variants v
      join public.products p on p.id = v.product_id and p.active
      join public.inventory i on i.variant_id = v.id and i.active
     where v.id = variant_id_value
     for update of i;
    if not found then raise exception 'product_unavailable'; end if;
    if updated_count < quantity_value then raise exception 'insufficient_stock'; end if;
    computed_subtotal := computed_subtotal + unit_price_value * quantity_value;
  end loop;

  if computed_subtotal >= free_threshold then
    computed_shipping := 0;
  elsif p_shipping_method = 'express' then
    computed_shipping := express_cost;
  else
    computed_shipping := standard_cost;
  end if;

  insert into public.orders (
    customer_first_name, customer_last_name, customer_phone, customer_email,
    shipping_province, shipping_city, shipping_address, shipping_postal_code,
    shipping_method, subtotal, shipping_cost, total
  ) values (
    trim(p_customer ->> 'firstName'), trim(p_customer ->> 'lastName'), trim(p_customer ->> 'phone'),
    nullif(trim(p_customer ->> 'email'), ''), trim(p_shipping ->> 'province'), trim(p_shipping ->> 'city'),
    trim(p_shipping ->> 'address'), trim(p_shipping ->> 'postalCode'), p_shipping_method,
    computed_subtotal, computed_shipping, computed_subtotal + computed_shipping
  ) returning id into new_order_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    variant_id_value := item ->> 'variant_id';
    quantity_value := (item ->> 'quantity')::integer;
    select v.product_id, p.name, v.weight, v.price
      into product_id_value, product_name_value, weight_value, unit_price_value
      from public.product_variants v join public.products p on p.id = v.product_id
     where v.id = variant_id_value;
    insert into public.order_items (order_id, product_id, variant_id, product_name, weight, quantity, unit_price)
    values (new_order_id, product_id_value, variant_id_value, product_name_value, weight_value, quantity_value, unit_price_value);
    update public.inventory
       set current_stock = current_stock - quantity_value
     where variant_id = variant_id_value and current_stock >= quantity_value;
    get diagnostics updated_count = row_count;
    if updated_count <> 1 then raise exception 'inventory_changed'; end if;
  end loop;

  return query select new_order_id, computed_subtotal, computed_shipping, computed_subtotal + computed_shipping;
end;
$$;

revoke all on function public.create_order(jsonb, jsonb, jsonb, public.shipping_method) from public;
grant execute on function public.create_order(jsonb, jsonb, jsonb, public.shipping_method) to anon, authenticated;

-- Preserve the storefront's current behavior/data. Product and recipe values
-- are inserted by the follow-up seed migration generated from src/data/.
insert into public.site_settings (id) values ('default') on conflict (id) do nothing;

comment on table public.products is 'ZHINO product catalog; image_url points to existing public product images.';
comment on table public.product_variants is 'Sellable product options such as weight, SKU and price.';
comment on table public.inventory is 'Atomic stock state for each sellable variant.';
comment on table public.orders is 'Customer/shipping order header; never expose guest rows through public RLS.';
comment on function public.create_order(jsonb, jsonb, jsonb, public.shipping_method) is 'Validated guest checkout with atomic inventory decrement.';
