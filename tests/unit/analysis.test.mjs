/* The figures the API, the MCP server and the dashboard's agent tools work
   from: the same months, by the same arithmetic, as a spreadsheet dropped on
   the dashboard; and every value an agent gets wrong named exactly. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readMonthRecords, summariseMonths, templateColumns, glossaryEntries, COST_FIELDS, MAXIMUM_MONTHS }
  from "../../docs/js/dashboard/analysis.js";
import { readCsvGrid } from "../../docs/js/dashboard/import/csv-reader.js";
import { fieldNamesOfColumns, rowsAsRecords } from "../../docs/js/dashboard/import/column-names.js";
import { monthsFromCombinedSheet } from "../../docs/js/dashboard/import/months-from-sheet.js";
import { LINE_LABELS } from "../../docs/js/dashboard/cost-groups.js";

const TEMPLATE_CSV = [
  "Month,Year,Revenue,Budget,Cost of goods sold,Labor,Employee meals,Payroll tax,Packaging,Credit card fees," +
    "Marketing,Hardware,Utilities,Maintenance,Rent,Insurance,Business license,Telephone",
  "July,2026,72000,66000,26000,12000,2500,5000,3400,2150,2200,0,2800,950,6000,1100,0,320",
  "August,2026,64000,57000,21000,9000,2000,5500,2600,1760,1800,0,3100,4200,6200,1100,0,320",
  "September,2026,33000,34000,11000,3500,500,5200,1350,910,900,2400,1900,310,6000,1100,1250,320"
].join("\n");

/* The same three months as the API takes them. */
function templateRecords() {
  const grid = readCsvGrid(TEMPLATE_CSV);
  return grid.slice(1).map(function (cells) {
    const costs = {};
    COST_FIELDS.forEach(function (field, index) {
      costs[field.key] = Number(cells[4 + index]);
    });
    return { month: cells[0], year: Number(cells[1]), revenue: Number(cells[2]), budget: Number(cells[3]), costs: costs };
  });
}

test("the API's months are the dashboard's months, to the cent", function () {
  const grid = readCsvGrid(TEMPLATE_CSV);
  const fieldNames = fieldNamesOfColumns(grid);
  const fromSpreadsheet = monthsFromCombinedSheet({ fieldNames: fieldNames, rows: rowsAsRecords(grid, fieldNames), leftovers: {} });
  const fromApi = readMonthRecords(templateRecords());
  assert.deepEqual(fromApi.problems, []);
  assert.deepEqual(fromApi.months, fromSpreadsheet);
});

test("the summary gives each month, the total and what needs attention", function () {
  const summary = summariseMonths(readMonthRecords(templateRecords()).months, "USD");
  assert.equal(summary.currency, "USD");
  assert.deepEqual(summary.months.map(function (month) {
    return [month.label, month.totalCosts, month.grossProfit, month.netProfit, month.netMarginPercent,
      month.budgetUsedPercent, month.overBudgetBy];
  }), [
    ["July 2026", 64420, 26500, 7580, 10.53, 97.61, 0],
    ["August 2026", 58580, 26500, 5420, 8.47, 102.77, 1580],
    ["September 2026", 36640, 12800, -3640, -11.03, 107.76, 2640]
  ]);
  assert.deepEqual(summary.months[0].costGroups,
    { directCosts: 45500, operatingCosts: 7750, variableOverhead: 3750, fixedOverhead: 7420 });
  assert.equal(summary.months[2].costs.businessLicense, 1250);
  assert.deepEqual(summary.total, {
    label: "Jul–Sep 2026", months: 3, revenue: 169000,
    costGroups: { directCosts: 103200, operatingCosts: 19470, variableOverhead: 13260, fixedOverhead: 23710 },
    totalCosts: 159640, grossProfit: 65800, netProfit: 9360, netMarginPercent: 5.54, budget: 157000,
    budgetUsedPercent: 101.68
  });
  assert.deepEqual(summary.needsAttention.map(function (item) {
    return item.kind + " " + item.month;
  }), ["over-budget August 2026", "loss September 2026", "over-budget September 2026"]);
});

test("months may be named or numbered, in any order, and come back in date order", function () {
  const read = readMonthRecords([
    { month: "jan", year: 2027, revenue: 100 },
    { month: 12, year: 2026, revenue: 200 },
    { month: "11", year: 2026, revenue: 300 },
    { month: "MARCH", year: 2027, revenue: 400 }
  ]);
  assert.deepEqual(read.problems, []);
  assert.deepEqual(summariseMonths(read.months).months.map(function (month) {
    return month.label;
  }), ["November 2026", "December 2026", "January 2027", "March 2027"]);
});

test("amounts are kept to the cent, never read the European way", function () {
  const read = readMonthRecords([{ month: 7, year: 2026, revenue: 1.234, costs: { rent: 1234.567 } }]);
  const month = summariseMonths(read.months).months[0];
  assert.equal(month.revenue, 1.23);
  assert.equal(month.costs.rent, 1234.57);
  assert.equal(month.budget, null);
  assert.equal(month.budgetUsedPercent, null);
  assert.equal(month.overBudgetBy, null);
});

test("every value an agent gets wrong is named, with what to send instead", function () {
  const read = readMonthRecords([
    { month: "Juli", year: "2026", revenue: "lots", budget: -5, costs: { wages: 5, rent: "6000" }, notes: "x" },
    { month: 7, year: 2026, revenue: 1 },
    { month: "July", year: 2026, revenue: 2 }
  ]);
  assert.equal(read.months, null);
  assert.deepEqual(read.problems.map(function (problem) {
    return problem.field;
  }), ["months[0].notes", "months[0].month", "months[0].year", "months[0].revenue", "months[0].budget",
    "months[0].costs.wages", "months[0].costs.rent", "months[2]"]);
  assert.match(read.problems[5].message, /Use one of: costOfGoodsSold, labor/);
  assert.match(read.problems[7].message, /appears twice/);

  for (const months of [undefined, [], "July", new Array(MAXIMUM_MONTHS + 1).fill({ month: 1, year: 2026, revenue: 1 })]) {
    assert.equal(readMonthRecords(months).problems[0].field, "months");
  }
});

test("the template's columns and the glossary come from the dashboard's own lists", function () {
  const columns = templateColumns();
  assert.deepEqual(columns.map(function (column) {
    return column.header;
  }), ["Month", "Year", "Revenue", "Budget"].concat(COST_FIELDS.map(function (field) {
    return LINE_LABELS[field.line];
  })));
  assert.ok(glossaryEntries().some(function (entry) {
    return entry.key === "netMargin" && entry.term === "Net margin";
  }));
});
