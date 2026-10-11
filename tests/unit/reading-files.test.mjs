/* Reading spreadsheet cells: amounts, CSV, column names, month names. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmount, roundToCents } from "../../docs/js/dashboard/numbers.js";
import { readCsvGrid } from "../../docs/js/dashboard/import/csv-reader.js";
import { fieldNameFor, kindOfFile, isCombinedFile } from "../../docs/js/dashboard/import/column-names.js";
import { monthFromText, monthFromExcelDate, yearInText } from "../../docs/js/dashboard/import/period-cells.js";
import { withHeadersOnTop } from "../../docs/js/dashboard/import/sheet-orientation.js";
import { needsColumnMatching, unrecognisedColumns } from "../../docs/js/dashboard/import/column-mapping.js";

test("amounts are read however a spreadsheet wrote them", function () {
  assert.equal(parseAmount("$1,250.00"), 1250);
  assert.equal(parseAmount("(1,250.00)"), -1250);       // accounting brackets mean negative
  assert.equal(parseAmount("1.250,00"), 1250);          // European, with dots
  assert.equal(parseAmount("1 250,00"), 1250);          // European, with spaces
  assert.equal(parseAmount("€4.000,00"), 4000);
  assert.equal(parseAmount("1,25"), 125);               // ambiguous: read as thousands, not guessed
  assert.equal(parseAmount("-5"), -5);
  assert.equal(parseAmount(""), 0);
  assert.equal(parseAmount("n/a"), 0);
  assert.equal(parseAmount(null), 0);
  assert.equal(roundToCents(0.1 + 0.2), 0.3);
});

test("CSV: quotes, commas inside quotes, doubled quotes, line endings, byte-order mark", function () {
  const text = "﻿Month,Note,Revenue\r\nJuly,\"Busy, very\",\"72,000\"\n\nAugust,\"Said \"\"hi\"\"\",64000";
  assert.deepEqual(readCsvGrid(text), [
    ["Month", "Note", "Revenue"],
    ["July", "Busy, very", "72,000"],
    ["August", "Said \"hi\"", "64000"]
  ]);
});

test("column names fold onto FinDash's field names", function () {
  assert.equal(fieldNameFor("Cost of goods sold"), "cogs");
  assert.equal(fieldNameFor("Wages"), "labor");
  assert.equal(fieldNameFor("Payroll tax"), "tax");                       // not labor
  assert.equal(fieldNameFor("Utilities (gas, electricity, water)"), "utilities");
  assert.equal(fieldNameFor("Credit_Card-Fees "), "credit card fees");
  assert.equal(fieldNameFor("monthly revenue"), "monthly revenue");       // never collapses to "month"
  assert.equal(fieldNameFor("Total costs"), "=total costs");              // worked-out rows are set aside
  assert.equal(fieldNameFor("Budget used"), "=budget used");
});

test("which kind of file it is, from its columns", function () {
  assert.equal(kindOfFile(["month", "month num", "revenue", "budget"]), "dashboard");
  assert.equal(kindOfFile(["month num", "cogs", "rent"]), "expenses");
  assert.equal(isCombinedFile(["month", "revenue", "cogs"]), true);
  assert.equal(kindOfFile(["something", "else"]), null);
});

test("month names and dates in a period cell", function () {
  assert.equal(monthFromText("July"), 7);
  assert.equal(monthFromText("Sept 2026"), 9);
  assert.equal(monthFromText("2026-07"), 7);
  assert.equal(monthFromText("07/2026"), 7);
  assert.equal(monthFromText("Total"), null);
  assert.equal(yearInText("Sept 2026"), 2026);
  assert.equal(yearInText("July"), null);
  assert.deepEqual(monthFromExcelDate(46204), { month: "july", monthNum: 7, year: 2026 });
  assert.equal(monthFromExcelDate("July"), null);
});

test("a sheet with months across the top is turned the right way up", function () {
  const sideways = [
    ["", "July", "August"],
    ["Revenue", "72000", "64000"],
    ["Cost of goods sold", "26000", "21000"],
    ["Rent", "6000", "6200"]
  ];
  assert.deepEqual(withHeadersOnTop(sideways), [
    ["", "Revenue", "Cost of goods sold", "Rent"],
    ["July", "72000", "26000", "6000"],
    ["August", "64000", "21000", "6200"]
  ]);
});

test("the template's columns never need the column-matching service", function () {
  const template = ["month", "year", "revenue", "budget", "cogs", "labor", "employee meals", "tax",
    "packaging", "credit card fees", "marketing", "hardware", "utilities", "maintenance",
    "rent", "insurance", "business license", "telephone"];
  assert.equal(needsColumnMatching(template), false);
  assert.deepEqual(unrecognisedColumns(template), []);
  assert.deepEqual(unrecognisedColumns(["month", "revenue", "cogs", "bank charges"]), ["bank charges"]);
});
