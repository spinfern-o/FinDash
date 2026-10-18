/* Counting a shelf from a photo, and what it means.

   The one rule the whole feature rests on: a confirmed photo count is an
   absolute observation of one shelf, so the refill still needed is always
   max(0, shelf target - what is on the shelf now). Photographing the same
   shelf again replaces that answer. Shortages are never added up, and a
   newer count is never subtracted from an older one.

   Test names carry the numbers of the acceptance criteria they cover. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyInventory, addItem, recordMovement, updateItem, validateInventory, stockOnHand } from '../../frontend/js/stock/ledger.js';
import { latestCount, recordShelfCount, refillNeeded, shelfDraft, shelfRefill } from '../../frontend/js/stock/shelf.js';
import { buyingList } from '../../frontend/js/stock/buying.js';

const MILK = { id: 'milk', original: 'WHOLE MILK 1GAL', description: '全脂牛奶', unit: 'carton', location: 'Front fridge' };
const EGGS = { id: 'eggs', original: 'LARGE EGGS', description: '鸡蛋', unit: 'tray', location: 'Pantry' };
const MILK_BACK = { id: 'milk-back', original: 'WHOLE MILK 1GAL', description: '全脂牛奶', unit: 'carton', location: 'Back room' };

// A photo's digest; the real one is a SHA-256 of the file.
function digest(seed) {
  return String(seed).repeat(64).slice(0, 64).replace(/[^0-9a-f]/g, 'a');
}

/* Milk on the front fridge, with a shelf target of 10 cartons. */
function shelf(target = 10) {
  return addItem(emptyInventory(), { ...MILK, shelfTarget: target });
}

/* One confirmed photo count, as the page saves it. */
function scan(inventory, seen, seed, extra = {}) {
  const latest = latestCount(inventory, extra.itemId || 'milk');
  return recordShelfCount(inventory, {
    id: 'scan-' + seed, itemId: 'milk', quantity: seen, hash: digest(seed),
    at: '2026-10-18T09:' + String(seed).padStart(2, '0') + ':00.000Z',
    since: latest ? latest.id : null, ...extra
  });
}

function refillOf(inventory, itemId = 'milk') {
  const entry = shelfRefill(inventory).find(function (candidate) { return candidate.item.id === itemId; });
  return entry ? entry.refill : undefined;
}

test('T01-T03: 7, then 8, then 10 against a target of 10 asks for 3, then 2, then nothing', function () {
  let inventory = scan(shelf(), 7, 1);
  assert.equal(refillOf(inventory), 3, 'T01');

  inventory = scan(inventory, 8, 2);
  assert.equal(refillOf(inventory), 2, 'T02: not 5, and not 3 minus 2');
  assert.deepEqual(inventory.movements.map(function (movement) { return movement.quantity; }), [7, 8],
    'T02: both counts stay in the history');

  inventory = scan(inventory, 10, 3);
  assert.equal(refillOf(inventory), 0, 'T03: the shelf is full, so nothing is asked for');
  assert.deepEqual(inventory.movements.map(function (movement) { return movement.quantity; }), [7, 8, 10],
    'T03: the history is kept');
  assert.equal(shelfRefill(inventory).length, 1, 'T03: one shelf, one answer, after three photos');
});

test('T04: a shelf confirmed empty asks for the whole target, and is not "not counted"', function () {
  const inventory = scan(shelf(), 0, 4);
  assert.equal(refillOf(inventory), 10);
  assert.equal(stockOnHand(inventory, 'milk'), 0);
  assert.equal(shelfRefill(inventory)[0].onShelf, 0, 'a confirmed zero, not unknown');
});

test('T05: a reading with no reliable count offers no number, and nothing changes', function () {
  const unreadable = { showsItem: true, usable: false, coverage: 'unclear', visibleCount: null,
    countType: 'none', reliability: 'poor', obstructed: true, qualityFlags: ['blurry'], explanation: 'Too dark.' };
  assert.deepEqual(shelfDraft(unreadable), { count: null, seen: null, problem: 'cantCount' });

  const estimate = { showsItem: true, usable: true, coverage: 'complete', visibleCount: 6,
    countType: 'visible-exact', reliability: 'poor', obstructed: false, qualityFlags: [], explanation: '' };
  assert.equal(shelfDraft(estimate).count, null, 'a count the model is unsure of is not offered');

  const inventory = scan(shelf(), 7, 1);
  assert.equal(refillOf(inventory), 3, 'the previous need is untouched by a failed reading');
});

test('T07: the owner\'s own number is what is saved, and the change is recorded', function () {
  const draft = shelfDraft({ showsItem: true, usable: true, coverage: 'complete', visibleCount: 8,
    countType: 'visible-exact', reliability: 'good', obstructed: false, qualityFlags: [], explanation: '' });
  assert.equal(draft.count, 8);
  const inventory = scan(shelf(), 6, 7, { corrected: draft.count !== 6 });
  assert.equal(stockOnHand(inventory, 'milk'), 6);
  assert.equal(refillOf(inventory), 4);
  assert.match(inventory.movements[0].note, /^photo-count:[0-9a-f]{64} corrected$/);
});

test('T08: the same photo cannot be counted twice, however often it is sent', function () {
  const inventory = scan(shelf(), 7, 1);
  assert.throws(function () { scan(inventory, 7, 1); }, /alreadyCounted/);
  assert.throws(function () { scan(inventory, 9, 1, { corrected: true }); }, /alreadyCounted/,
    'nor by correcting the number on a resend');
  assert.equal(inventory.movements.length, 1);
  assert.equal(shelfRefill(inventory).length, 1, 'one live shortage, not two');
});

test('T09: counting the front fridge leaves the eggs and the back room alone', function () {
  let inventory = addItem(addItem(shelf(), EGGS), { ...MILK_BACK, shelfTarget: 24 });
  inventory = recordMovement(inventory, { id: 'eggs-count', itemId: 'eggs', type: 'count', quantity: 12,
    at: '2026-10-18T08:00:00.000Z' });
  inventory = recordMovement(inventory, { id: 'back-count', itemId: 'milk-back', type: 'count', quantity: 20,
    at: '2026-10-18T08:00:00.000Z' });
  inventory = scan(inventory, 7, 1);
  assert.equal(stockOnHand(inventory, 'eggs'), 12);
  assert.equal(stockOnHand(inventory, 'milk-back'), 20);
  assert.equal(refillOf(inventory, 'milk-back'), 4, 'the back room keeps its own target and its own count');
  assert.equal(refillOf(inventory), 3);
});

test('T10: without a shelf target nothing is missing, and a part of a shelf is not the shelf', function () {
  const noTarget = addItem(emptyInventory(), MILK);
  const counted = recordShelfCount(noTarget, { id: 'c', itemId: 'milk', quantity: 8, hash: digest(1),
    at: '2026-10-18T09:00:00.000Z', since: null });
  assert.deepEqual(shelfRefill(counted), [], 'no target: a count, but no invented shortage');
  assert.equal(stockOnHand(counted, 'milk'), 8);
  assert.equal(refillNeeded(undefined, 8), null);

  const partial = shelfDraft({ showsItem: true, usable: true, coverage: 'partial', visibleCount: 6,
    countType: 'visible-exact', reliability: 'good', obstructed: false, qualityFlags: ['cropped'], explanation: '' });
  assert.deepEqual(partial, { count: null, seen: 6, problem: 'partialShelf' },
    'part of the shelf is shown for what it is, and not offered as the shelf count');
});

test('T11: a reading taken before a newer count cannot be saved over it', function () {
  const first = scan(shelf(), 7, 1);
  const newest = latestCount(first, 'milk');
  const second = scan(first, 10, 2);
  // A slower reading of the earlier photo, confirmed after the newer count.
  assert.throws(function () {
    recordShelfCount(second, { id: 'late', itemId: 'milk', quantity: 7, hash: digest(3),
      at: '2026-10-18T09:05:00.000Z', since: newest.id });
  }, /newerCount/);
  assert.equal(refillOf(second), 0);
  assert.equal(latestCount(second, 'milk').quantity, 10, 'the newest count is still the newest');
});

test('T14, T15: a photo count is stock only; invoices and purchases are not touched', function () {
  let inventory = scan(shelf(), 7, 1);
  // An invoice for 12 cartons, confirmed on the same day as the photo.
  inventory = recordMovement(inventory, { id: 'invoice-count', itemId: 'milk', type: 'delivery', quantity: 12,
    at: '2026-10-18T10:00:00.000Z', note: 'source:invoice' });
  assert.equal(stockOnHand(inventory, 'milk'), 19, 'the delivery adds to the counted shelf, once');
  assert.deepEqual(Object.keys(inventory).sort(), ['items', 'movements', 'version'],
    'T14: nothing financial lives in the ledger');
  for (const movement of inventory.movements) {
    assert.ok(['count', 'delivery'].includes(movement.type));
    assert.equal(movement.amount, undefined, 'T14: a count carries no money');
  }
  // T15: what the shelf itself needs is answered by photographing it again.
  const rescanned = scan(inventory, 7, 5);
  assert.equal(refillOf(rescanned), 3, 'the shelf, not the invoice, says what the shelf needs');
});

test('T18: two similar products are separate shelves and never merge', function () {
  let inventory = addItem(shelf(), { id: 'almond', original: 'ALMOND MILK 1GAL', description: '杏仁奶',
    unit: 'carton', location: 'Front fridge', shelfTarget: 6 });
  inventory = scan(inventory, 7, 1);
  const list = shelfRefill(inventory);
  assert.deepEqual(list.map(function (entry) { return [entry.item.id, entry.refill]; }),
    [['milk', 3], ['almond', null]], 'the almond milk was not counted by the milk photo');
});

test('T19: raising the target changes what is needed without inventing a count', function () {
  let inventory = scan(shelf(10), 8, 1);
  assert.equal(refillOf(inventory), 2);
  inventory = updateItem(inventory, 'milk', { shelfTarget: 12 });
  assert.equal(refillOf(inventory), 4);
  assert.equal(inventory.movements.length, 1, 'no new physical count was made up');
  assert.equal(latestCount(inventory, 'milk').quantity, 8);
});

test('T20: a confirmed case size is for buying, never for the shelf count', function () {
  let inventory = scan(shelf(10), 7, 1);
  inventory = updateItem(inventory, 'milk', {
    packs: [{ unit: 'case', contains: 6 }],
    reorder: { minimum: 8, target: 24, buyUnit: 'case' }
  });
  assert.equal(refillOf(inventory), 3, 'the shelf needs 3 cartons, not a whole case');
  const buying = buyingList(inventory, new Date('2026-10-18T12:00:00.000Z'))[0];
  assert.deepEqual(buying.suggestion, { quantity: 18, packs: 3, packUnit: 'case' },
    'buying rounds up to whole cases; refilling the shelf does not');
});

test('T21: a shelf count is a whole number of the item\'s own units', function () {
  for (const bad of [-1, 2.5, NaN, Infinity, '7', null, undefined, 100001]) {
    assert.throws(function () {
      recordShelfCount(shelf(), { id: 'c', itemId: 'milk', quantity: bad, hash: digest(1),
        at: '2026-10-18T09:00:00.000Z', since: null });
    }, /wholeNumber/, String(bad));
  }
  for (const badHash of ['', 'not-a-digest', digest(1) + 'a', '../../etc']) {
    assert.throws(function () {
      recordShelfCount(shelf(), { id: 'c', itemId: 'milk', quantity: 7, hash: badHash,
        at: '2026-10-18T09:00:00.000Z', since: null });
    }, /invalid/, badHash);
  }
  assert.throws(function () { validateInventory(addItem(emptyInventory(), { ...MILK, shelfTarget: 0 })); },
    /Shelf target/, 'a shelf that should hold nothing is not a shelf target');
  for (const bad of [-1, 'ten', NaN]) {
    assert.throws(function () { addItem(emptyInventory(), { ...MILK, shelfTarget: bad }); }, /Shelf target/);
  }
});

test('T25: a shelf target is an addition older copies refuse rather than drop', function () {
  const withTarget = shelf(10);
  assert.deepEqual(validateInventory(JSON.parse(JSON.stringify(withTarget))), withTarget,
    'a ledger with a shelf target is valid');
  // What a page from before this change does with it: checkKeys refuses an
  // unknown item field, so such a page reports the ledger as unreadable and
  // saves nothing over it.
  assert.throws(function () { validateInventory({ ...withTarget, items: [{ ...MILK, shelfCapacity: 10 }] }); },
    /Unexpected item field/);
  // Everything saved before this change stays valid.
  assert.deepEqual(validateInventory(addItem(emptyInventory(), MILK)).items[0], MILK);
  const removed = updateItem(withTarget, 'milk', { shelfTarget: null });
  assert.equal(removed.items[0].shelfTarget, undefined);
  assert.deepEqual(shelfRefill(removed), []);
});

test('the shelf shows one number, the same one the stock list and the dashboard show', function () {
  // T22's arithmetic: both views read stockOnHand from this ledger, so a
  // count, and anything recorded after it, move them together.
  let inventory = scan(shelf(), 8, 1);
  inventory = recordMovement(inventory, { id: 'used', itemId: 'milk', type: 'usage', quantity: 2,
    at: '2026-10-18T11:00:00.000Z' });
  assert.equal(stockOnHand(inventory, 'milk'), 6);
  assert.equal(refillOf(inventory), 4, 'two cartons used since the count are two more to put out');
});
