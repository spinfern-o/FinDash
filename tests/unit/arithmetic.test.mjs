/* The arithmetic every card rests on: months from a sheet, invoices added
   on top, periods added up, saved figures checked on the way back in. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readCsvGrid } from "../../docs/js/dashboard/import/csv-reader.js";
import { fieldNamesOfColumns, rowsAsRecords } from "../../docs/js/dashboard/import/column-names.js";
import { monthsFromCombinedSheet, monthsFromTwoFiles } from "../../docs/js/dashboard/import/months-from-sheet.js";
import { combineMonthsAndInvoices } from "../../docs/js/dashboard/owner-figures.js";
import { totalsForMonths, monthsInPeriod } from "../../docs/js/dashboard/periods.js";
import { cleanSavedFigures } from "../../docs/js/dashboard/saved-figures.js";
import { state } from "../../docs/js/dashboard/state.js";

const TEMPLATE_CSV = [
  "Month,Year,Revenue,Budget,Cost of goods sold,Labor,Employee meals,Payroll tax,Packaging,Credit card fees," +
    "Marketing,Hardware,Utilities,Maintenance,Rent,Insurance,Business license,Telephone",
  "July,2026,72000,66000,26000,12000,2500,5000,3400,2150,2200,0,2800,950,6000,1100,0,320",
  "August,2026,64000,57000,21000,9000,2000,5500,2600,1760,1800,0,3100,4200,6200,1100,0,320",
  "September,2026,33000,34000,11000,3500,500,5200,1350,910,900,2400,1900,310,6000,1100,1250,320"
].join("\n");

function tableFrom(csvText, leftovers) {
  const grid = readCsvGrid(csvText);
  const fieldNames = fieldNamesOfColumns(grid);
  return { fieldNames: fieldNames, rows: rowsAsRecords(grid, fieldNames), leftovers: leftovers || {} };
}

function templateMonths() {
  return monthsFromCombinedSheet(tableFrom(TEMPLATE_CSV));
}

test("the template's three months add up to the known figures", function () {
  const months = templateMonths();
  assert.deepEqual(months.map(function (month) {
    return [month.month, month.year, month.revenue, month.totalExpenses, month.netProfit, month.budgetPercent];
  }), [
    ["july", 2026, 72000, 64420, 7580, 97.61],
    ["august", 2026, 64000, 58580, 5420, 102.77],
    ["september", 2026, 33000, 36640, -3640, 107.76]
  ]);
});

test("every month reconciles: groups add up to total costs, revenue minus costs is profit", function () {
  for (const month of templateMonths()) {
    const groups = month.directExpenses + month.operatingExpenses + month.variableOverhead + month.fixedOverhead;
    assert.equal(groups, month.totalExpenses);
    assert.equal(month.revenue - month.totalExpenses, month.netProfit);
  }
});

test("a Total row is not read as another month, and worked-out columns are not counted twice", function () {
  const csv = "Month,Year,Revenue,Cost of goods sold,Rent,Total costs,Net profit\n" +
    "July,2026,1000,400,200,600,400\n" +
    "Total,,1000,400,200,600,400\n";
  const months = monthsFromCombinedSheet(tableFrom(csv));
  assert.equal(months.length, 1);
  assert.equal(months[0].totalExpenses, 600);
});

test("a cost column that matched no line still counts, in the group it was given", function () {
  const csv = "Month,Year,Revenue,Cost of goods sold,Bank charges\nJuly,2026,1000,400,50\n";
  const months = monthsFromCombinedSheet(tableFrom(csv, { "bank charges": "operating" }));
  assert.equal(months[0].otherOperating, 50);
  assert.equal(months[0].totalExpenses, 450);
});

test("a blank year takes the year from the rows around it, so months stay in order", function () {
  const csv = "Month,Year,Revenue\nNovember,2025,1\nDecember,,2\nJanuary,2026,3\n";
  const months = monthsFromCombinedSheet(tableFrom(csv));
  assert.deepEqual(months.map(function (month) {
    return month.month + " " + month.year;
  }), ["november 2025", "december 2025", "january 2026"]);
});

test("a month name with markup in it is made safe before it is drawn", function () {
  const csv = "Month,Year,Revenue\n<img src=x onerror=alert(1)>,2026,1\n";
  const months = monthsFromCombinedSheet(tableFrom(csv));
  assert.ok(!months[0].month.includes("<img"));
});

test("the older two-file layout joins on month number and names what it skipped", function () {
  const revenue = tableFrom("month,month num,revenue,budget\njuly,7,72000,66000\nmay,5,1,1\n");
  const costs = tableFrom("month num,cogs,rent\n7,26000,6000\n");
  const result = monthsFromTwoFiles(revenue, costs);
  assert.equal(result.months.length, 1);
  assert.equal(result.months[0].totalExpenses, 32000);
  assert.deepEqual(result.skipped, ["may"]);
});

test("invoices are added on top of their month, and a sale adds to revenue", function () {
  const months = templateMonths();
  const invoices = [
    { kind: "purchase", year: 2026, monthNum: 9, total: 459.95,
      lines: [{ category: "cogs", amount: 416.5 }, { category: "packaging", amount: 43.45 }] },
    { kind: "sale", year: 2026, monthNum: 10, total: 4200, lines: [] }
  ];
  const combined = combineMonthsAndInvoices(months, invoices);
  const september = combined.find(function (month) {
    return month.monthNum === 9;
  });
  const october = combined.find(function (month) {
    return month.monthNum === 10;
  });
  assert.equal(september.lines.cogs, 11416.5);
  assert.equal(september.totalExpenses, 37099.95);
  assert.equal(september.netProfit, -4099.95);
  assert.equal(september.invoiceCount, 1);
  assert.equal(october.revenue, 4200);
  assert.equal(october.totalExpenses, 0);
  // The months passed in are not changed.
  assert.equal(months[2].lines.cogs, 11000);
});

test("a quarter adds up its months, and its margin comes from the sums", function () {
  state.data = { generated: null, months: templateMonths() };
  const quarter = monthsInPeriod(state.data.months[2], "quarter");
  const totals = totalsForMonths(quarter);
  assert.equal(quarter.length, 3);
  assert.equal(totals.revenue, 169000);
  assert.equal(totals.netProfit, 9360);
  assert.equal(totals.margin, (9360 / 169000) * 100);
  assert.equal(totals.budgetPercent, (159640 / 157000) * 100);
});

test("saved figures are checked field by field on the way back in", function () {
  const saved = {
    v: 2,
    from: "figures.csv",
    months: [{ month: "july", year: 2026, monthNum: 7, revenue: 100, extra: "dropped", lines: { cogs: 40 } }],
    invoices: [
      { id: "a", kind: "purchase", year: 2026, monthNum: 7, total: 10, lines: [{ category: "cogs", amount: 10 }] },
      { id: "b", kind: "purchase", year: 2026, monthNum: 13, total: 10, lines: [] },   // no such month
      { id: "c", kind: "purchase", year: 2026, monthNum: 7, lines: [{ category: "made up", amount: 5 }] }
    ]
  };
  const clean = cleanSavedFigures(saved);
  assert.equal(clean.months.length, 1);
  assert.equal("extra" in clean.months[0], false);
  assert.equal(clean.months[0].lines.rent, 0);
  assert.deepEqual(clean.invoices.map(function (invoice) {
    return invoice.id;
  }), ["a", "c"]);
  assert.deepEqual(clean.invoices[1].lines, []);
  assert.equal(cleanSavedFigures({ months: [{ month: 5 }], invoices: [] }), null);   // a damaged month
  assert.equal(cleanSavedFigures(null), null);
});
