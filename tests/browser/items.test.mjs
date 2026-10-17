/* What the owner buys, and the count sheet, in a real browser: two made-up
   invoices in two languages, with the supplier's item codes, are read from
   photos and added; then the list, a price that moved, the count sheet
   printed on its own, and its Excel copy. The readings are given straight to
   the page, as if Claude had read them. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startSite } from "../support/site.mjs";
import { launchBrowser, openPage, signUp, newEmail, photoFile, text } from "../support/browser.mjs";

let site;
let browser;
let page;

function item(description, original, code, quantity, unit, unitPrice, amount, category) {
  return { description: description, original: original, code: code, quantity: quantity, unit: unit,
    billed_quantity: quantity, unit_price: unitPrice, amount: amount, amount_source: "printed",
    category: category || "cogs" };
}

function reading(number, date, lines) {
  let total = 0;
  for (const line of lines) {
    total += line.amount;
  }
  return { kind: "purchase", legible: true, supplier: "Golden Harbor Foods", customer: "Corner Bistro",
    document_number: number, date: date, currency: "USD", subtotal_printed: null,
    total_printed: Math.round(total * 100) / 100, notes: ["Made-up invoice for FinDash's tests."], lines: lines };
}

const FIRST = reading("GH-5501", "2026-09-19", [
  Object.assign(item("Fresh chicken breast", "鮮雞胸肉", "GH-101", 3, "case", 1.37, 164.4), { billed_quantity: 120 }),
  Object.assign(item("Fresh chicken leg", "鮮雞腿肉", "GH-102", 2, "case", 1.47, 117.6), { billed_quantity: 80 }),
  item("Broccoli", "芥蘭花", "GH-300", 5, "case", 30, 150),
  item("Fresh mushroom", "鮮蘑菇", "GH-308", 1, "case", 18.5, 18.5),
  item("Large eggs, 30 dozen", "大雞蛋", "GH-330", 1, "case", 21, 21),
  item("Soybean oil", "黃豆油", "GH-600", 3, "bucket", 40.95, 122.85),
  item("Rice, 100 lb", "大米", "GH-610", 2, "bag", 41.95, 83.9),
  item("Sugar, 50 lb", "糖", "GH-620", 1, "bag", 34.5, 34.5),
  item("Spring rolls", "春卷", "GH-261", 1, "case", 29.95, 29.95),
  item("Plastic bags 1/8", "膠袋", "GH-713", 2, "case", 8.5, 17, "packaging"),
  item("Brown paper bags #6", "紙袋", "GH-731", 1, "case", 12.5, 12.5, "packaging")
]);

const SECOND = reading("GH-5537", "2026-09-21", [
  item("Frozen old hen", "凍老雞", "GH-010", 3, "piece", 0, 0),
  Object.assign(item("Fresh chicken breast", "鮮雞胸肉", "GH-101", 3, "case", 1.37, 164.4), { billed_quantity: 120 }),
  item("Broccoli", "芥蘭花", "GH-300", 5, "case", 31, 155),
  item("Rice, 100 lb", "大米", "GH-610", 2, "bag", 41.95, 83.9),
  { description: "Delivery fee", original: null, code: null, quantity: null, unit: null, billed_quantity: null,
    unit_price: null, amount: 5, amount_source: "printed", category: "cogs" }
]);

function checksFor(doc) {
  let lineSum = 0;
  for (const line of doc.lines) {
    lineSum += line.amount;
  }
  lineSum = Math.round(lineSum * 100) / 100;
  return { ok: true, lineSum: lineSum, total: doc.total_printed, difference: 0, totalReadable: true,
    lineIssues: [], problems: [], computedLines: 0 };
}

/* Adds one photo, read as `doc`, and presses Add. */
async function addInvoice(doc) {
  page.nextReading = doc;
  await page.setInputFiles("#file", photoFile());
  await page.waitForSelector("#review:not([hidden]) #review-add", { timeout: 15000 });
  await page.click("#review-add");
  await page.waitForFunction(function () {
    return /^Added Golden Harbor Foods/.test(document.getElementById("status").textContent);
  });
}

/* The list as the reader sees it: each visible row's cells, as text. */
function visibleRows() {
  return page.$$eval(".item-table tbody tr:not([hidden])", function (rows) {
    return rows.map(function (row) {
      return Array.from(row.children, function (cell) {
        return cell.innerText.replace(/\s+/g, " ").trim();
      });
    });
  });
}

before(async function () {
  site = await startSite();
  browser = await launchBrowser();
  page = await openPage(browser);
  await page.route("**/api/read-document", function (route) {
    route.fulfill({ json: { document: page.nextReading, checks: checksFor(page.nextReading), model: "test" } });
  });
});

after(async function () {
  await browser.close();
  await site.stop();
});

test("the demo has no list of items", async function () {
  await page.goto(site.url + "/dashboard", { waitUntil: "networkidle" });
  assert.equal(await page.locator(".item-log").count(), 0);
});

test("an invoice's item codes are shown for checking, and its items are listed once added", async function () {
  assert.equal(await signUp(page, site, newEmail("items"), "correct horse battery"), 200);
  await page.reload({ waitUntil: "networkidle" });
  page.nextReading = FIRST;
  await page.setInputFiles("#file", photoFile());
  await page.waitForSelector("#review:not([hidden]) #review-add", { timeout: 15000 });
  assert.match(await text(page, "#review .review-orig"), /鮮雞胸肉 · GH-101 · 3 case · 120 × 1\.37/);
  await page.click("#review-add");
  await page.waitForSelector(".item-log");

  assert.equal(await text(page, ".item-log .scope"), "From 1 invoice");
  assert.equal(await page.locator(".item-table tbody tr").count(), 11);
  assert.equal((await visibleRows()).length, 10, "the ten biggest first");
  assert.equal(await text(page, ".item-more"), "Show all 11 items");
  assert.deepEqual((await visibleRows())[0],
    ["Fresh chicken breast 鮮雞胸肉 · GH-101", "3 case 1 delivery, last Sep 19", "$164.40", "$1.37", "—"]);
});

test("a second invoice adds to the same items and shows which prices moved", async function () {
  await addInvoice(SECOND);
  assert.equal(await text(page, ".item-log .scope"), "From 2 invoices");
  const rows = await visibleRows();
  assert.deepEqual(rows[0],
    ["Fresh chicken breast 鮮雞胸肉 · GH-101", "6 case 2 deliveries, last Sep 21", "$328.80", "$1.37", "—"]);
  assert.deepEqual(rows[1],
    ["Broccoli 芥蘭花 · GH-300", "10 case 2 deliveries, last Sep 21", "$305.00", "$31.00", "▲ $1.00 (3.3%)"]);
  assert.equal(await page.locator(".item-table .item-up").count(), 1);
  assert.equal(await page.locator(".item-table tbody tr").count(), 12, "the delivery fee is not an item");

  await page.click(".item-more");
  const everyRow = await visibleRows();
  assert.equal(everyRow.length, 12);
  assert.deepEqual(everyRow[11], ["Frozen old hen 凍老雞 · GH-010", "3 piece 1 delivery, last Sep 21", "$0.00",
    "Free", "—"]);
  assert.equal(await text(page, ".item-more"), "Show fewer");

  // Picking another month redraws the cards; the list stays open.
  await page.click("#months button >> nth=0");
  assert.equal((await visibleRows()).length, 12);
});

test("the items are kept with the invoices, so they are there after a reload", async function () {
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".item-log");
  assert.equal(await page.locator(".item-table tbody tr").count(), 12);
  assert.match((await visibleRows())[1].join(" "), /▲ \$1\.00 \(3\.3%\)/);
});

test("the count sheet prints on its own: what to count, in the supplier's words, with a box for each", async function () {
  await page.evaluate(function () {
    window.print = function () {
      window.printed = {
        bodyClass: document.body.className,
        title: document.title
      };
    };
  });
  const pageTitle = await page.title();
  await page.click('[data-items="print"]');
  const printed = await page.evaluate(function () {
    return window.printed;
  });
  assert.match(printed.bodyClass, /printing-count-sheet/);
  assert.equal(printed.title, "Count sheet · FinDash");

  const groups = await page.$$eval("#count-sheet .count-group", function (sections) {
    return sections.map(function (section) {
      return [section.querySelector("h3").textContent, Array.from(section.querySelectorAll("tbody th"),
        function (cell) {
          return cell.firstChild.textContent;
        })];
    });
  });
  assert.deepEqual(groups, [
    ["Food and ingredients", ["Broccoli", "Fresh chicken breast", "Fresh chicken leg", "Fresh mushroom",
      "Frozen old hen", "Large eggs, 30 dozen", "Rice, 100 lb", "Soybean oil", "Spring rolls", "Sugar, 50 lb"]],
    ["Packaging", ["Brown paper bags #6", "Plastic bags 1/8"]]
  ]);
  const chickenRow = await page.$$eval("#count-sheet tbody tr", function (rows) {
    return Array.from(rows[1].children, function (cell) {
      return cell.textContent.replace(/\s+/g, " ").trim();
    });
  });
  assert.deepEqual(chickenRow, ["Fresh chicken breast鮮雞胸肉", "GH-101", "3 case on Sep 21", "case", ""]);
  assert.match(await page.locator("#count-sheet .count-foot").textContent(),
    /from 2 supplier invoices, the latest dated September 21, 2026/);

  // On paper, only the sheet.
  await page.emulateMedia({ media: "print" });
  assert.ok(await page.locator("#count-sheet").isVisible());
  assert.ok(await page.locator("#count-sheet .count-box >> nth=0").isVisible());
  assert.ok(await page.locator("#sheet").isHidden());
  assert.ok(await page.locator(".site-nav").isHidden());
  assert.ok(await page.locator(".site-footer").isHidden());

  // Once printing is over the page is as it was, and the report prints
  // without the list or the sheet.
  await page.evaluate(function () {
    window.dispatchEvent(new Event("afterprint"));
  });
  assert.equal(await page.title(), pageTitle);
  assert.doesNotMatch(await page.evaluate(function () {
    return document.body.className;
  }), /printing-count-sheet/);
  assert.ok(await page.locator("#count-sheet").isHidden());
  assert.ok(await page.locator(".item-log").isHidden());
  assert.ok(await page.locator(".hero").isVisible());
  await page.emulateMedia({ media: "screen" });
  assert.ok(await page.locator(".item-log").isVisible());
  assert.ok(await page.locator("#count-sheet").isHidden());
});

test("the count sheet downloads as an Excel file with the same items and an empty On hand column", async function () {
  const [download] = await Promise.all([page.waitForEvent("download"), page.click('[data-items="excel"]')]);
  assert.match(download.suggestedFilename(), /^findash-count-sheet-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const contents = readFileSync(await download.path());
  assert.equal(contents.subarray(0, 2).toString(), "PK");
  const sheetText = contents.toString("utf8");
  for (const expected of ["On hand", "Food and ingredients", "Fresh chicken breast", "鮮雞胸肉", "GH-101",
    "3 case on Sep 21", "Golden Harbor Foods", "Packaging"]) {
    assert.ok(sheetText.includes(expected), expected);
  }
  assert.ok(!sheetText.includes("Delivery fee"));
});

test("on a phone the list fits without sideways scrolling", async function () {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.locator(".item-log").scrollIntoViewIfNeeded();
  const widths = await page.evaluate(function () {
    return [document.documentElement.scrollWidth, innerWidth];
  });
  assert.equal(widths[0], widths[1]);
});

test("no unexpected errors in the browser console", function () {
  assert.deepEqual(page.errors, []);
});
