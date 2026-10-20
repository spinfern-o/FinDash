/* Checking a delivery against its invoice: three cases billed and two
   received keeps the billed amounts as printed, records the shortage with a
   possible value only when that value means something, and is resolved
   once, with a credit counted once; the ledger refuses checks that break
   those rules. The invoices are made up. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyInventory, addItem, addChecks, replaceCheck, validateInventory } from '../../frontend/js/stock/ledger.js';
import { newCheck, resolvedCheck, possibleValue, billedInItemUnits, openChecks, creditInvoice } from '../../frontend/js/stock/receiving.js';
import { reviewedInvoice } from '../../backend/services/invoice-sync.js';

const OIL = { id: 'oil', original: 'Soybean oil 35 lb', description: '黄豆油', unit: 'case', location: 'Back' };
const RICE = { id: 'rice', original: 'Jasmine rice', description: '香米', unit: 'bag', location: 'Back',
  packs: [{ unit: 'case', contains: 4 }] };
const DOCUMENT = { supplier: 'Golden Harbor Foods', document_number: 'GH-5501', currency: 'USD' };
const AT = '2026-10-19T09:00:00.000Z';

function line(quantity, unit, price, amount) {
  return { description: 'Soybean oil', original: 'Soybean oil 35 lb', quantity, unit, unit_price: price,
    amount: amount === undefined ? quantity * price : amount, category: 'cogs' };
}

function shortCheck(extra) {
  return newCheck(Object.assign({ id: 'check-1', at: AT, source: 'stock-abc', document: DOCUMENT, line: line(3, 'case', 40),
    item: OIL, received: 2, status: 'short', note: 'Driver said one case is on the next truck' }, extra));
}

test('F: billed three cases, received two: the billed amounts stay as printed and the gap is a check', function () {
  const check = shortCheck();
  assert.deepEqual(check.billed, { quantity: 3, unit: 'case' });
  assert.deepEqual(check.received, { quantity: 2, unit: 'case' });
  assert.equal(check.status, 'short');
  assert.equal(check.state, 'open');
  assert.equal(check.possibleValue, 40, 'one case at $40 a case, to check with the supplier');
  assert.equal(check.currency, 'USD');
  assert.equal(check.history[0].note, 'Driver said one case is on the next truck');
  const inventory = addChecks(addItem(emptyInventory(), OIL), [check]);
  assert.deepEqual(openChecks(inventory).map(function (entry) { return entry.id; }), ['check-1']);
});

test('a possible value is only worked out when the price is per the unit billed', function () {
  assert.equal(possibleValue(OIL, line(3, 'case', 1.37, 164.4), 2), null, 'a case billed by the pound');
  assert.equal(possibleValue(RICE, line(2, 'case', 30), 4), 30, 'four bags is one case of the two billed');
  assert.equal(possibleValue({ ...RICE, packs: [] }, line(2, 'case', 30), 4), null, 'a case of unknown size');
  assert.equal(possibleValue(OIL, line(3, 'case', 0, 0), 2), null, 'free goods have no value to claim');
  assert.equal(possibleValue(OIL, line(3, 'case', 40), 3), null, 'nothing missing');
  assert.equal(billedInItemUnits(RICE, line(2, 'case', 30)), 8);
  assert.equal(billedInItemUnits({ ...RICE, packs: [] }, line(2, 'case', 30)), null);
});

test('a check is resolved once: a credit is recorded with its history and cannot be counted again', function () {
  const check = shortCheck();
  const credited = resolvedCheck(check, { state: 'credited', at: '2026-10-20T10:00:00.000Z', note: 'Credit note CN-12',
    credit: { amount: 40, reference: 'CN-12' } });
  assert.deepEqual(credited.credit, { amount: 40, reference: 'CN-12' });
  assert.deepEqual(credited.history.map(function (entry) { return entry.state; }), ['open', 'credited']);
  assert.deepEqual(credited.billed, check.billed, 'the billed amounts are not touched');
  assert.throws(function () { resolvedCheck(credited, { state: 'credited', at: AT, credit: { amount: 40 } }); }, /already resolved/);
  assert.throws(function () { resolvedCheck(check, { state: 'credited', at: AT }); }, /amount/);

  const inventory = addChecks(addItem(emptyInventory(), OIL), [check]);
  const after = replaceCheck(inventory, credited);
  assert.equal(after.checks[0].state, 'credited');
  assert.equal(inventory.checks[0].state, 'open', 'the earlier ledger is not changed');
});

test('a credit taken off the P&L is one negative line, with an id that can only be added once', function () {
  const invoice = creditInvoice(shortCheck(), { amount: 40, reference: 'CN-12' }, '2026-10', '2026-10-20');
  assert.equal(invoice.id, 'credit-check-1');
  assert.equal(invoice.total, -40);
  assert.deepEqual(invoice.lines.map(function (entry) { return [entry.category, entry.amount]; }), [['cogs', -40]]);
  assert.equal(reviewedInvoice(invoice).total, -40, 'the server accepts it as a reviewed invoice');
  assert.equal(creditInvoice(shortCheck({ line: { ...line(3, 'case', 40), category: 'casino' } }), { amount: 5 }, '2026-10', '2026-10-20')
    .lines[0].category, 'cogs', 'an unknown cost line falls back to food and drink');
});

test('the ledger refuses checks that break the rules', function () {
  const base = addItem(emptyInventory(), OIL);
  const check = shortCheck();
  const broken = [
    { ...check, itemId: 'nobody' },
    { ...check, status: 'lost' },
    { ...check, state: 'credited' },
    { ...check, credit: { amount: 40 } },
    { ...check, history: [] },
    { ...check, history: [{ at: AT, state: 'resolved' }] },
    { ...check, billed: { quantity: -1, unit: 'case' } },
    { ...check, currency: 'dollars' },
    { ...check, extra: true }
  ];
  for (const bad of broken) {
    assert.throws(function () { addChecks(base, [bad]); }, undefined, JSON.stringify(bad).slice(0, 80));
  }
  assert.throws(function () { addChecks(base, [check, check]); }, /Duplicate/);
  assert.doesNotThrow(function () { validateInventory(addChecks(base, [check])); });
});
