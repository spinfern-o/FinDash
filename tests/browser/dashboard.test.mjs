/* The dashboard in a real browser: the demo, periods, help, currency, the
   template and Excel export round trip, remembered figures, advice,
   Forget my data, a long file, and matching unusual column names. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startSite } from "../support/site.mjs";
import { launchBrowser, openPage, signUp, newEmail, waitUntilNotBusy, text } from "../support/browser.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));
const DOWNLOADS = mkdtempSync(path.join(tmpdir(), "findash-test-"));
const DEMO_MONTHS = JSON.stringify([
  ["july", 7, 2026, 72000, 64420, 7580, 66000],
  ["august", 8, 2026, 64000, 58580, 5420, 57000],
  ["september", 9, 2026, 33000, 36640, -3640, 34000]
]);

let site;
let browser;
let page;
const downloaded = {};

before(async function () {
  site = await startSite();
  browser = await launchBrowser();
  page = await openPage(browser);
  await page.goto(site.url + "/dashboard", { waitUntil: "networkidle" });
});

after(async function () {
  await browser.close();
  await site.stop();
});

function monthFigures() {
  return page.evaluate(function () {
    return findash.state.data.months.map(function (month) {
      return [month.month, month.monthNum, month.year, month.revenue, month.totalExpenses, month.netProfit, month.budget];
    });
  });
}

async function addFiles(files) {
  await page.setInputFiles("#file", files);
  await waitUntilNotBusy(page);
}

async function download(buttonSelector) {
  const [file] = await Promise.all([page.waitForEvent("download"), page.click(buttonSelector)]);
  const saveTo = path.join(DOWNLOADS, file.suggestedFilename());
  await file.saveAs(saveTo);
  return saveTo;
}

test("opens on the latest demo month, with the figures the owner asks about first", async function () {
  assert.equal(await text(page, "#showing"), "September 2026");
  assert.match(await text(page, ".hero .figure"), /−\$3,640/);
  assert.ok(await page.locator("table tr", { hasText: "Rent" }).count() > 0);
  assert.equal(await page.locator("table tr", { hasText: "uncategorised" }).count(), 0);
  const attention = await text(page, ".prio");
  assert.ok(attention.includes("August 2026") && attention.includes("Over budget in 2 of 3"), attention);
});

test("the quarter adds up its months; months can be picked from the list and the charts", async function () {
  await page.click('#periods button[data-period="quarter"]');
  assert.equal(await text(page, "#showing"), "Jul–Sep 2026");
  assert.match(await text(page, ".hero .figure"), /\$9,360/);
  assert.equal(await page.locator("#months button.in-range").count(), 2);
  assert.match(await page.locator("table tr.group", { hasText: "Revenue" }).first().innerText(), /\$169,000/);
  await page.click('#periods button[data-period="month"]');

  await page.click('#months button[data-idx="0"]');
  assert.equal(await text(page, "#showing"), "July 2026");
  assert.match(await text(page, ".pulse"), /\$72,000/);

  await page.click('#months button[data-idx="2"]');
  await page.locator('.trend .hit[data-idx="1"]').click();
  assert.equal(await text(page, "#showing"), "August 2026");
  await page.click('#months button[data-idx="0"]');
});

test("a ? button explains a term, and Escape closes it", async function () {
  await page.locator('.help[data-help="fixed"]').first().click();
  const explanation = page.locator(".help-pop");
  assert.ok(await explanation.isVisible());
  assert.match(await explanation.innerText(), /rent/);
  await page.keyboard.press("Escape");
  assert.equal(await explanation.isVisible(), false);
});

test("currency symbol and cents follow the toolbar", async function () {
  await page.selectOption("#currency", "EUR");
  assert.match(await text(page, ".hero .figure"), /€7,580/);
  await page.check("#exact");
  assert.match(await text(page, ".hero .figure"), /€7,580\.00/);
  await page.uncheck("#exact");
  await page.selectOption("#currency", "USD");
});

test("the templates and the Excel export read back as the same figures", async function () {
  downloaded.templateXlsx = await download("#tpl-xlsx");
  downloaded.templateCsv = await download("#tpl-csv");
  downloaded.report = await download("#export");
  assert.match(path.basename(downloaded.report), /^findash-report-jul-sep-2026\.xlsx$/);

  for (const file of [downloaded.templateXlsx, downloaded.templateCsv, downloaded.report]) {
    await addFiles(file);
    assert.equal(JSON.stringify(await monthFigures()), DEMO_MONTHS, path.basename(file));
    const september = await page.evaluate(function () {
      return findash.state.data.months[2].lines;
    });
    assert.equal(september.rent, 6000);
    assert.equal(september.tax, 5200);
    assert.equal(september["business license"], 1250);
  }
  assert.equal(await page.locator("#loader.compact").count(), 1);
  assert.ok(await page.locator("#forget").isVisible());
});

test("the older two-file layout still reads", async function () {
  await addFiles([path.join(ROOT, "backend/legacy-java/data/dashboard.csv"), path.join(ROOT, "backend/legacy-java/data/expenses.csv")]);
  assert.match(await text(page, "#status"), /3 months from dashboard\.csv \+ expenses\.csv/);
  const withoutYears = (await monthFigures()).map(function (month) {
    return [month[0], month[1], month[3], month[4], month[5], month[6]];
  });
  const expected = JSON.parse(DEMO_MONTHS).map(function (month) {
    return [month[0], month[1], month[3], month[4], month[5], month[6]];
  });
  assert.deepEqual(withoutYears, expected);
});

test("figures are remembered after a reload", async function () {
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await text(page, "#source"), "Your figures");
  assert.equal(await text(page, "#showing"), "September 2026");
});

test("advice asks for a login first, and sends nothing until then", async function () {
  await page.click("#brief-go");
  await page.waitForSelector("#brief a[href^='/login']");
  assert.match(await text(page, "#brief"), /Advice needs a free account/);
  assert.equal(site.anthropic.requestsOfKind("advice").length, 0);
});

test("logged in, advice is written, kept, and not asked for twice", async function () {
  assert.equal(await signUp(page, site, newEmail("dashboard"), "correct horse battery"), 200);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.click("#brief-go");
  await page.waitForSelector("#brief h3");
  const sent = site.anthropic.requestsOfKind("advice");
  assert.equal(sent.length, 1);
  const figures = JSON.parse(sent[0].body.messages[0].content.split("Monthly figures:\n")[1].split("\n\nReply")[0]);
  assert.equal(figures.length, 3);
  assert.deepEqual(Object.keys(figures[0]).sort(), ["budget", "directExpenses", "fixedOverhead", "month",
    "netProfit", "operatingExpenses", "revenue", "totalExpenses", "variableOverhead"]);

  await page.click('#months button[data-idx="0"]');
  assert.ok(await page.locator("#brief h3").count() > 0, "still shown after changing month");
  await page.reload({ waitUntil: "networkidle" });
  assert.ok(await page.locator("#brief h3").count() > 0, "still shown after a reload");
  assert.equal(await text(page, "#brief-go"), "Ask again");
  assert.equal(site.anthropic.requestsOfKind("advice").length, 1);
});

test("Forget my data goes back to the demo and empties this browser", async function () {
  page.once("dialog", function (dialog) {
    dialog.accept();
  });
  await page.click("#forget");
  await page.waitForFunction(function () {
    return document.getElementById("source").textContent === "Demo data";
  });
  const stored = await page.evaluate(function () {
    return [localStorage.getItem("findash-data"), localStorage.getItem("findash-briefing")];
  });
  assert.deepEqual(stored, [null, null]);
});

test("a file written in euros switches the currency", async function () {
  const euros = path.join(DOWNLOADS, "euros.csv");
  writeFileSync(euros, 'Month,Year,Revenue,Budget,Cost of goods sold,Rent\n' +
    'January,2026,"€10.000,00","€9.000,00","€4.000,00","€2.500,00"\n' +
    'February,2026,"€12.000,00","€9.000,00","€5.000,00","€2.500,00"\n');
  await addFiles(euros);
  assert.equal(await page.locator("#currency").inputValue(), "EUR");
  assert.match(await text(page, ".hero .figure"), /€4,500/);
  await page.selectOption("#currency", "USD");
});

test("a long file: fourteen months, worked-out columns not counted twice, a forecast with amounts", async function () {
  await addFiles(path.join(FIXTURES, "fourteen-months.csv"));
  assert.equal(await text(page, "#showing"), "October 2026");
  assert.equal(await page.locator("#months button").count(), 14);
  const first = await page.evaluate(function () {
    return [findash.state.data.months[0].totalExpenses, findash.state.data.months[0].netProfit];
  });
  assert.deepEqual(first, [39465, 8468]);
  assert.match(await text(page, ".fan .key"), /Projected\s+\$[\d,]+ next month/);

  await page.click('#periods button[data-period="ytd"]');
  assert.equal(await text(page, "#showing"), "Jan–Oct 2026");
  assert.match(await text(page, ".gauge-note"), /Only 9 of 10 months have a budget/);
  await page.click('#periods button[data-period="month"]');
});

test("column names: the template never needs matching; unusual names are matched only when logged in", async function () {
  // Counted from here on: earlier files with fewer cost columns may have
  // asked where the missing ones were, which is expected.
  const alreadySent = site.anthropic.requestsOfKind("columns").length;
  const columnRequests = function () {
    return site.anthropic.requestsOfKind("columns").length - alreadySent;
  };
  await addFiles(downloaded.templateXlsx);
  assert.equal(columnRequests(), 0);

  const odd = path.join(DOWNLOADS, "odd.csv");
  writeFileSync(odd, "Month,Year,Revenue,Budget,Cost of goods sold,Bank charges\nJuly,2026,1000,900,400,50\n");

  // Logged in (from the advice test): the unusual column is matched and counted.
  await addFiles(odd);
  assert.equal(columnRequests(), 1);
  assert.equal(await page.evaluate(function () {
    return findash.state.data.months[0].totalExpenses;
  }), 450);

  // Logged out: nothing is sent, and the owner is told what wasn't counted.
  await page.click("#logout");
  await page.waitForSelector("#account .account-link[href='/login']");
  await page.reload({ waitUntil: "networkidle" });
  await addFiles(odd);
  assert.equal(columnRequests(), 1);
  assert.match(await text(page, "#status"), /Not counted, because the column names weren't recognised: bank charges/);
  assert.equal(await page.evaluate(function () {
    return findash.state.data.months[0].totalExpenses;
  }), 400);
});

test("no unexpected errors in the browser console", function () {
  assert.deepEqual(page.errors, []);
});

test("an error on the page is reported to the site's log", async function () {
  await page.evaluate(function () {
    setTimeout(function () {
      throw new Error("deliberate test error");
    }, 0);
  });
  await page.waitForTimeout(500);
  assert.ok(site.serverLogs.some(function (line) {
    return line.includes("[findash-error] page /dashboard: Uncaught Error: deliberate test error") ||
      line.includes("[findash-error] page /dashboard: deliberate test error");
  }), site.serverLogs.join("\n"));
});
