-- The waitlist now asks only for an email. The answers it used to ask for
-- (kind of business, country, invoices a month) become optional, so a row
-- can be just an email. Rows that already have answers keep them.
--
-- Run this once in your Supabase project, after 20261017000000_waitlist.sql:
-- Dashboard -> SQL Editor -> New query, paste this file, Run. (Or
-- `supabase db push` with the Supabase CLI.) Run it before deploying the
-- email-only page: until then, api/waitlist.js says the waitlist isn't open.

alter table public.waitlist alter column business_type drop not null;
alter table public.waitlist alter column country drop not null;
alter table public.waitlist alter column invoices_per_month drop not null;
