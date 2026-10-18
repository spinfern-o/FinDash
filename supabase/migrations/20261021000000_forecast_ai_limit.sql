-- The forecast is a fourth feature with a daily allowance.
--
-- /api/forecast passes a request to the Chronos-Bolt service in forecast/,
-- which costs processor time this site pays for, and the function holds
-- FORECAST_TOKEN so the caller never needs it. It used to be the one
-- model-backed address with no check at all, so anyone who found it could
-- spend that time. It now goes through claim_ai_use like the others.
--
-- Run this after 20261012000000_ai_usage_limits.sql, and **before deploying
-- the gated /api/forecast**: until it has been run, claim_ai_use rejects the
-- new feature name and the page keeps the trend line it works out itself.

-- The table only allowed the first three names.
alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage
  add constraint ai_usage_feature_check
  check (feature in ('photo', 'advice', 'columns', 'forecast'));

-- Same list inside the function, which is otherwise unchanged.
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
  if feature_name not in ('photo', 'advice', 'columns', 'forecast') then
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

revoke all on function public.claim_ai_use(text, integer) from public, anon;
grant execute on function public.claim_ai_use(text, integer) to authenticated;
