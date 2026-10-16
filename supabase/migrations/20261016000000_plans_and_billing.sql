-- Plans: monthly allowances for the features that call Claude, the tokens
-- each use took (to work out what a photo read really costs), and which
-- Stripe customer belongs to which account, for FinDash Plus.
--
-- Run this once in your Supabase project, after the two earlier files:
-- Dashboard -> SQL Editor -> New query, paste this file, Run. (Or
-- `supabase db push` with the Supabase CLI.) Run it BEFORE deploying the
-- code that uses it: until it has been run, reading photos, advice and
-- column matching answer "not set up yet".
--
-- It only adds: nothing existing is changed or removed.

-- 1. The tokens each feature used, next to how many times it was used, so
--    the cost of one use can be worked out from real use:
--      select feature, sum(uses), sum(input_tokens), sum(output_tokens)
--      from public.ai_usage where day >= date_trunc('month', now())
--      group by feature;
alter table public.ai_usage add column if not exists input_tokens bigint not null default 0;
alter table public.ai_usage add column if not exists output_tokens bigint not null default 0;

-- 2. Says whether whoever is logged in may use a feature once more this
--    calendar month (UTC), and if so counts the use. The site's server calls
--    it before every request to Claude, with the limit of the person's plan
--    (docs/js/plans.js). A refused request isn't counted, so the counts are
--    the requests Claude actually answered, and the token counts below
--    divide by them to give the true cost of one use.
--
--    Like claim_ai_use, it only ever touches the caller's own rows, so
--    someone calling it themselves can only use up their own allowance.
create or replace function public.claim_ai_use_this_month(feature_name text, monthly_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  uses_this_month integer;
begin
  if caller is null then
    return false;
  end if;
  if feature_name not in ('photo', 'advice', 'columns') then
    raise exception 'unknown feature: %', feature_name;
  end if;

  -- Today's row, made if need be and locked until the transaction ends, so
  -- two requests at the same moment are checked one after the other.
  insert into public.ai_usage (user_id, feature, day, uses)
  values (caller, feature_name, today, 0)
  on conflict (user_id, feature, day) do nothing;
  perform 1 from public.ai_usage
  where user_id = caller and feature = feature_name and day = today
  for update;

  select coalesce(sum(uses), 0) into uses_this_month
  from public.ai_usage
  where user_id = caller
    and feature = feature_name
    and day >= date_trunc('month', today)::date;

  if uses_this_month >= monthly_limit then
    return false;
  end if;

  update public.ai_usage
  set uses = uses + 1
  where user_id = caller and feature = feature_name and day = today;
  return true;
end;
$$;

revoke all on function public.claim_ai_use_this_month(text, integer) from public, anon;
grant execute on function public.claim_ai_use_this_month(text, integer) to authenticated;

-- 3. Adds the tokens one request used to today's row. Called by the server
--    after Claude answers. Someone calling it themselves could only change
--    their own counts, which decide nothing.
create or replace function public.add_ai_tokens(feature_name text, input_count integer, output_count integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
begin
  if caller is null then
    return;
  end if;
  update public.ai_usage
  set input_tokens = input_tokens + greatest(input_count, 0),
      output_tokens = output_tokens + greatest(output_count, 0)
  where user_id = caller
    and feature = feature_name
    and day = today;
end;
$$;

revoke all on function public.add_ai_tokens(text, integer, integer) from public, anon;
grant execute on function public.add_ai_tokens(text, integer, integer) to authenticated;

-- 4. Which Stripe customer is whose, written by the server while the person
--    is logged in, when they first choose Plus.
--
--    Stripe, not this table, says whether someone has paid: the server asks
--    Stripe for the customer's subscriptions on every request that needs
--    to know, and only counts them when Stripe's own record of the customer
--    names the same account (lib/billing.js). So this site never needs
--    Supabase's admin key, and a row pointing at someone else's customer
--    gains nothing.
create table if not exists public.billing_customers (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null,
  created_at         timestamptz not null default now()
);

alter table public.billing_customers enable row level security;

drop policy if exists "People can read their own billing customer" on public.billing_customers;
create policy "People can read their own billing customer"
  on public.billing_customers for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "People can save their own billing customer" on public.billing_customers;
create policy "People can save their own billing customer"
  on public.billing_customers for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "People can update their own billing customer" on public.billing_customers;
create policy "People can update their own billing customer"
  on public.billing_customers for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "People can delete their own billing customer" on public.billing_customers;
create policy "People can delete their own billing customer"
  on public.billing_customers for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.billing_customers from anon;
grant select, insert, update, delete on public.billing_customers to authenticated;
