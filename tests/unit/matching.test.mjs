/* Matching invoice lines to the owner's items: a confirmed supplier code
   finds its item again, the same wording is only suggested, a wrong code
   can be moved to the right item without touching history, and a pack
   size is remembered per unit. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyInventory, addItem, recordMovement } from '../../frontend/js/stock/ledger.js';
import { itemForCode, suggestedItems, rememberCode, rememberPack } from '../../frontend/js/stock/matching.js';

function setUp() {
  let inventory = emptyInventory();
  inventory = addItem(inventory, { id: 'rice', original: 'Jasmine rice 50 lb', description: '香米', unit: 'bag', location: 'Back' });
  inventory = addItem(inventory, { id: 'rice-front', original: 'Jasmine rice 50 lb', description: '香米', unit: 'bag', location: 'Front' });
  inventory = addItem(inventory, { id: 'oil', original: 'Soybean oil', description: '黄豆油', unit: 'bucket', location: 'Back' });
  return recordMovement(inventory, { id: 'm1', itemId: 'rice', type: 'count', quantity: 3, at: '2026-10-19T09:00:00.000Z' });
}

test('a confirmed supplier code finds its item again, whatever the wording says', function () {
  const inventory = rememberCode(setUp(), 'rice', 'Golden Harbor Foods', 'GH-450');
  assert.equal(itemForCode(inventory, 'golden harbor foods ', 'gh-450').id, 'rice');
  assert.equal(itemForCode(inventory, 'Another Supplier', 'GH-450'), null, 'codes are per supplier');
  const suggestions = suggestedItems(inventory, 'Golden Harbor Foods', { code: 'GH-450', original: 'JASMINE RICE 25LB' });
  assert.deepEqual(suggestions.map(function (entry) { return [entry.item.id, entry.reason]; }), [['rice', 'code']]);
});

test('without a code, items with the same supplier wording are suggested, never chosen', function () {
  const suggestions = suggestedItems(setUp(), 'Golden Harbor Foods', { code: null, original: 'jasmine rice 50 lb' });
  assert.deepEqual(suggestions.map(function (entry) { return [entry.item.id, entry.reason]; }),
    [['rice', 'wording'], ['rice-front', 'wording']]);
  assert.deepEqual(suggestedItems(setUp(), 'Golden Harbor Foods', { original: '香米' }), [],
    'a matching translation alone is not a match');
});

test('a wrong code moves to the right item; stock already recorded is not changed', function () {
  const wrong = rememberCode(setUp(), 'oil', 'Golden Harbor Foods', 'GH-450');
  const fixed = rememberCode(wrong, 'rice', 'Golden Harbor Foods', 'GH-450');
  assert.equal(itemForCode(fixed, 'Golden Harbor Foods', 'GH-450').id, 'rice');
  assert.equal(fixed.items.find(function (item) { return item.id === 'oil'; }).supplierCodes, undefined);
  assert.deepEqual(fixed.movements, setUp().movements);
  assert.equal(rememberCode(fixed, 'rice', 'Golden Harbor Foods', 'GH-450'), fixed, 'confirming it again changes nothing');
});

test('a pack size is remembered per unit, and replaced when it changes', function () {
  let inventory = rememberPack(setUp(), 'rice', 'case', 4);
  assert.deepEqual(inventory.items[0].packs, [{ unit: 'case', contains: 4 }]);
  inventory = rememberPack(inventory, 'rice', 'Case', 2);
  assert.deepEqual(inventory.items[0].packs, [{ unit: 'Case', contains: 2 }]);
  assert.equal(rememberPack(inventory, 'rice', 'bag', 1), inventory, "the item's own unit needs no pack size");
});
