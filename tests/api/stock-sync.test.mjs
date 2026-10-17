/* One reviewed supplier invoice commits stock and financial purchases as a
   transaction. Shelf quantities never become money or duplicate expenses. */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startSite } from '../support/site.mjs';
import { httpClient } from '../support/http-client.mjs';
import { emptyInventory, addItem, recordMovement } from '../../frontend/js/stock/ledger.js';

let site;
let ownerNumber = 0;
before(async function () { site = await startSite(); });
after(async function () { await site.stop(); });
beforeEach(function () { site.supabase.reset(); });

/* Every owner has an independent cookie jar and owner-bound stock requests. */
async function owner() {
  ownerNumber += 1;
  const client = httpClient(site);
  const email = 'sync-' + ownerNumber + '@example.test';
  assert.equal((await client.post('/api/auth?action=signup', { email, password: 'invoice sync password' })).status, 200);
  const put = client.put;
  client.put = function (path, body, headers) {
    return put(path, body, path === '/api/inventory' ? { 'X-FinDash-Owner': email, ...headers } : headers);
  };
  return client;
}

/* The owner counted eight bags; the printed purchase has a different quantity. */
function shelfCount() {
  const inventory = addItem(emptyInventory(), { id: 'rice', original: 'Rice', description: '大米', unit: '袋', location: '后仓' });
  return recordMovement(inventory, { id: 'opening-count', itemId: 'rice', type: 'count', quantity: 8,
    at: '2026-10-19T12:00:00.000Z', note: 'source:invoice-photo' });
}

/* Ordinary dashboard invoice shape, with a stable id across network retries. */
function invoice(id = 'stock-invoice-1') {
  return { id, kind: 'purchase', supplier: 'Harbor Foods', number: 'INV-100', date: '2026-10-19',
    year: 2026, monthNum: 10, total: 120,
    lines: [{ description: '大米', original: 'Rice', code: 'RICE-1', quantity: 20, unit: 'bag', unitPrice: 6,
      amount: 120, category: 'cogs' }], addedAt: '2026-10-19T12:00:00.000Z' };
}

test('confirmation preserves spreadsheets and previous purchases while committing the shelf count once', async function () {
  const client = await owner();
  const previousInvoice = { ...invoice('previous'), supplier: 'Other supplier', number: 'OLD-1' };
  const figures = { v: 2, from: 'Monthly export.xlsx', months: [{ month: 'october', year: 2026, revenue: 9000 }], invoices: [previousInvoice] };
  assert.equal((await client.put('/api/figures', { figures, expectedUpdatedAt: null })).status, 200);
  const inventory = shelfCount();
  const result = await client.put('/api/inventory', { inventory, revision: 0, invoice: invoice() });
  assert.equal(result.status, 200);
  assert.equal(result.json.revision, 1);
  assert.equal(result.json.invoiceAdded, true);
  const saved = (await client.get('/api/figures')).json;
  assert.deepEqual(saved.figures.months, figures.months);
  assert.equal(saved.figures.from, figures.from);
  assert.deepEqual(saved.figures.invoices, [previousInvoice, invoice()]);
  assert.deepEqual(result.json.figures, saved.figures);
  assert.equal(saved.updatedAt, result.json.figuresUpdatedAt);
  assert.deepEqual((await client.get('/api/inventory')).json, { inventory, revision: 1 });
});

test('a lost-response retry is idempotent and changed contents cannot reuse the same invoice id', async function () {
  const client = await owner();
  const request = { inventory: shelfCount(), revision: 0, invoice: invoice() };
  const first = await client.put('/api/inventory', request);
  const retried = await client.put('/api/inventory', request);
  assert.equal(retried.status, 200);
  assert.deepEqual(retried.json, { ...first.json, invoiceAdded: false });
  assert.deepEqual(retried.json.figures.invoices, [invoice()]);
  const altered = invoice();
  altered.total = 240;
  altered.lines[0].amount = 240;
  assert.equal((await client.put('/api/inventory', { ...request, revision: 1, invoice: altered })).status, 409);
  const saved = (await client.get('/api/figures')).json;
  assert.equal(saved.figures.invoices.length, 1);
  assert.equal(saved.figures.invoices[0].total, 120);
  assert.equal(saved.updatedAt, first.json.figuresUpdatedAt);
  assert.equal((await client.get('/api/inventory')).json.revision, 1);
  const later = recordMovement(request.inventory, { id: 'later-usage', itemId: 'rice', type: 'usage', quantity: 2 });
  assert.equal((await client.put('/api/inventory', { inventory: later, revision: 1 })).status, 200);
  assert.equal((await client.put('/api/inventory', request)).status, 409);
  assert.deepEqual((await client.get('/api/inventory')).json, { inventory: later, revision: 2 });
  assert.deepEqual((await client.get('/api/figures')).json, saved);
});

test('the owner may post an invoice to a different P&L month from its printed date', async function () {
  const client = await owner();
  const posted = { ...invoice(), date: '2026-09-26', year: 2026, monthNum: 10 };
  const response = await client.put('/api/inventory', { inventory: shelfCount(), revision: 0, invoice: posted });
  assert.equal(response.status, 200);
  assert.deepEqual((await client.get('/api/figures')).json.figures.invoices, [posted]);
});

test('stock conflict or financial storage limit rolls back both sides', async function () {
  const stale = await owner();
  const inventory = shelfCount();
  assert.equal((await stale.put('/api/inventory', { inventory, revision: 0 })).status, 200);
  assert.equal((await stale.put('/api/inventory', { inventory: emptyInventory(), revision: 0, invoice: invoice() })).status, 409);
  assert.equal((await stale.get('/api/figures')).json.figures, null);
  assert.deepEqual((await stale.get('/api/inventory')).json, { inventory, revision: 1 });
  const full = await owner();
  const figures = { months: [], invoices: new Array(5000).fill({ id: 'legacy' }) };
  assert.equal((await full.put('/api/figures', { figures })).status, 200);
  assert.equal((await full.put('/api/inventory', { inventory, revision: 0, invoice: invoice() })).status, 400);
  assert.deepEqual((await full.get('/api/inventory')).json, { inventory: emptyInventory(), revision: 0 });
  assert.equal((await full.get('/api/figures')).json.figures.invoices.length, 5000);
});

test('another photo of the same numbered invoice is flagged within its account only', async function () {
  const first = await owner();
  assert.equal((await first.put('/api/figures', { figures: { months: [], invoices: [invoice('dashboard-photo')] } })).status, 200);
  const duplicate = invoice('different-photo');
  duplicate.supplier = ' HARBOR FOODS ';
  duplicate.number = ' inv-100 ';
  const response = await first.put('/api/inventory', { inventory: shelfCount(), revision: 0, invoice: duplicate });
  assert.equal(response.status, 409);
  assert.equal(response.json.duplicateInvoice, true);
  assert.equal((await first.get('/api/inventory')).json.revision, 0);
  assert.equal((await first.get('/api/figures')).json.figures.invoices.length, 1);
  const second = await owner();
  assert.equal((await second.put('/api/inventory', { inventory: shelfCount(), revision: 0, invoice: duplicate })).status, 200);
  assert.equal((await second.get('/api/figures')).json.figures.invoices.length, 1);
});

test('stale financial saves conflict; legacy tabs preserve synced invoices; current clients can deliberately remove them', async function () {
  const client = await owner();
  const figures = { months: [{ month: 'october', revenue: 1000 }], invoices: [] };
  const initial = await client.put('/api/figures', { figures, expectedUpdatedAt: null });
  assert.equal((await client.put('/api/inventory', { inventory: shelfCount(), revision: 0, invoice: invoice() })).status, 200);
  const stale = await client.put('/api/figures', { figures, expectedUpdatedAt: initial.json.updatedAt });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.conflict, true);
  assert.equal((await client.put('/api/figures', { figures })).status, 200);
  const afterLegacy = (await client.get('/api/figures')).json;
  assert.equal(afterLegacy.figures.invoices.length, 1);
  const removed = await client.put('/api/figures', { figures, expectedUpdatedAt: afterLegacy.updatedAt });
  assert.equal(removed.status, 200);
  assert.equal((await client.get('/api/figures')).json.figures.invoices.length, 0);
  assert.equal((await client.delete('/api/figures')).status, 200);
  assert.equal((await client.get('/api/figures')).json.figures, null);
  assert.equal((await client.get('/api/inventory')).json.revision, 1);
});

test('invalid financial readings and an unapplied sync migration cannot partially save stock', async function () {
  const client = await owner();
  for (const change of [
    { total: 200 }, { year: 0 }, { monthNum: 13 }, { date: '2026-02-30' },
    { id: 'x'.repeat(41) }, { kind: 'sale' }, { lines: [{ category: 'unknown', amount: 120, description: 'Rice' }] }
  ]) {
    const response = await client.put('/api/inventory', { inventory: shelfCount(), revision: 0, invoice: { ...invoice(), ...change } });
    assert.equal(response.status, 400);
  }
  assert.equal((await client.get('/api/inventory')).json.revision, 0);
  assert.equal((await client.get('/api/figures')).json.figures, null);
  site.supabase.options.missingTables = true;
  assert.equal((await client.put('/api/inventory', { inventory: shelfCount(), revision: 0, invoice: invoice() })).status, 503);
  assert.equal((await client.put('/api/figures', { figures: { months: [], invoices: [] } })).status, 503);
  assert.equal(site.supabase.inventory.size, 0);
  assert.equal(site.supabase.figures.size, 0);
});

test('financial requests with an old page owner cannot read, replace or delete a switched account', async function () {
  const previous = await owner();
  const current = await owner();
  const email = (await previous.get('/api/auth?action=me')).json.user.email;
  const figures = { months: [{ month: 'october', revenue: 9000 }], invoices: [] };
  assert.equal((await current.put('/api/figures', { figures })).status, 200);
  const cookie = Array.from(current.jar).map(function ([key, value]) { return key + '=' + value; }).join('; ');
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const response = await fetch(site.url + '/api/figures', { method,
      headers: { cookie, origin: site.url, 'Content-Type': 'application/json', 'X-FinDash-Owner': email },
      body: method === 'PUT' ? JSON.stringify({ figures: { months: [], invoices: [] } }) : undefined });
    assert.equal(response.status, 401);
  }
  assert.deepEqual((await current.get('/api/figures')).json.figures, figures);
});
