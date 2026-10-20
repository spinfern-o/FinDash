-- Saved figures for FinDash accounts.
--
-- One row per person: the monthly totals and confirmed invoice lines the
-- dashboard keeps, as one JSON document. Never a spreadsheet or a photo.
--
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New
-- query, paste this file, Run. (Or `supabase db push` with the Supabase CLI.)

create table if not exists public.account_figures (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  figures    jsonb not null,
  updated_at timestamptz not null default now(),

  -- The API refuses anything bigger than 1 MB; this is the same rule kept
  -- by the database itself.
  constraint account_figures_size check (octet_length(figures::text) <= 1000000)
);

-- Row-level security: with it on, a request only ever sees rows its own
-- policies allow. The site talks to the database with the public key plus
-- the logged-in person's token, so these policies are what keep one owner's
-- figures away from everyone else.
alter table public.account_figures enable row level security;

drop policy if exists "Owners can read their own figures" on public.account_figures;
create policy "Owners can read their own figures"
  on public.account_figures for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Owners can save their own figures" on public.account_figures;
create policy "Owners can save their own figures"
  on public.account_figures for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owners can update their own figures" on public.account_figures;
create policy "Owners can update their own figures"
  on public.account_figures for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owners can delete their own figures" on public.account_figures;
create policy "Owners can delete their own figures"
  on public.account_figures for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Logged-in people may use the table (within the policies above); people
-- who are not logged in may not touch it at all.
revoke all on public.account_figures from anon;
grant select, insert, update, delete on public.account_figures to authenticated;
