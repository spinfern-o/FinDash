/* Optional PostgreSQL smoke check, separate from the mocked API tests.
   Install @electric-sql/pglite in a temporary directory, then set
   FINDASH_PGLITE_MODULE to its dist/index.js and run this file with Node.
   Everything runs in an isolated in-memory database, never a real account. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.FINDASH_PGLITE_MODULE || '@electric-sql/pglite');
const database = new PGlite();
await database.exec(`
  create role authenticated;
  create role anon;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to authenticated;
  grant execute on function auth.uid() to authenticated;
  insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
`);
for (const filename of ['20261011000000_account_figures.sql', '20261018000000_account_inventory.sql', '20261019000000_stock_invoice_sync.sql']) {
  await database.exec(await readFile(new URL('../supabase/migrations/' + filename, import.meta.url), 'utf8'));
}
await database.exec("set role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false)");

/* Exercise the real PL/pgSQL and RLS, rather than reimplementing them. */
async function save(figures, token, check = true) {
  const result = await database.query('select public.save_account_figures($1::jsonb, $2, $3::timestamptz) as answer', [JSON.stringify(figures), check, token]);
  return result.rows[0].answer;
}
async function confirm(inventory, revision, invoice) {
  const result = await database.query('select public.confirm_stock_invoice($1::jsonb, $2::bigint, $3::jsonb) as answer', [JSON.stringify(inventory), revision, JSON.stringify(invoice)]);
  return result.rows[0].answer;
}
const figures = { v: 2, months: [{ year: 2026, monthNum: 9, month: 'September', revenue: 1000 }], invoices: [] };
const original = await save(figures, null);
const invoice = { id: 'stock-rice', kind: 'purchase', supplier: 'Example supplier', number: 'ONE', date: '2026-09-26', year: 2026, monthNum: 9, total: 76,
  lines: [{ description: '大米', original: 'Rice', category: 'cogs', amount: 76 }], addedAt: '2026-09-26T12:00:00.000Z' };
const inventory = { version: 1, items: [{ id: 'rice', original: 'Rice', description: '大米', unit: '袋', location: '后仓' }],
  movements: [{ id: 'count', itemId: 'rice', type: 'count', quantity: 8, at: '2026-09-26T12:00:00.000Z' }] };
const first = await confirm(inventory, 0, invoice);
assert.equal(first.revision, 1);
assert.equal(first.invoiceAdded, true);
assert.deepEqual(first.figures.months, figures.months);
assert.deepEqual(first.figures.invoices, [invoice]);
assert.deepEqual(await confirm(inventory, 0, invoice), { ...first, invoiceAdded: false });
await assert.rejects(save(figures, original.updatedAt), function (error) { return error.code === '40001'; });
await assert.rejects(confirm(inventory, 1, { ...invoice, id: 'other-photo' }), function (error) { return error.code === 'FD001'; });
await assert.rejects(confirm(inventory, 1, { ...invoice, total: 88 }), function (error) { return error.code === 'FD002'; });

/* A failed stock-table constraint must roll back the financial append too. */
await assert.rejects(confirm({ ...inventory, oversized: 'x'.repeat(1_000_001) }, 1, { ...invoice, id: 'second', number: 'TWO' }), function (error) { return error.code === '23514'; });
let saved = (await database.query('select figures, updated_at, stock_invoice_ids from public.account_figures')).rows[0];
assert.deepEqual(saved.figures.invoices, [invoice]);
assert.deepEqual(saved.stock_invoice_ids, [invoice.id]);
assert.equal((await database.query('select revision from public.account_inventory')).rows[0].revision, 1);
await save(figures, null, false);
saved = (await database.query('select figures, updated_at from public.account_figures')).rows[0];
assert.deepEqual(saved.figures.invoices, [invoice], 'legacy saves preserve the synced purchase');
await database.exec("select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false)");
assert.equal((await database.query('select * from public.account_figures')).rows.length, 0);
assert.equal((await database.query('select * from public.account_inventory')).rows.length, 0);
await save({ v: 2, months: [], invoices: [] }, null);
assert.equal((await database.query('select * from public.account_figures')).rows.length, 1);
await database.close();
console.log('PostgreSQL smoke check passed: migrations, atomic confirmation, retries, rollback, CAS, legacy protection and RLS.');
