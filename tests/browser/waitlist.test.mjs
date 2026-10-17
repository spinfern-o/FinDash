/* The waitlist page in a real browser, as it is before launch: it asks
   only for an email, a bad one is pointed out before anything is sent, a
   good one is kept and thanked, and the page fits on a phone. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startSite } from "../support/site.mjs";
import { launchBrowser, openPage, text } from "../support/browser.mjs";

let site;
let browser;
const pages = [];

before(async function () {
  site = await startSite({ appClosed: true });
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

test("the form asks for an email and nothing else", async function () {
  const page = await waitlistPage();
  assert.equal(await text(page, "h1"), "Join FinDash");
  const fields = await page.$$eval("#waitlist-form input, #waitlist-form select, #waitlist-form textarea",
    function (controls) {
      return controls.map(function (control) {
        return control.name;
      });
    });
  assert.deepEqual(fields, ["email", "website"], "the email, and the robot trap");
  const trap = await page.locator("#website").boundingBox();
  assert.ok(trap.x + trap.width <= 0, "the robot trap is off the screen, where people never see it");
  assert.equal(await page.getAttribute("#website", "tabindex"), "-1", "and the Tab key skips it");
});

test("a bad email is pointed out before anything is sent", async function () {
  const page = await waitlistPage();
  let requestsSent = 0;
  page.on("request", function (request) {
    if (request.url().endsWith("/api/waitlist")) {
      requestsSent += 1;
    }
  });
  await page.fill("#email", "owner at example");
  await page.click("#submit");
  assert.equal(await text(page, "#message"), "Enter a valid email address.");
  assert.equal(await page.getAttribute("#email", "aria-invalid"), "true");
  assert.equal(await page.evaluate(function () {
    return document.activeElement.id;
  }), "email");
  assert.equal(requestsSent, 0);
  assert.equal(site.supabase.waitlist.length, 0);
});

test("joining: the email is kept and the form gives way to a thank-you", async function () {
  const page = await waitlistPage();
  await page.fill("#email", "Owner@Example.test");
  await page.press("#email", "Enter");
  await page.waitForSelector("#joined:not([hidden])");
  assert.ok(await page.locator("#waitlist-form").isHidden());
  assert.equal(await text(page, "#joined-email"), "Owner@Example.test");
  assert.equal(site.supabase.waitlist.at(-1).email, "owner@example.test");
});

test("a problem the server finds is shown on the email", async function () {
  const page = await waitlistPage();
  await page.route("**/api/waitlist", function (route) {
    route.fulfill({ status: 503, json: { error: "The waitlist isn't open on this site yet." } });
  });
  await page.fill("#email", "owner@example.test");
  await page.click("#submit");
  await page.waitForSelector("#message.bad");
  assert.equal(await text(page, "#message"), "The waitlist isn't open on this site yet.");
  assert.equal(await page.getAttribute("#email", "aria-invalid"), "true");
  assert.equal(await text(page, "#submit"), "Join the waitlist");
  assert.ok(await page.locator("#waitlist-form").isVisible(), "the form stays, so nothing looks saved");
  page.errors = page.errors.filter(function (message) {
    return !/status of 503/.test(message);
  });
});

test("on a phone the page fits without sideways scrolling", async function () {
  const page = await waitlistPage({ viewport: { width: 360, height: 760 } });
  const widths = await page.evaluate(function () {
    return [document.documentElement.scrollWidth, innerWidth];
  });
  assert.equal(widths[0], widths[1]);
  assert.ok(await page.locator("#submit").isVisible());
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
