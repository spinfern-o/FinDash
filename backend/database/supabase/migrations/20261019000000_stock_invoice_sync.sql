-- A confirmed invoice updates physical stock and financial purchases together.
-- The hidden ids protect synced invoices from older browser tabs that save
-- financial figures without a concurrency token. No images are stored.
alter table public.account_figures
  add column if not exists stock_invoice_ids text[] not null default '{}';

-- Both writers take the same account-scoped transaction lock, including when
-- this owner has no row yet. Invoker rights retain the existing RLS policies.
create or replace function public.save_account_figures(
  new_figures jsonb,
  check_updated_at boolean default false,
  expected_updated_at timestamptz default null
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  owner_id uuid := auth.uid();
  previous public.account_figures%rowtype;
  merged jsonb := new_figures;
  protected jsonb;
  protected_ids text[];
  saved_at timestamptz;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(new_figures) is distinct from 'object'
     or jsonb_typeof(new_figures->'months') is distinct from 'array'
     or jsonb_typeof(new_figures->'invoices') is distinct from 'array' then
    raise exception 'Invalid figures' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select * into previous from public.account_figures where user_id = owner_id for update;
  if check_updated_at and previous.updated_at is distinct from expected_updated_at then
    raise exception 'Financial records changed' using errcode = '40001';
  end if;

  if not check_updated_at then
    -- Legacy saves may change their own figures, but cannot erase or roll
    -- back invoices that were confirmed in the stock workspace afterward.
    select coalesce(jsonb_agg(value), '[]'::jsonb) into protected
      from jsonb_array_elements(coalesce(previous.figures->'invoices', '[]'::jsonb))
      where value->>'id' = any(coalesce(previous.stock_invoice_ids, '{}'));
    select coalesce(jsonb_agg(value), '[]'::jsonb) into merged
      from jsonb_array_elements(new_figures->'invoices')
      where not (coalesce(value->>'id', '') = any(coalesce(previous.stock_invoice_ids, '{}')));
    merged := jsonb_set(new_figures, '{invoices}', merged || protected);
    protected_ids := coalesce(previous.stock_invoice_ids, '{}');
  else
    -- A current client may explicitly edit or remove an invoice it has seen.
    select coalesce(array_agg(value->>'id'), '{}') into protected_ids
      from jsonb_array_elements(new_figures->'invoices')
      where value->>'id' = any(coalesce(previous.stock_invoice_ids, '{}'));
  end if;
  if jsonb_array_length(merged->'months') > 600
     or jsonb_array_length(merged->'invoices') > 5000
     or octet_length(merged::text) > 1000000 then
    raise exception 'Figures exceed storage limit' using errcode = '22023';
  end if;
  saved_at := greatest(clock_timestamp(), coalesce(previous.updated_at, 'epoch'::timestamptz) + interval '1 microsecond');
  insert into public.account_figures(user_id, figures, updated_at, stock_invoice_ids)
    values(owner_id, merged, saved_at, protected_ids)
    on conflict(user_id) do update set figures = excluded.figures,
      updated_at = excluded.updated_at, stock_invoice_ids = excluded.stock_invoice_ids;
  return jsonb_build_object('updatedAt', saved_at);
end;
$$;

create or replace function public.confirm_stock_invoice(
  new_inventory jsonb,
  expected_revision bigint,
  new_invoice jsonb
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  owner_id uuid := auth.uid();
  previous_figures public.account_figures%rowtype;
  previous_stock public.account_inventory%rowtype;
  merged jsonb;
  invoices jsonb;
  same_invoice jsonb;
  invoice_id text := new_invoice->>'id';
  added boolean := false;
  protected_ids text[];
  next_revision bigint;
  changed_rows integer;
  saved_at timestamptz;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 0 or expected_revision >= 9007199254740991
     or jsonb_typeof(new_inventory) is distinct from 'object'
     or jsonb_typeof(new_invoice) is distinct from 'object'
     or invoice_id is null or length(invoice_id) < 1 or length(invoice_id) > 40
     or new_invoice->>'kind' is distinct from 'purchase'
     or jsonb_typeof(new_invoice->'lines') is distinct from 'array' then
    raise exception 'Invalid confirmation' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select * into previous_figures from public.account_figures where user_id = owner_id for update;
  select * into previous_stock from public.account_inventory where user_id = owner_id for update;
  merged := coalesce(previous_figures.figures, '{"v":2,"months":[],"invoices":[]}'::jsonb);
  invoices := merged->'invoices';
  protected_ids := coalesce(previous_figures.stock_invoice_ids, '{}');
  select value into same_invoice from jsonb_array_elements(invoices) where value->>'id' = invoice_id limit 1;
  if same_invoice is not null and same_invoice <> new_invoice then
    raise exception 'Invoice id has different contents' using errcode = 'FD002';
  end if;
  -- A lost HTTP response may be retried with the old revision. A match of
  -- both committed records makes that retry a no-op, never a second expense.
  if invoice_id = any(protected_ids) and same_invoice = new_invoice
     and previous_stock.inventory = new_inventory then
    return jsonb_build_object('revision', previous_stock.revision,
      'figuresUpdatedAt', previous_figures.updated_at, 'invoiceAdded', false,
      'figures', previous_figures.figures);
  end if;
  if coalesce(previous_stock.revision, 0) <> expected_revision then
    raise exception 'Stock changed' using errcode = '40001';
  end if;
  if same_invoice is null and nullif(btrim(new_invoice->>'supplier'), '') is not null
     and nullif(btrim(new_invoice->>'number'), '') is not null
     and new_invoice->>'date' is not null
     and exists(select 1 from jsonb_array_elements(invoices)
       where lower(btrim(value->>'supplier')) = lower(btrim(new_invoice->>'supplier'))
         and lower(btrim(value->>'number')) = lower(btrim(new_invoice->>'number'))
         and value->>'date' = new_invoice->>'date') then
    raise exception 'Supplier invoice already recorded' using errcode = 'FD001';
  end if;
  if same_invoice is null then
    invoices := invoices || jsonb_build_array(new_invoice);
    merged := jsonb_set(merged, '{invoices}', invoices);
    added := true;
  end if;
  if not (invoice_id = any(protected_ids)) then
    protected_ids := array_append(protected_ids, invoice_id);
  end if;
  if jsonb_array_length(invoices) > 5000 or octet_length(merged::text) > 1000000 then
    raise exception 'Figures exceed storage limit' using errcode = '22023';
  end if;
  next_revision := expected_revision + 1;
  saved_at := greatest(clock_timestamp(), coalesce(previous_figures.updated_at, 'epoch'::timestamptz) + interval '1 microsecond');
  insert into public.account_inventory(user_id, inventory, revision, updated_at)
    values(owner_id, new_inventory, next_revision, saved_at)
    on conflict(user_id) do update set inventory = excluded.inventory,
      revision = excluded.revision, updated_at = excluded.updated_at
      where public.account_inventory.revision = expected_revision;
  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then
    raise exception 'Stock changed while confirming' using errcode = '40001';
  end if;
  insert into public.account_figures(user_id, figures, updated_at, stock_invoice_ids)
    values(owner_id, merged, saved_at, protected_ids)
    on conflict(user_id) do update set figures = excluded.figures,
      updated_at = excluded.updated_at, stock_invoice_ids = excluded.stock_invoice_ids;
  return jsonb_build_object('revision', next_revision, 'figuresUpdatedAt', saved_at,
    'invoiceAdded', added, 'figures', merged);
end;
$$;

revoke all on function public.save_account_figures(jsonb, boolean, timestamptz) from public, anon;
revoke all on function public.confirm_stock_invoice(jsonb, bigint, jsonb) from public, anon;
grant execute on function public.save_account_figures(jsonb, boolean, timestamptz) to authenticated;
grant execute on function public.confirm_stock_invoice(jsonb, bigint, jsonb) to authenticated;
