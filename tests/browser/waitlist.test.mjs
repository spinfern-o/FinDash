/* The waitlist page in a real browser: the form's choices come from
   waitlist-options.js, a missing answer is pointed out before anything is
   sent, a good one is kept and thanked, and the page fits on a phone. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startSite } from "../support/site.mjs";
import { launchBrowser, openPage, text } from "../support/browser.mjs";
import { BUSINESS_TYPES, LANGUAGES, INVOICE_COUNTS } from "../../frontend/js/waitlist-options.js";

let site;
let browser;
const pages = [];

before(async function () {
  site = await startSite();
  browser = await launchBrowser();
});

after(async function () {
  await browser.close();
  await site.stop();
});

async function waitlistPage(options) {
  const page = await openPage(browser, options);
  pages.push(page);
  await page.goto(site.url + "/waitlist", { waitUntil: "networkidle" });
  return page;
}

test("the form offers exactly the choices the server accepts", async function () {
  const page = await waitlistPage();
  assert.equal(await text(page, "h1"), "Join the waitlist");
  const businessTypes = await page.$$eval("#business-type option", function (options) {
    return options.map(function (option) {
      return option.value;
    });
  });
  assert.deepEqual(businessTypes, [""].concat(BUSINESS_TYPES.map(function (type) {
    return type.value;
  })));
  assert.equal(await page.locator("#invoices-per-month option").count(), INVOICE_COUNTS.length + 1);
  assert.deepEqual(await page.$$eval(".language-table thead th", function (cells) {
    return cells.map(function (cell) {
      return cell.textContent;
    });
  }), ["Language", "You", "Your staff", "Supplier invoices"]);
  assert.equal(await page.locator(".language-table tbody tr").count(), LANGUAGES.length);
  assert.equal(await page.locator(".language-table input[type=checkbox]").count(), LANGUAGES.length * 3);
  assert.equal(await page.getAttribute('input[name="staffLanguages"][value="es"]', "aria-label"),
    "Spanish: Your staff");
  assert.match(await text(page, ".language-table tbody tr:nth-child(3) th"), /Chinese\s*中文/);
  const trap = await page.locator("#website").boundingBox();
  assert.ok(trap.x + trap.width <= 0, "the robot trap is off the screen, where people never see it");
  assert.equal(await page.getAttribute("#website", "tabindex"), "-1", "and the Tab key skips it");
});

test("a missing answer is pointed out before anything is sent", async function () {
  const page = await waitlistPage();
  let requestsSent = 0;
  page.on("request", function (request) {
    if (request.url().endsWith("/api/waitlist")) {
      requestsSent += 1;
    }
  });
  await page.fill("#email", "owner@example.test");
  await page.click("#submit");
  assert.equal(await text(page, "#message"), "Choose what kind of business you run.");
  assert.equal(await page.getAttribute("#business-type", "aria-invalid"), "true");
  assert.equal(await page.evaluate(function () {
    return document.activeElement.id;
  }), "business-type");
  assert.equal(requestsSent, 0);
  assert.equal(site.supabase.waitlist.length, 0);
});

test("joining: the answers are kept and the form gives way to a thank-you", async function () {
  const page = await waitlistPage();
  await page.fill("#email", "Owner@Example.test");
  await page.selectOption("#business-type", "restaurant");
  await page.fill("#country", "United States");
  for (const box of ['ownerLanguages"][value="zh', 'ownerLanguages"][value="en', 'staffLanguages"][value="es',
    'invoiceLanguages"][value="zh', 'invoiceLanguages"][value="en']) {
    await page.check(`input[name="${box}"]`);
  }
  await page.fill("#other-languages", "Cantonese");
  await page.selectOption("#invoices-per-month", "30-60");
  await page.fill("#hardest-part", "Keeping track of inventory.");
  await page.click("#submit");
  await page.waitForSelector("#joined:not([hidden])");
  assert.ok(await page.locator("#waitlist-form").isHidden());
  assert.equal(await text(page, "#joined-email"), "Owner@Example.test");

  const row = site.supabase.waitlist.at(-1);
  assert.equal(row.email, "owner@example.test");
  assert.deepEqual([row.owner_languages, row.staff_languages, row.invoice_languages],
    [["en", "zh"], ["es"], ["en", "zh"]]);
  assert.deepEqual([row.business_type, row.country, row.other_languages, row.invoices_per_month, row.hardest_part],
    ["restaurant", "United States", "Cantonese", "30-60", "Keeping track of inventory."]);
});

test("a problem the server finds is shown on the answer to fix", async function () {
  const page = await waitlistPage();
  await page.route("**/api/waitlist", function (route) {
    route.fulfill({ status: 400, json: { error: "Enter the country your business is in.", field: "country" } });
  });
  await page.fill("#email", "owner@example.test");
  await page.selectOption("#business-type", "grocery");
  await page.fill("#country", "Somewhere");
  await page.selectOption("#invoices-per-month", "under-10");
  await page.click("#submit");
  await page.waitForSelector("#message.bad");
  assert.equal(await text(page, "#message"), "Enter the country your business is in.");
  assert.equal(await page.getAttribute("#country", "aria-invalid"), "true");
  assert.equal(await text(page, "#submit"), "Join the waitlist");
  page.errors = page.errors.filter(function (message) {
    return !/status of 400/.test(message);
  });
});

test("on a phone the page fits without sideways scrolling, languages table included", async function () {
  const page = await waitlistPage({ viewport: { width: 360, height: 760 } });
  const widths = await page.evaluate(function () {
    return [document.documentElement.scrollWidth, innerWidth];
  });
  assert.equal(widths[0], widths[1]);
  assert.ok(await page.locator('input[name="invoiceLanguages"][value="th"]').isVisible());
});

test("the home page and every footer lead to the waitlist", async function () {
  const page = await openPage(browser);
  pages.push(page);
  await page.goto(site.url + "/", { waitUntil: "domcontentloaded" });
  assert.equal(await page.getAttribute("#coming-next a", "href"), "/waitlist");
  for (const address of ["/", "/dashboard", "/help", "/login", "/privacy", "/about"]) {
    await page.goto(site.url + address, { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator('footer a[href="/waitlist"]').count(), 1, address);
  }
});

test("no unexpected errors in the browser console", function () {
  for (const page of pages) {
    assert.deepEqual(page.errors, []);
  }
});
