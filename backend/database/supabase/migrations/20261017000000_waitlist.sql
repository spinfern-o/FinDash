-- The waitlist: people who want to hear when new features are ready, with
-- a few answers about their business (what kind, where, which languages,
-- how many supplier invoices a month), for sizing the market before
-- building more. Filled in on findash.tech/waitlist through api/waitlist.js.
--
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New
-- query, paste this file, Run. (Or `supabase db push` with the Supabase CLI.)
-- Until it has been run, the waitlist page says it isn't open yet.
--
-- Anyone may add a row; nobody can read, change or remove one through the
-- site. Only the site's owner sees them, in the Supabase dashboard (Table
-- Editor -> waitlist, or the queries in README.md).

create table if not exists public.waitlist (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  email              text not null,
  business_type      text not null,
  country            text not null,
  owner_languages    text[] not null default '{}',
  staff_languages    text[] not null default '{}',
  invoice_languages  text[] not null default '{}',
  other_languages    text,
  invoices_per_month text not null,
  hardest_part       text,

  -- The same limits api/waitlist.js checks (docs/js/waitlist-options.js),
  -- kept by the database itself too.
  constraint waitlist_email_length check (char_length(email) <= 254),
  constraint waitlist_country_length check (char_length(country) <= 80),
  constraint waitlist_other_languages_length check (char_length(other_languages) <= 120),
  constraint waitlist_hardest_part_length check (char_length(hardest_part) <= 600),
  constraint waitlist_language_counts check (
    cardinality(owner_languages) <= 20 and
    cardinality(staff_languages) <= 20 and
    cardinality(invoice_languages) <= 20
  )
);

-- Each email once, however it was capitalised.
create unique index if not exists waitlist_email_once on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

drop policy if exists "Anyone can join the waitlist" on public.waitlist;
create policy "Anyone can join the waitlist"
  on public.waitlist for insert
  to anon, authenticated
  with check (true);

-- Adding is all anyone can do: no policy lets anyone read, change or delete.
revoke all on public.waitlist from anon, authenticated;
grant insert on public.waitlist to anon, authenticated;
