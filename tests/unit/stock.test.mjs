/* Physical balances are independent of invoice spending and item labels. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyInventory, addItem, recordMovement, stockOnHand, validateInventory } from "../../frontend/js/stock/ledger.js";

const RICE = { id: "rice", original: "Jasmine rice", description: "茉莉香米", unit: "袋", location: "后仓" };

/* A confirmed item starts without any claim about what is on its shelf. */
function itemLedger() {
  return addItem(emptyInventory(), RICE);
}

/* Each test event has a reproducible recorded time. */
function change(state, id, type, quantity, itemId = "rice") {
  return recordMovement(state, { id, itemId, type, quantity, at: "2026-10-17T01:00:00.000Z" });
}

test("a bilingual item has unknown stock until a physical count, with no mutation", function () {
  const original = emptyInventory();
  const state = addItem(original, RICE);
  assert.deepEqual(original, emptyInventory());
  assert.equal(stockOnHand(state, "rice"), null);
  assert.throws(function () { change(state, "delivery", "delivery", 20); }, /Count/);
  const counted = change(state, "opening", "count", 8);
  assert.equal(stockOnHand(counted, "rice"), 8);
  assert.equal(stockOnHand(state, "rice"), null);
  assert.deepEqual(counted.items[0], RICE);
});

test("delivery, usage and waste adjust the same explicit unit; a fresh count reconciles", function () {
  let state = change(itemLedger(), "opening", "count", 8);
  state = change(state, "arrived", "delivery", 3);
  state = change(state, "used", "usage", 2.5);
  state = change(state, "spoiled", "waste", 0.5);
  assert.equal(stockOnHand(state, "rice"), 8);
  state = change(state, "recount", "count", 5);
  assert.equal(stockOnHand(state, "rice"), 5);
  state = change(state, "empty", "count", 0);
  assert.equal(stockOnHand(state, "rice"), 0);
});

test("locations and packaging stay independent, even for the same supplier description", function () {
  let state = addItem(itemLedger(), { ...RICE, id: "rice-front", unit: "case", location: "Front shelf" });
  state = change(state, "back-count", "count", 8);
  state = change(state, "front-count", "count", 2, "rice-front");
  state = change(state, "front-use", "usage", 1, "rice-front");
  assert.equal(stockOnHand(state, "rice"), 8);
  assert.equal(stockOnHand(state, "rice-front"), 1);
});

test("duplicate events and impossible reductions cannot alter history", function () {
  const state = change(itemLedger(), "opening", "count", 2);
  assert.throws(function () { change(state, "opening", "delivery", 1); }, /Duplicate movement/);
  assert.throws(function () { change(state, "too-much", "usage", 3); }, /negative/);
  assert.throws(function () { change(state, "too-much", "waste", 3); }, /negative/);
  const empty = change(state, "empty", "count", 0);
  assert.throws(function () { change(empty, "tiny-overdraw", "usage", 1e-12); }, /negative/);
  assert.equal(stockOnHand(state, "rice"), 2);
});

test("every persisted field, reference, quantity and history is validated", function () {
  const state = itemLedger();
  for (const field of ["id", "original", "description", "unit", "location"]) {
    assert.throws(function () { addItem(emptyInventory(), { ...RICE, [field]: " " }); }, /text/);
  }
  for (const quantity of [-1, NaN, Infinity, "3", 1_000_000_001]) {
    assert.throws(function () { change(state, "bad", "count", quantity); }, /Quantity/);
  }
  assert.throws(function () { addItem(state, RICE); }, /Duplicate item/);
  assert.throws(function () { change(state, "bad", "count", 1, "absent"); }, /unknown item/);
  assert.throws(function () { change(state, "bad", "purchase", 1); }, /Movement type/);
  assert.throws(function () { stockOnHand(state, "absent"); }, /Unknown item/);
  assert.throws(function () { validateInventory({ ...state, photo: "data" }); }, /Unexpected/);
  assert.throws(function () { validateInventory({ ...state, version: 2 }); }, /version/);
  assert.throws(function () { recordMovement(state, { id: "bad", itemId: "rice", type: "count", quantity: 1,
    at: "tomorrow" }); }, /ISO/);
  assert.throws(function () { recordMovement(state, { id: "bad", itemId: "rice", type: "count", quantity: 1,
    note: "x".repeat(301) }); }, /note/);
  const valid = change(state, "opening", "count", 0);
  assert.deepEqual(validateInventory(JSON.parse(JSON.stringify(valid))), valid);
});

test("decimal stock can be fully consumed without a floating-point negative balance", function () {
  let state = change(itemLedger(), "opening", "count", 0.3);
  state = change(state, "first", "usage", 0.1);
  state = change(state, "second", "usage", 0.2);
  assert.equal(stockOnHand(state, "rice"), 0);
});
