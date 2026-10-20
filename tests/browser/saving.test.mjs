/* Saving figures to an account, with several browsers ("computers")
   sharing one account: loading on login, choosing when the two differ,
   saving every change, Forget my data, and logging out. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startSite } from "../support/site.mjs";
import { launchBrowser, openPage, signUp, logIn, newEmail, waitUntilNotBusy, text } from "../support/browser.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DOWNLOADS = mkdtempSync(path.join(tmpdir(), "findash-test-"));
const EMAIL = newEmail("saving");
const PASSWORD = "correct horse battery";
const TWO_FILES = [path.join(ROOT, "backend/legacy-java/data/dashboard.csv"), path.join(ROOT, "backend/legacy-java/data/expenses.csv")];

let site;
let browser;
let template;
let euros;
const computers = {};

before(async function () {
  site = await startSite();
  browser = await launchBrowser();
  euros = path.join(DOWNLOADS, "euros.csv");
  writeFileSync(euros, 'Month,Year,Revenue,Budget,Cost of goods sold,Rent\n' +
    'January,2026,"€10.000,00","€9.000,00","€4.000,00","€2.500,00"\n' +
    'February,2026,"€12.000,00","€9.000,00","€5.000,00","€2.500,00"\n');
});

after(async function () {
  await browser.close();
  await site.stop();
});

function savedInAccount() {
  if (!site.supabase.users.has(EMAIL)) {
    return null;
  }
  const row = site.supabase.figures.get(site.supabase.userId(EMAIL));
  if (!row) {
    return null;
  }
  return row.figures;
}

async function newComputer(name) {
  const page = await openPage(browser, { ignore: /status of 404/ });
  computers[name] = page;
  return page;
}

async function addFiles(page, files) {
  await page.setInputFiles("#file", files);
  await waitUntilNotBusy(page);
  await page.waitForLoadState("networkidle");
}

async function open(page) {
  await page.goto(site.url + "/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
}

function savedInBrowser(page) {
  return page.evaluate(function () {
    return localStorage.getItem("findash-data");
  });
}

function monthsOnScreen(page) {
  return page.evaluate(function () {
    return findash.state.data.months.map(function (month) {
      return month.month + " " + month.year + " " + month.netProfit;
    }).join(", ");
  });
}

test("computer 1 signs up; a file added while logged in is saved to the account", async function () {
  const page = await newComputer("first");
  assert.equal(await signUp(page, site, EMAIL, PASSWORD), 200);
  await open(page);
  assert.match(await text(page, "#account"), new RegExp(EMAIL.replace(/[.+]/g, "\\$&")));
  assert.equal(await text(page, "#source"), "Demo data");
  assert.match(await text(page, "#privacy-figures"), /saved to your account/);
  assert.equal(savedInAccount(), null);

  const [file] = await Promise.all([page.waitForEvent("download"), page.click("#tpl-csv")]);
  template = path.join(DOWNLOADS, "findash-template.csv");
  await file.saveAs(template);
  await addFiles(page, template);
  assert.match(await text(page, "#status"), /Saved to your account/);
  const saved = savedInAccount();
  assert.equal(saved.months.length, 3);
  assert.equal(saved.from, "findash-template.csv");
  assert.ok(Array.isArray(saved.invoices));
});

test("computer 2 logs in and gets the same figures", async function () {
  const page = await newComputer("second");
  assert.equal(await logIn(page, site, EMAIL, PASSWORD), 200);
  await open(page);
  assert.match(await text(page, "#status"), /^Loaded from your account: findash-template\.csv/);
  assert.equal(await monthsOnScreen(page), await monthsOnScreen(computers.first));
  assert.notEqual(await savedInBrowser(page), null);

  await addFiles(page, TWO_FILES);
  assert.equal(savedInAccount().from, "dashboard.csv + expenses.csv");
});

test("computer 1 now holds older, different figures: the owner chooses which to keep", async function () {
  const page = computers.first;
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  assert.ok(await page.locator("#sync-choice").isVisible());
  const choice = await text(page, "#sync-choice");
  assert.ok(choice.includes("3 months from dashboard.csv + expenses.csv"), choice);
  assert.ok(choice.includes("3 months from findash-template.csv"), choice);

  const accountBefore = JSON.stringify(savedInAccount().months);
  await page.click("#keep-account");
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator("#sync-choice").isVisible(), false);
  assert.match(await text(page, "#status"), /^Loaded from your account: dashboard\.csv \+ expenses\.csv/);
  assert.equal(JSON.parse(await savedInBrowser(page)).from, "dashboard.csv + expenses.csv");
  assert.equal(JSON.stringify(savedInAccount().months), accountBefore);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  assert.equal(await page.locator("#sync-choice").isVisible(), false, "no question when both match");
});

test("logging out removes the figures from that browser; they stay in the account", async function () {
  const page = computers.first;
  await page.click("#logout");
  await page.waitForFunction(function () {
    return document.getElementById("source").textContent === "Logged out";
  });
  assert.match(await text(page, "#status"), /removed from this browser/);
  assert.equal(await savedInBrowser(page), null);
  assert.equal(await text(page, "#showing"), "September 2026");
  assert.match(await text(page, "#privacy-figures"), /only leave when you press/);
  assert.notEqual(savedInAccount(), null);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await text(page, "#source"), "Demo data");
});

test("computer 3 had its own figures before logging in, and keeps them", async function () {
  const page = await newComputer("third");
  await open(page);
  await addFiles(page, euros);
  assert.match(await text(page, "#status"), /Saved in this browser/);
  assert.equal(await logIn(page, site, EMAIL, PASSWORD), 200);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  assert.ok(await page.locator("#sync-choice").isVisible());
  await page.click("#keep-browser");
  await page.waitForFunction(function () {
    return /now saved to your account/.test(document.getElementById("status").textContent);
  });
  assert.equal(savedInAccount().from, "euros.csv");
  assert.equal(savedInAccount().months.length, 2);
});

test("Forget my data while logged in asks first, then empties the account and the browser", async function () {
  const page = computers.third;
  page.once("dialog", function (dialog) {
    dialog.dismiss();
  });
  await page.click("#forget");
  await page.waitForTimeout(300);
  assert.notEqual(savedInAccount(), null);
  assert.notEqual(await savedInBrowser(page), null);

  let question = "";
  page.once("dialog", function (dialog) {
    question = dialog.message();
    dialog.accept();
  });
  await page.click("#forget");
  await page.waitForFunction(function () {
    return document.getElementById("source").textContent === "Demo data";
  });
  assert.match(question, /removed from this browser and from your account/);
  assert.equal(savedInAccount(), null);
  assert.equal(await savedInBrowser(page), null);
  assert.match(await text(page, "#status"), /removed from this browser and your account/);
});

test("an empty account takes the browser's figures on login", async function () {
  const page = await newComputer("fourth");
  await open(page);
  await addFiles(page, template);
  assert.equal(await logIn(page, site, EMAIL, PASSWORD), 200);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(function () {
    return /now saved to your account too/.test(document.getElementById("status").textContent);
  });
  assert.equal(savedInAccount().from, "findash-template.csv");

  // Computer 2's browser still has the two-file figures: it is asked too.
  await computers.second.reload({ waitUntil: "networkidle" });
  await computers.second.waitForTimeout(300);
  assert.ok(await computers.second.locator("#sync-choice").isVisible());
});

test("logged out, Forget my data removes without asking", async function () {
  const page = await newComputer("fifth");
  await open(page);
  await addFiles(page, euros);
  let asked = false;
  page.once("dialog", function (dialog) {
    asked = true;
    dialog.accept();
  });
  await page.click("#forget");
  await page.waitForTimeout(300);
  assert.equal(asked, false);
  assert.equal(await savedInBrowser(page), null);
});

test("no unexpected errors in any browser's console", function () {
  for (const name of Object.keys(computers)) {
    assert.deepEqual(computers[name].errors, [], name);
  }
});
