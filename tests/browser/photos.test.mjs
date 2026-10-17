/* Photos of invoices in a real browser: logged out it asks for a login;
   logged in a reading that doesn't add up gets a second look, the owner
   checks the lines before anything is added, and the invoice can be
   removed again. The stand-in for Claude reads every photo as the made-up
   invoice in tests/fixtures/. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startSite } from "../support/site.mjs";
import { launchBrowser, openPage, signUp, newEmail, photoFile, waitUntilNotBusy, text } from "../support/browser.mjs";

const PASSWORD = "correct horse battery";
const DOWNLOADS = mkdtempSync(path.join(tmpdir(), "findash-test-"));

let site;
let browser;
let page;
let template;

before(async function () {
  site = await startSite();
  browser = await launchBrowser();
  page = await openPage(browser);
  await page.goto(site.url + "/dashboard", { waitUntil: "networkidle" });
  const [file] = await Promise.all([page.waitForEvent("download"), page.click("#tpl-xlsx")]);
  template = path.join(DOWNLOADS, "findash-template.xlsx");
  await file.saveAs(template);
});

after(async function () {
  await browser.close();
  await site.stop();
});

function photoRequests() {
  return site.anthropic.requestsOfKind("photo").length;
}

function september(currentPage) {
  return currentPage.evaluate(function () {
    const month = findash.state.data.months.find(function (candidate) {
      return candidate.monthNum === 9 && candidate.year === 2026;
    });
    return month;
  });
}

async function addPhoto(currentPage) {
  await currentPage.setInputFiles("#file", photoFile());
  await currentPage.waitForSelector("#review:not([hidden]) h3", { timeout: 15000 });
}

test("logged out: photos ask for a login and nothing is sent", async function () {
  assert.ok(await page.locator(".dropzone-sub .photo-only").isVisible());
  await page.setInputFiles("#file", photoFile());
  await page.waitForFunction(function () {
    return document.getElementById("source").textContent === "Log in to read photos";
  });
  assert.match(await text(page, "#status"), /needs a free account/);
  assert.equal(photoRequests(), 0);
});

test("a reading that doesn't add up gets exactly one second look", async function () {
  assert.equal(await signUp(page, site, newEmail("photos"), PASSWORD), 200);
  await page.reload({ waitUntil: "networkidle" });
  await addPhoto(page);
  assert.equal(photoRequests(), 2);
  assert.equal(await text(page, "#review h3"), "Harbour Fresh Seafood");
  const details = await text(page, "#review .review-meta");
  assert.ok(details.includes("Invoice INV-1042") && details.includes("September 26, 2026"), details);
  assert.match(await text(page, "#review .review-check"), /6 lines add up to the printed total of \$459\.95/);
});

test("the owner sees each line's cost line and can change it before adding", async function () {
  const summary = await text(page, "#review-sum");
  assert.ok(summary.includes("Cost of goods sold $416.50") && summary.includes("Packaging $43.45"), summary);
  assert.match(summary, /September 2026/);
  assert.equal(await page.locator("#review .review-flag.soft").count(), 1);   // the worked-out amount

  await page.selectOption('#review select[data-line="4"]', "packaging");
  assert.match(await text(page, "#review-sum"), /Packaging \$71\.45/);
  await page.selectOption('#review select[data-line="4"]', "cogs");
  assert.equal(await text(page, "#review-add"), "Add $459.95 to September 2026");
});

test("added on the demo, the invoice starts the owner's own figures", async function () {
  await page.click("#review-add");
  await page.waitForFunction(function () {
    return document.getElementById("source").textContent === "Your figures";
  });
  assert.match(await text(page, "#status"), /^Added Harbour Fresh Seafood, \$459\.95, to September 2026\./);
  assert.equal(await text(page, "#showing"), "September 2026");
  assert.match(await text(page, ".hero .note"), /Not known yet/);
  const attention = await text(page, ".prio");
  assert.ok(attention.includes("No sales on file for September 2026") && !attention.includes("at a loss"), attention);
  assert.match(await text(page, "#inv-list summary"), /1 invoice/);
});

test("a spreadsheet on top keeps the invoice, added to the file's September", async function () {
  await page.setInputFiles("#file", template);
  await waitUntilNotBusy(page);
  assert.match(await text(page, "#status"), /invoice from photos is still added on top/);
  const month = await september(page);
  assert.deepEqual([month.lines.cogs, month.lines.packaging, month.totalExpenses, month.netProfit, month.invoiceCount],
    [11416.5, 1393.45, 37099.95, -4099.95, 1]);
  const reconciles = await page.evaluate(function () {
    return findash.state.data.months.every(function (candidate) {
      const groups = candidate.directExpenses + candidate.operatingExpenses + candidate.variableOverhead +
        candidate.fixedOverhead;
      return Math.abs(groups - candidate.totalExpenses) < 0.01 &&
        Math.abs(candidate.revenue - candidate.totalExpenses - candidate.netProfit) < 0.01;
    });
  });
  assert.ok(reconciles);
});

test("the invoice is remembered, and the same photo again is flagged as a duplicate", async function () {
  await page.reload({ waitUntil: "networkidle" });
  assert.match(await text(page, "#status"), /findash-template\.xlsx \+ 1 invoice from photos/);
  assert.equal((await september(page)).lines.cogs, 11416.5);

  await addPhoto(page);
  assert.match(await text(page, "#review-dup"), /Already added/);
  assert.match(await text(page, "#review-add"), /^Add again/);
  await page.click("#review-cancel");
  assert.ok(await page.locator("#review").isHidden());
});

test("removing the invoice takes its money out again", async function () {
  await page.click("#inv-list summary");
  await page.click("#inv-list [data-remove]");
  assert.equal((await september(page)).lines.cogs, 11000);
  assert.ok(await page.locator("#inv-list").isHidden());
});

test("on a phone the review fits without sideways scrolling", async function () {
  const phone = await openPage(browser, { viewport: { width: 375, height: 800 } });
  assert.equal(await signUp(phone, site, newEmail("phone"), PASSWORD), 200);
  await phone.goto(site.url + "/dashboard", { waitUntil: "networkidle" });
  await addPhoto(phone);
  const widths = await phone.evaluate(function () {
    return [document.documentElement.scrollWidth, innerWidth];
  });
  assert.equal(widths[0], widths[1]);
  await phone.context().close();
});

/* Edge cases, each with the reading given straight to the page. */
function reading(changes) {
  return Object.assign({
    kind: "purchase", legible: true, supplier: "Acme <b>Supplies</b>", customer: null, document_number: null,
    date: null, currency: null, subtotal_printed: null, total_printed: 20, notes: [],
    lines: [{ description: "Gloves <img src=x onerror=alert(1)>", original: null, quantity: 2, unit: "box",
      billed_quantity: 2, unit_price: 10, amount: 20, amount_source: "printed", category: "maintenance" }]
  }, changes);
}

function checksFor(doc) {
  let lineSum = 0;
  for (const line of doc.lines) {
    lineSum += line.amount;
  }
  let difference = null;
  if (doc.total_printed !== null) {
    difference = Math.round((lineSum - doc.total_printed) * 100) / 100;
  }
  const ok = difference === null || Math.abs(difference) < 0.02;
  return { ok: ok, lineSum: lineSum, total: doc.total_printed, difference: difference,
    totalReadable: doc.total_printed !== null, lineIssues: [], problems: ok ? [] : ["mismatch"], computedLines: 0 };
}

async function withReading(doc, capabilities) {
  const edgePage = await openPage(browser);
  assert.equal(await signUp(edgePage, site, newEmail("edge"), PASSWORD), 200);
  edgePage.readRequests = 0;
  if (capabilities) {
    await edgePage.route("**/api/capabilities", function (route) {
      route.fulfill({ json: capabilities });
    });
  }
  await edgePage.route("**/api/read-document", function (route) {
    edgePage.readRequests += 1;
    route.fulfill({ json: { document: doc, checks: checksFor(doc), model: "test" } });
  });
  await edgePage.goto(site.url + "/dashboard", { waitUntil: "networkidle" });
  await edgePage.setInputFiles("#file", photoFile());
  await edgePage.waitForTimeout(1200);
  return edgePage;
}

test("photos switched off: says so and sends nothing", async function () {
  const edgePage = await withReading(reading({}), { photos: false, accounts: true });
  assert.equal(await text(edgePage, "#source"), "Photos can't be read here");
  assert.equal(edgePage.readRequests, 0);
  assert.ok(await edgePage.locator(".dropzone-sub .photo-only").isHidden());
  await edgePage.context().close();
});

test("no date, and text from the photo is shown as text, never run as markup", async function () {
  const edgePage = await withReading(reading({}));
  assert.match(await text(edgePage, "#review .review-meta"), /No date found/);
  assert.match(await edgePage.locator("#review .review-top h3").innerHTML(), /&lt;b&gt;/);
  assert.equal(await edgePage.locator("#review img").count(), 1);   // only the thumbnail
  assert.equal(await edgePage.locator('#review select[data-line="0"]').inputValue(), "maintenance");
  const now = new Date();
  const thisMonth = now.toLocaleString("en-US", { month: "long", timeZone: "UTC" }) + " " + now.getUTCFullYear();
  assert.ok((await text(edgePage, "#review-add")).includes(thisMonth));
  assert.deepEqual(edgePage.errors, []);
  await edgePage.context().close();
});

test("a receipt for money taken in adds to revenue", async function () {
  const doc = reading({ kind: "sale", supplier: "Till report", date: "2026-09-30", total_printed: 4200,
    lines: [{ description: "Card sales", original: null, quantity: null, unit: null, billed_quantity: null,
      unit_price: null, amount: 4200, amount_source: "printed", category: "cogs" }] });
  const edgePage = await withReading(doc);
  assert.match(await text(edgePage, "#review-sum"), /to revenue for September 2026/);
  await edgePage.click("#review-add");
  const month = await september(edgePage);
  assert.equal(month.revenue, 4200);
  assert.equal(month.totalExpenses, 0);
  await edgePage.context().close();
});

test("an unreadable photo is explained, without a second look, and nothing is added", async function () {
  const edgePage = await withReading(reading({ legible: false, kind: "other", lines: [], total_printed: null,
    notes: ["Too blurred to read."] }));
  assert.match(await text(edgePage, "#review h3"), /couldn't be read/);
  assert.equal(edgePage.readRequests, 1);
  await edgePage.click("#review-cancel");
  assert.equal(await text(edgePage, "#source"), "Demo data");
  await edgePage.context().close();
});

test("lines that miss the printed total are warned about before adding", async function () {
  const edgePage = await withReading(reading({ total_printed: 25 }));
  assert.equal(edgePage.readRequests, 2);
  assert.match(await text(edgePage, "#review .review-check"), /but the printed total is/);
  await edgePage.context().close();
});

test("no unexpected errors in the browser console", function () {
  assert.deepEqual(page.errors, []);
});
