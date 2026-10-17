-- Confirmed physical stock, kept separate from financial figures and photos.
-- Run with the other migrations before enabling account stock saving.
create table if not exists public.account_inventory (
  user_id uuid primary key references auth.users (id) on delete cascade,
  inventory jsonb not null,
  revision bigint not null default 1 check (revision > 0 and revision <= 9007199254740991),
  updated_at timestamptz not null default now(),
  constraint account_inventory_size check (octet_length(inventory::text) <= 1000000),
  constraint account_inventory_shape check (
    jsonb_typeof(inventory) = 'object'
    and inventory ?& array['version', 'items', 'movements']
    and inventory->>'version' = '1'
    and jsonb_typeof(inventory->'items') = 'array'
    and jsonb_typeof(inventory->'movements') = 'array'
  )
);

alter table public.account_inventory enable row level security;

drop policy if exists "Owners can read their stock" on public.account_inventory;
create policy "Owners can read their stock" on public.account_inventory for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Owners can create their stock" on public.account_inventory;
create policy "Owners can create their stock" on public.account_inventory for insert
  to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Owners can update their stock" on public.account_inventory;
create policy "Owners can update their stock" on public.account_inventory for update
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.account_inventory from anon;
grant select, insert, update on public.account_inventory to authenticated;
