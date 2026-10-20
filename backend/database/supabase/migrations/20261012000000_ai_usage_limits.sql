-- Daily limits on the features that call Claude: reading photos, advice,
-- and matching unusual column names. Each one costs money per use, so each
-- logged-in person gets a daily allowance, counted here.
--
-- Run this once in your Supabase project, after
-- 20261011000000_account_figures.sql: Dashboard -> SQL Editor -> New query,
-- paste this file, Run. (Or `supabase db push` with the Supabase CLI.)
-- Until it has been run, those three features answer "not set up yet".

-- One row per person, per feature, per day (UTC): how many times they used it.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null check (feature in ('photo', 'advice', 'columns')),
  day     date not null,
  uses    integer not null default 0,
  primary key (user_id, feature, day)
);

-- Row-level security on, and no policy that lets anyone write: the counts
-- can only change through claim_ai_use below. People may read their own
-- counts (nothing shows them yet, but it costs nothing to allow).
alter table public.ai_usage enable row level security;

drop policy if exists "People can read their own usage" on public.ai_usage;
create policy "People can read their own usage"
  on public.ai_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

-- Counts one use of a feature by whoever is logged in, and says whether they
-- are still within the day's limit. The site's server calls it with its own
-- limit before every request to Claude.
--
-- "security definer" lets it write to ai_usage, which nobody can write to
-- directly. It only ever touches the caller's own row (auth.uid()), so
-- someone calling it themselves can only use up their own allowance.
create or replace function public.claim_ai_use(feature_name text, daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  uses_today integer;
begin
  if caller is null then
    return false;
  end if;
  if feature_name not in ('photo', 'advice', 'columns') then
    raise exception 'unknown feature: %', feature_name;
  end if;

  insert into public.ai_usage (user_id, feature, day, uses)
  values (caller, feature_name, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, feature, day)
  do update set uses = public.ai_usage.uses + 1
  returning uses into uses_today;

  return uses_today <= daily_limit;
end;
$$;

-- Only logged-in people may call it.
revoke all on function public.claim_ai_use(text, integer) from public, anon;
grant execute on function public.claim_ai_use(text, integer) to authenticated;
