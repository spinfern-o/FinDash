/* Two people using the same browser, one after the other. Whatever happens
   in between (a Log out on the login page, a login that ran out), one
   person's figures must never be saved to the other's account, nor offered
   to them as "this browser's figures". */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startSite } from "../support/site.mjs";
import { launchBrowser, openPage, signUp, logIn, newEmail, waitUntilNotBusy, text } from "../support/browser.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TWO_FILES = [path.join(ROOT, "data/dashboard.csv"), path.join(ROOT, "data/expenses.csv")];
const PASSWORD = "correct horse battery";
const FIRST = newEmail("first-person");
const SECOND = newEmail("second-person");

let site;
let browser;
let euros;

before(async function () {
  site = await startSite();
  browser = await launchBrowser();
  euros = path.join(mkdtempSync(path.join(tmpdir(), "findash-test-")), "euros.csv");
  writeFileSync(euros, 'Month,Year,Revenue,Budget,Cost of goods sold,Rent\n' +
    'January,2026,"€10.000,00","€9.000,00","€4.000,00","€2.500,00"\n');
});

after(async function () {
  await browser.close();
  await site.stop();
});

function savedInAccount(email) {
  const row = site.supabase.figures.get(site.supabase.userId(email));
  if (!row) {
    return null;
  }
  return row.figures;
}

function savedInBrowser(page) {
  return page.evaluate(function () {
    return localStorage.getItem("findash-data");
  });
}

async function openDashboard(page) {
  await page.goto(site.url + "/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
}

async function addFiles(page, files) {
  await page.setInputFiles("#file", files);
  await waitUntilNotBusy(page);
  await page.waitForLoadState("networkidle");
}

/* The login running out (after 30 days, or cookies cleared) without anyone
   pressing Log out: the figures are still in the browser. */
async function loginRunsOut(page) {
  await page.context().clearCookies();
}

test("Log out on the login page removes the figures from this browser, as the dashboard's does", async function () {
  const page = await openPage(browser);
  const email = newEmail("login-page");
  assert.equal(await signUp(page, site, email, PASSWORD), 200);
  await openDashboard(page);
  await addFiles(page, TWO_FILES);
  assert.equal(savedInAccount(email).months.length, 3);

  await page.goto(site.url + "/login", { waitUntil: "networkidle" });
  await page.waitForSelector("#signed-in:not([hidden])");
  await page.click("#logout");
  await page.waitForSelector("#message.good");
  assert.match(await text(page, "#message"), /logged out/i);
  assert.equal(await savedInBrowser(page), null);
  assert.equal(savedInAccount(email).months.length, 3, "still in the account");

  await openDashboard(page);
  assert.equal(await text(page, "#source"), "Demo data");
  await page.context().close();
});

test("...but a change that never reached the account is kept, and said so", async function () {
  const page = await openPage(browser);
  const email = newEmail("unsaved");
  assert.equal(await signUp(page, site, email, PASSWORD), 200);
  await openDashboard(page);
  await addFiles(page, TWO_FILES);
  // As if the last save to the account had failed: the browser's copy is newer.
  await page.evaluate(function () {
    const saved = JSON.parse(localStorage.getItem("findash-data"));
    saved.from = "a newer file.csv";
    localStorage.setItem("findash-data", JSON.stringify(saved));
  });

  await page.goto(site.url + "/login", { waitUntil: "networkidle" });
  await page.waitForSelector("#signed-in:not([hidden])");
  await page.click("#logout");
  await page.waitForSelector("#message.good");
  assert.match(await text(page, "#message"), /hadn't been saved to your account/);
  assert.notEqual(await savedInBrowser(page), null);
  await page.context().close();
});

test("the next person to log in never gets the previous person's figures", async function () {
  const page = await openPage(browser);
  assert.equal(await signUp(page, site, FIRST, PASSWORD), 200);
  await openDashboard(page);
  await addFiles(page, TWO_FILES);
  assert.equal(savedInAccount(FIRST).from, "dashboard.csv + expenses.csv");

  await loginRunsOut(page);
  await openDashboard(page);
  assert.notEqual(await savedInBrowser(page), null, "still here after the login ran out");

  assert.equal(await signUp(page, site, SECOND, PASSWORD), 200);
  await openDashboard(page);
  assert.equal(savedInAccount(SECOND), null, "nothing of the first person's was saved to the second's account");
  assert.equal(await page.locator("#sync-choice").isVisible(), false, "and nothing was offered to them");
  assert.equal(await savedInBrowser(page), null);
  assert.equal(await text(page, "#source"), "Demo data");
  assert.match(await text(page, "#status"), /another account/);
  assert.equal(savedInAccount(FIRST).from, "dashboard.csv + expenses.csv", "the first person's account is untouched");

  // The second person's own figures are theirs, and are saved as usual.
  await addFiles(page, euros);
  assert.equal(savedInAccount(SECOND).from, "euros.csv");
  globalThis.sharedPage = page;
});

test("someone with figures of their own is not asked to swap them for the previous person's", async function () {
  const page = globalThis.sharedPage;
  await loginRunsOut(page);
  assert.equal(await logIn(page, site, FIRST, PASSWORD), 200);
  await openDashboard(page);
  assert.equal(await page.locator("#sync-choice").isVisible(), false);
  assert.match(await text(page, "#status"), /Loaded from your account: dashboard\.csv \+ expenses\.csv/);
  assert.equal(savedInAccount(SECOND).from, "euros.csv", "the second person's account is untouched");
  assert.equal(savedInAccount(FIRST).from, "dashboard.csv + expenses.csv");
});

test("figures added before logging in still go to the account you log into", async function () {
  const page = await openPage(browser);
  const email = newEmail("before-login");
  assert.equal(await signUp(page, site, email, PASSWORD), 200);
  await page.context().clearCookies();
  await openDashboard(page);
  await addFiles(page, euros);
  assert.equal(await logIn(page, site, email, PASSWORD), 200);
  await openDashboard(page);
  await page.waitForFunction(function () {
    return /now saved to your account too/.test(document.getElementById("status").textContent);
  });
  assert.equal(savedInAccount(email).from, "euros.csv");
  await page.context().close();
});
