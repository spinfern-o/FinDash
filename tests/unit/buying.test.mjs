/* The buying list: below the minimum, a suggestion up to the target in the
   item's unit and location; unknown, zero and out-of-date stock each said
   for what they are; whole packs only when the pack is confirmed; what a
   supplier still owes shown, not subtracted; and a CSV a spreadsheet can't
   run as formulas. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyInventory, addItem, recordMovement, addChecks, updateItem } from '../../frontend/js/stock/ledger.js';
import { buyingList, buyingListCsv } from '../../frontend/js/stock/buying.js';

const NOW = new Date('2026-10-20T12:00:00.000Z');

function item(id, extra) {
  return Object.assign({ id: id, original: id + ' (supplier wording)', description: id, unit: 'bag', location: 'Back' }, extra);
}

function counted(inventory, itemId, quantity, at) {
  return recordMovement(inventory, { id: itemId + '-' + at, itemId: itemId, type: 'count', quantity: quantity, at: at });
}

function setUp() {
  let inventory = emptyInventory();
  inventory = addItem(inventory, item('rice', { reorder: { minimum: 3, target: 5, supplier: 'Golden Harbor' } }));
  inventory = addItem(inventory, item('flour', { reorder: { minimum: 2 } }));
  inventory = addItem(inventory, item('salt', { reorder: { minimum: 1 } }));
  inventory = addItem(inventory, item('sugar', { reorder: { minimum: 2 } }));
  inventory = addItem(inventory, item('tea'));
  inventory = counted(inventory, 'rice', 2, '2026-10-19T09:00:00.000Z');
  inventory = counted(inventory, 'flour', 0, '2026-10-19T09:00:00.000Z');
  inventory = counted(inventory, 'sugar', 1, '2026-10-01T09:00:00.000Z');
  inventory = counted(inventory, 'tea', 0, '2026-10-19T09:00:00.000Z');
  return inventory;
}

function entry(list, id) {
  return list.find(function (candidate) { return candidate.item.id === id; });
}

test('G: 2 bags against a minimum of 3 and a target of 5 suggests 3 bags, with the reason', function () {
  const rice = entry(buyingList(setUp(), NOW), 'rice');
  assert.equal(rice.state, 'low');
  assert.equal(rice.onHand, 2);
  assert.deepEqual(rice.suggestion, { quantity: 3, packs: null, packUnit: null });
  assert.deepEqual([rice.item.unit, rice.item.location, rice.item.reorder.minimum, rice.item.reorder.target],
    ['bag', 'Back', 3, 5]);
  assert.equal(rice.isStale, false);
});

test('zero, unknown and out-of-date stock are each said for what they are', function () {
  const list = buyingList(setUp(), NOW);
  const flour = entry(list, 'flour');
  assert.deepEqual([flour.state, flour.onHand, flour.suggestion.quantity], ['low', 0, 2], 'an empty shelf, counted');
  const salt = entry(list, 'salt');
  assert.deepEqual([salt.state, salt.onHand, salt.suggestion, salt.lastUpdated], ['unknown', null, null, null],
    'never counted: no suggestion');
  const sugar = entry(list, 'sugar');
  assert.equal(sugar.isStale, true, 'counted 19 days ago');
  assert.equal(sugar.lastUpdated, '2026-10-01T09:00:00.000Z');
  assert.equal(entry(list, 'tea'), undefined, 'no minimum set, so not on the list');
});

test('quantities round up to whole packs only when the pack size is confirmed', function () {
  let inventory = setUp();
  inventory = updateItem(inventory, 'rice', { packs: [{ unit: 'case', contains: 4 }],
    reorder: { minimum: 3, target: 5, buyUnit: 'case' } });
  assert.deepEqual(entry(buyingList(inventory, NOW), 'rice').suggestion, { quantity: 4, packs: 1, packUnit: 'case' });
  assert.throws(function () { updateItem(setUp(), 'rice', { reorder: { minimum: 3, buyUnit: 'case' } }); },
    /pack's size/, 'buying in cases needs a confirmed case size');
  assert.throws(function () { updateItem(setUp(), 'rice', { reorder: { minimum: 5, target: 3 } }); }, /at least the minimum/);
});

test('what a supplier still owes is shown beside the suggestion, not taken off it', function () {
  const inventory = addChecks(setUp(), [{ id: 'c1', at: '2026-10-19T09:00:00.000Z', source: 'stock-1', supplier: 'Golden Harbor',
    itemId: 'rice', original: 'rice (supplier wording)', billed: { quantity: 4, unit: 'bag' },
    received: { quantity: 3, unit: 'bag' }, status: 'short', state: 'open',
    history: [{ at: '2026-10-19T09:00:00.000Z', state: 'open' }] }]);
  const rice = entry(buyingList(inventory, NOW), 'rice');
  assert.equal(rice.owed, 1);
  assert.equal(rice.suggestion.quantity, 3, 'the suggestion is unchanged');
});

test('the CSV keeps every cell as text, so a spreadsheet never runs one', function () {
  const csv = buyingListCsv([['Golden Harbor', '=HYPERLINK("x")', '大米', 'Back', 3, 'bag']],
    ['Supplier', 'Item', 'Supplier wording', 'Location', 'Quantity', 'Unit']);
  assert.ok(csv.startsWith('﻿"Supplier"'));
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /"大米"/);
});
