/* Comparing prices only when they are for the same amount of the same
   thing: the safe unit conversions, the examples the owner would hit (a
   price per pound then per kilogram, a smaller bag, a case of unknown
   contents, a free item, another currency), the price per something else,
   and package sizes confirmed from one delivery on without rewriting the
   ones before. The invoices are made up. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { convertQuantity, convertibleUnit, isFixedMeasure, standardUnitName } from "../../frontend/js/dashboard/units.js";
import { comparePrices, measuredPrice } from "../../frontend/js/dashboard/price-comparison.js";
import { itemsBought, confirmPackage, itemKey } from "../../frontend/js/dashboard/items.js";

/* One purchase as price-comparison.js sees it. */
function purchase(quantity, unit, unitPrice, extra) {
  return Object.assign({ quantity: quantity, unit: unit, unitPrice: unitPrice,
    amount: Math.round(quantity * unitPrice * 100) / 100, currency: null, pack: null, billedPer: null }, extra);
}

function invoice(date, lines, extra) {
  return Object.assign({ id: date, kind: "purchase", supplier: "Golden Harbor Foods", number: "", date: date,
    year: 2026, monthNum: Number(date.slice(5, 7)), total: 0, lines: lines, addedAt: date + "T12:00:00Z" }, extra);
}

function line(quantity, unit, unitPrice, extra) {
  return Object.assign({ description: "Jasmine rice", code: "GH-450", category: "cogs", quantity: quantity,
    unit: unit, unitPrice: unitPrice, amount: Math.round(quantity * unitPrice * 100) / 100 }, extra);
}

test("units are recognised however an invoice writes them, in English or Chinese", function () {
  const written = ["LBS", "Kilos", "公斤", "#", "PCS", "個", "Litres", "毫升", "Dozen", "Cases", "CT"];
  assert.deepEqual(written.map(standardUnitName),
    ["lb", "kg", "kg", "lb", "each", "each", "l", "ml", "dozen", "case", "ct"]);
});

test("only weight to weight, volume to volume and count to count convert", function () {
  assert.equal(Math.round(convertQuantity(2, "lb", "kg") * 1e6) / 1e6, 0.907185);
  assert.equal(convertQuantity(1500, "ml", "l"), 1.5);
  assert.equal(convertQuantity(2, "dozen", "each"), 24);
  assert.equal(convertQuantity(1, "kg", "l"), null, "a kilogram of oil is not a litre without knowing the oil");
  assert.equal(convertQuantity(1, "case", "kg"), null);
});

test("ounces, gallons and 斤 are fixed measures, but never converted", function () {
  for (const unit of ["oz", "fl oz", "gal", "qt", "斤"]) {
    assert.equal(isFixedMeasure(unit), true, unit);
    assert.equal(convertibleUnit(unit), null, unit);
  }
  assert.equal(convertQuantity(1, "oz", "g"), null, "an ounce of weight, or a fluid ounce?");
  assert.equal(convertQuantity(1, "gal", "l"), null, "a US gallon, or an imperial one?");
  assert.deepEqual(comparePrices(purchase(1, "gal", 12), purchase(1, "l", 3)), { state: "units" });
  assert.equal(comparePrices(purchase(1, "gal", 12), purchase(1, "gal", 10)).percent, 20);
});

test("A: $2 a pound then $3 a kilogram is about 32% cheaper, never a 50% rise", function () {
  const result = comparePrices(purchase(10, "kg", 3), purchase(10, "lb", 2));
  assert.equal(result.state, "change");
  assert.equal(result.percent, -32);
  assert.equal(result.per, "kg");
  assert.equal(result.change, -1.409, "$2/lb is about $4.41/kg");
});

test("B: $40 for a 50 lb bag then $30 for a 25 lb bag is 50% dearer", function () {
  const result = comparePrices(purchase(1, "bag", 30, { pack: { quantity: 25, unit: "lb" } }),
    purchase(1, "bag", 40, { pack: { quantity: 50, unit: "lb" } }));
  assert.deepEqual(result, { state: "change", change: 0.4, percent: 50, per: "lb" });
});

test("C: two cases are compared only once what a case holds is confirmed", function () {
  assert.deepEqual(comparePrices(purchase(1, "case", 42), purchase(1, "case", 40)), { state: "package" });
  const unconfirmedEarlier = comparePrices(purchase(1, "case", 42, { pack: { quantity: 6, unit: "l" } }),
    purchase(1, "case", 40));
  assert.deepEqual(unconfirmedEarlier, { state: "package" });
  const both = comparePrices(purchase(1, "case", 42, { pack: { quantity: 6, unit: "l" } }),
    purchase(1, "case", 40, { pack: { quantity: 6, unit: "l" } }));
  assert.deepEqual(both, { state: "change", change: 2, percent: 5, per: "case" });
  const differentCases = comparePrices(purchase(1, "case", 42, { pack: { quantity: 6, unit: "l" } }),
    purchase(1, "case", 40, { pack: { quantity: 12, unit: "l" } }));
  assert.equal(differentCases.per, "l", "different cases are compared per litre");
  assert.equal(differentCases.percent, 110);
});

test("D: a free item stays stock, but is never the price a change is measured from", function () {
  assert.deepEqual(measuredPrice(purchase(2, "case", 0)), { problem: "free" });
  const items = itemsBought([
    invoice("2026-09-01", [line(2, "kg", 3)]),
    invoice("2026-09-08", [line(1, "kg", 0)]),
    invoice("2026-09-15", [line(2, "kg", 3.3)])
  ]);
  assert.equal(items[0].priceChangePercent, 10, "against the last price paid, not the free one");
  assert.deepEqual(items[0].quantities, [{ unit: "kg", quantity: 5 }], "the free kilogram is still counted");
});

test("E: prices in different currencies are not compared", function () {
  const result = comparePrices(purchase(1, "kg", 5, { currency: "CAD" }), purchase(1, "kg", 4, { currency: "USD" }));
  assert.deepEqual(result, { state: "currency" });
  assert.equal(comparePrices(purchase(1, "kg", 5, { currency: "USD" }), purchase(1, "kg", 4)).state, "change",
    "an invoice from before currencies were kept is taken to be in the dashboard's");
});

test("a price per something other than the quantity's unit waits for the owner to say what", function () {
  // 3 cases of chicken, $1.37 printed, $164.40 charged: billed by the pound.
  const chicken = purchase(3, "case", 1.37, { amount: 164.4 });
  assert.deepEqual(measuredPrice(chicken), { problem: "basis" });
  assert.deepEqual(comparePrices(chicken, purchase(3, "case", 1.37, { amount: 160.2 })), { state: "basis" });
  const confirmed = comparePrices(Object.assign({}, chicken, { billedPer: "lb" }),
    purchase(3, "case", 1.29, { amount: 155, billedPer: "lb" }));
  assert.equal(confirmed.percent, 6.2);
  assert.equal(confirmed.per, "lb");
});

test("a size confirmed from one delivery applies to later ones, and leaves earlier history alone", function () {
  const key = itemKey("Golden Harbor Foods", { code: "GH-450" });
  const invoices = [
    invoice("2026-08-01", [line(1, "bag", 40)]),
    invoice("2026-09-01", [line(1, "bag", 40)]),
    invoice("2026-09-15", [line(1, "bag", 30)])
  ];
  const first = confirmPackage(invoices, key, "bag", "2026-09-01", { pack: { quantity: 50, unit: "lb" } });
  assert.equal(first.changed, 1);
  assert.equal(invoices[1].lines[0].pack, undefined, "the invoices passed in are not changed");
  let item = itemsBought(first.invoices)[0];
  assert.equal(item.priceComparison.percent, -25, "Sep 15 uses the 50 lb confirmed on Sep 1");
  assert.equal(first.invoices[0].lines[0].pack, undefined, "August keeps no size: it came before");

  // The supplier switches to a 25 lb bag from Sep 15.
  const second = confirmPackage(first.invoices, key, "bag", "2026-09-15", { pack: { quantity: 25, unit: "lb" } });
  item = itemsBought(second.invoices)[0];
  assert.deepEqual(item.priceComparison, { state: "change", change: 0.4, percent: 50, per: "lb" });
  assert.deepEqual(second.invoices[1].lines[0].pack, { quantity: 50, unit: "lb" }, "Sep 1 still holds 50 lb");
  const bags = item.units.find(function (entry) {
    return entry.unit === "bag";
  });
  assert.deepEqual([bags.pack, bags.packFrom, bags.dates], [{ quantity: 25, unit: "lb" }, "2026-09-15",
    ["2026-08-01", "2026-09-01", "2026-09-15"]]);
});

test("confirming a size changes only that item's lines in that unit, on that date", function () {
  const key = itemKey("Golden Harbor Foods", { code: "GH-450" });
  const other = line(1, "bag", 20, { code: "GH-999", description: "Flour" });
  const invoices = [invoice("2026-09-01", [line(1, "bag", 40), line(2, "kg", 3), other])];
  const result = confirmPackage(invoices, key, "bag", "2026-09-01", { pack: { quantity: 50, unit: "lb" } });
  assert.equal(result.changed, 1);
  const lines = result.invoices[0].lines;
  assert.deepEqual(lines[0].pack, { quantity: 50, unit: "lb" });
  assert.equal(lines[1].pack, undefined, "the same rice by the kilogram");
  assert.equal(lines[2].pack, undefined, "another item");
  assert.equal(confirmPackage(invoices, key, "bag", "2026-09-01", { pack: { quantity: 0, unit: "lb" } })
    .invoices[0].lines[0].pack, undefined, "an empty size is not kept");
});
