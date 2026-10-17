/* What the owner buys, item by item: the same item matched across invoices,
   quantities and money added up, price changes against the delivery
   before, and the count sheet's groups. The invoices are made up. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  itemsBought, invoicesWithoutItems, countSheetGroups, unitName, confirmPackage, itemKey
} from "../../frontend/js/dashboard/items.js";
import { cleanSavedFigures } from "../../frontend/js/dashboard/saved-figures.js";

/* A purchase invoice as the dashboard keeps one. */
function invoice(date, lines, changes) {
  return Object.assign({
    id: date, kind: "purchase", supplier: "Golden Harbor Foods", number: "", date: date,
    year: Number(date.slice(0, 4)), monthNum: Number(date.slice(5, 7)), total: 0, lines: lines,
    addedAt: date + "T12:00:00.000Z"
  }, changes);
}

function line(description, quantity, unit, unitPrice, amount, extra) {
  return Object.assign({ description: description, category: "cogs", amount: amount, quantity: quantity,
    unit: unit, unitPrice: unitPrice }, extra);
}

const FIRST = invoice("2026-09-19", [
  line("Fresh chicken breast", 3, "Case", 1.37, 164.4, { code: "GH-101", original: "鮮雞胸肉" }),
  line("Broccoli", 5, "cases", 30, 150, { code: "GH-300", original: "芥蘭花" }),
  line("Soybean oil", 3, "bucket", 40.95, 122.85, { code: "GH-600" }),
  line("Paper bags #6", 1, "case", 12.5, 12.5, { code: "GH-731", category: "packaging" }),
  line("Fuel surcharge", null, null, null, 4.5),
  line("Returned crate", 1, "crate", -5, -5)
]);

const SECOND = invoice("2026-09-21", [
  line("Fresh breast meat", 3, "case", 1.37, 164.4, { code: "GH-101", original: "鮮雞胸肉" }),
  line("Broccoli (Chui Ho)", 5, "Case", 31, 155, { code: "GH-300", original: "芥蘭花" }),
  line("Frozen old hen", 3, "piece", 0, 0, { code: "GH-010", original: "凍老雞" }),
  line("Paper bags #6", 2, "case", 12.5, 25, { code: "GH-731", category: "packaging" })
]);

/* The key the broccoli is kept under: Golden Harbor's code GH-300. */
function broccoliKey() {
  return itemKey("Golden Harbor Foods", { code: "GH-300" });
}

function find(items, description) {
  return items.find(function (item) {
    return item.description === description;
  });
}

test("the same item on two invoices is one item, matched by the supplier's code", function () {
  const items = itemsBought([FIRST, SECOND]);
  const chicken = find(items, "Fresh breast meat");
  assert.ok(chicken, "named as the latest invoice names it");
  assert.equal(chicken.original, "鮮雞胸肉");
  assert.equal(chicken.code, "GH-101");
  assert.equal(chicken.timesBought, 2);
  assert.deepEqual(chicken.quantities, [{ unit: "case", quantity: 6 }]);
  assert.equal(chicken.spent, 328.8);
  assert.equal(chicken.lastPrice, 1.37);
  assert.equal(chicken.priceChange, null);
  assert.equal(chicken.priceComparison.state, "basis",
    "3 cases at $1.37 isn't $164.40: the price is per something else, so it isn't compared");
  assert.equal(chicken.firstDate, "2026-09-19");
  assert.equal(chicken.lastDate, "2026-09-21");
});

test("a case's price isn't compared until the owner confirms what a case holds", function () {
  const broccoli = find(itemsBought([FIRST, SECOND]), "Broccoli (Chui Ho)");
  assert.deepEqual(broccoli.quantities, [{ unit: "case", quantity: 10 }], "cases and Case are one unit");
  assert.equal(broccoli.priceChange, null);
  assert.equal(broccoli.priceChangePercent, null);
  assert.deepEqual(broccoli.priceComparison, { state: "package" });
  assert.deepEqual(broccoli.comparedUnits, ["case"]);
});

test("once a case's contents are confirmed, a price that moved shows how much and by what share", function () {
  const confirmed = confirmPackage([FIRST, SECOND], broccoliKey(), "case", "2026-09-19",
    { pack: { quantity: 20, unit: "lb" }, billedPer: null });
  assert.equal(confirmed.changed, 1, "the one broccoli line on the 19th");
  const broccoli = find(itemsBought(confirmed.invoices), "Broccoli (Chui Ho)");
  assert.equal(broccoli.priceChange, 1, "per case: both cases hold the same 20 lb");
  assert.equal(broccoli.priceChangePercent, 3.3);
  assert.equal(broccoli.priceComparison.per, "case");

  const cheaper = invoice("2026-09-24", [line("Broccoli", 4, "case", 28.5, 114, { code: "GH-300" })]);
  const later = find(itemsBought(confirmed.invoices.concat([cheaper])), "Broccoli");
  assert.equal(later.priceChange, -2.5, "the later delivery uses the size confirmed before it");
  assert.equal(later.priceChangePercent, -8.1);
});

test("the latest price is the latest by date, whatever order the invoices were added in", function () {
  const addedLate = invoice("2026-09-10", [line("Broccoli", 1, "case", 26, 26, { code: "GH-300" })],
    { addedAt: "2026-10-01T09:00:00.000Z" });
  const confirmed = confirmPackage([FIRST, SECOND, addedLate], broccoliKey(), "case", "2026-09-10",
    { pack: { quantity: 20, unit: "lb" }, billedPer: null });
  const broccoli = find(itemsBought(confirmed.invoices), "Broccoli (Chui Ho)");
  assert.equal(broccoli.lastPrice, 31);
  assert.equal(broccoli.priceChange, 1);
  assert.equal(broccoli.firstDate, "2026-09-10");
});

test("fees, credits and receipts are not items; free items are, without a price", function () {
  const sale = invoice("2026-09-21", [line("Card sales", 1, "day", 900, 900)], { kind: "sale" });
  const items = itemsBought([FIRST, SECOND, sale]);
  assert.equal(find(items, "Fuel surcharge"), undefined);
  assert.equal(find(items, "Returned crate"), undefined);
  assert.equal(find(items, "Card sales"), undefined);

  const hen = find(items, "Frozen old hen");
  assert.equal(hen.isFree, true);
  assert.equal(hen.spent, 0);
  assert.equal(hen.priceChange, null);
  assert.deepEqual(items.map(function (item) {
    return item.description;
  }), ["Fresh breast meat", "Broccoli (Chui Ho)", "Soybean oil", "Paper bags #6", "Frozen old hen"],
  "most money spent first");
});

test("without a code, items match by the name as printed, then by description; suppliers stay apart", function () {
  const noCodes = [
    invoice("2026-09-01", [line("Napa cabbage", 1, "case", 15, 15, { original: "黃芽白" }),
      line("Lemons", 1, "case", 28, 28)]),
    invoice("2026-09-08", [line("Chinese cabbage", 2, "case", 16, 32, { original: "黃芽白" }),
      line("lemons ", 1, "case", 28, 28)]),
    invoice("2026-09-08", [line("Lemons", 1, "case", 25, 25)], { supplier: "Corner Produce" })
  ];
  const items = itemsBought(noCodes);
  assert.equal(items.length, 3);
  const cabbage = find(items, "Chinese cabbage");
  assert.equal(cabbage.timesBought, 2);
  assert.equal(cabbage.priceComparison.state, "package", "per case, until a case's contents are confirmed");
  const lemons = items.filter(function (item) {
    return item.description.trim().toLowerCase() === "lemons";
  });
  assert.deepEqual(lemons.map(function (item) {
    return [item.supplier, item.timesBought];
  }), [["Golden Harbor Foods", 2], ["Corner Produce", 1]]);
});

test("an invoice with no date counts from the first of the month it went into", function () {
  const undated = invoice("2026-08-01", [line("Rice, 50 lb", 2, "bag", 38, 76)], { date: null });
  assert.equal(itemsBought([undated])[0].lastDate, "2026-08-01");
});

test("units are written one way however a reading spelled them", function () {
  const spellings = ["Cases", "LBS", "lb", "Boxes", "Bunches", "pcs", "Dozen", "kg", "glass", " Bag "];
  assert.deepEqual(spellings.map(unitName),
    ["case", "lb", "lb", "box", "bunch", "pc", "dozen", "kg", "glass", "bag"]);
  assert.equal(unitName(null), "");
});

test("the count sheet lists food, staff meals and packaging, each group in alphabetical order", function () {
  const extra = invoice("2026-09-22", [
    line("Staff lunch rolls", 2, "bag", 4, 8, { category: "employee meals" }),
    line("Chef knife", 1, "each", 45, 45, { category: "hardware" }),
    line("Degreaser", 1, "jug", 12, 12, { category: "maintenance" })
  ]);
  const groups = countSheetGroups(itemsBought([FIRST, SECOND, extra]));
  assert.deepEqual(groups.map(function (group) {
    return [group.line, group.items.map(function (item) {
      return item.description;
    })];
  }), [
    ["cogs", ["Broccoli (Chui Ho)", "Fresh breast meat", "Frozen old hen", "Soybean oil"]],
    ["employee meals", ["Staff lunch rolls"]],
    ["packaging", ["Paper bags #6"]]
  ]);
});

test("invoices that list no items are counted, so the page can say why they are missing", function () {
  const rent = invoice("2026-09-01", [line("September rent", null, null, null, 6000, { category: "rent" })]);
  const before = invoice("2026-08-20", [{ description: "Salmon", category: "cogs", amount: 190 }]);
  assert.equal(invoicesWithoutItems([FIRST, rent, before]), 2);
});

test("saved invoices keep their item details, and drop any that aren't the right kind", function () {
  const saved = {
    months: [],
    invoices: [invoice("2026-09-19", [
      line("Broccoli", 5, "case", 30, 150, { code: "GH-300", original: "芥蘭花" }),
      { description: "Lemons", category: "cogs", amount: 28, quantity: "1", unit: 7, unitPrice: Infinity,
        code: { injected: true } },
      { description: "Salmon", category: "cogs", amount: 190 }
    ])]
  };
  const lines = cleanSavedFigures(saved).invoices[0].lines;
  assert.deepEqual(lines[0], { description: "Broccoli", category: "cogs", amount: 150, original: "芥蘭花",
    code: "GH-300", quantity: 5, unit: "case", unitPrice: 30 });
  assert.deepEqual(lines[1], { description: "Lemons", category: "cogs", amount: 28 });
  assert.deepEqual(lines[2], { description: "Salmon", category: "cogs", amount: 190 });
});

test("saved invoices keep a confirmed package size, billing unit and currency, and drop bad ones", function () {
  const saved = {
    months: [],
    invoices: [invoice("2026-09-19", [
      line("Rice", 1, "bag", 40, 40, { pack: { quantity: 50, unit: "LBS" }, billedPer: "kg" }),
      line("Oil", 1, "case", 42, 42, { pack: { quantity: -6, unit: "l" }, billedPer: "case" }),
      line("Salt", 1, "box", 3, 3, { pack: { quantity: 2, unit: "bucket" } })
    ], { currency: "usd" }), invoice("2026-09-20", [line("Tea", 1, "box", 9, 9)], { currency: "dollars" })]
  };
  const invoices = cleanSavedFigures(saved).invoices;
  assert.equal(invoices[0].currency, "USD");
  assert.equal(invoices[1].currency, undefined, "not a currency code");
  const lines = invoices[0].lines;
  assert.deepEqual([lines[0].pack, lines[0].billedPer], [{ quantity: 50, unit: "lb" }, "kg"]);
  assert.deepEqual([lines[1].pack, lines[1].billedPer], [undefined, undefined], "a negative size, a package unit");
  assert.equal(lines[2].pack, undefined, "a bucket isn't a measure");
});
