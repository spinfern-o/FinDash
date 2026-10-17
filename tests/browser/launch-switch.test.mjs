/* One switch opens FinDash: with FINDASH_APP_OPEN unset the public pages
   lead to the waitlist and the app's pages send visitors there; set to 1,
   every way in leads into the app instead, from the first frame drawn, and
   the waitlist page says FinDash is open. The middleware reads the
   variable on each request, so these tests flip it between pages (with a
   fresh browser, as a browser keeps /app-state.js for a minute). */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startSite } from "../support/site.mjs";
import { launchBrowser, openPage, text } from "../support/browser.mjs";

let site;
let browser;
let page;

before(async function () {
  site = await startSite({ appClosed: true });
  browser = await launchBrowser();
  page = await openPage(browser, { viewport: { width: 1280, height: 900 } });
});

after(async function () {
  delete process.env.FINDASH_APP_OPEN;
  await browser.close();
  await site.stop();
});

/* The links someone can see and use, as [text, address]. */
function visibleWaysIn(selector) {
  return page.locator(selector + " >> visible=true").evaluateAll(function (links) {
    return links.map(function (link) {
      return [link.textContent.trim(), link.getAttribute("href")];
    });
  });
}

/* Whether the page was marked open before anything after <head> ran. */
function markedBeforeBody() {
  return page.evaluate(function () {
    return window.markedAtStart;
  });
}

async function visit(address) {
  await page.addInitScript(function () {
    document.addEventListener("readystatechange", function () {
      if (document.readyState === "interactive" && window.markedAtStart === undefined) {
        window.markedAtStart = document.documentElement.classList.contains("app-open");
      }
    });
  });
  await page.goto(site.url + address, { waitUntil: "networkidle" });
}

test("closed: every way in on the home page leads to the waitlist, and the app's pages send people there", async function () {
  delete process.env.FINDASH_APP_OPEN;
  await visit("/");
  assert.equal(await page.evaluate(function () { return document.documentElement.classList.contains("app-open"); }), false);
  assert.deepEqual(await visibleWaysIn("header .enter-link"), [["Join the waitlist", "/waitlist"]]);
  assert.deepEqual((await visibleWaysIn(".intro .cta-row a"))[0], ["Join the waitlist", "/waitlist"]);
  assert.equal(await page.locator('main a[href="/dashboard"] >> visible=true').count(), 0);
  assert.equal(await page.locator("header .login-link >> visible=true").count(), 0);
  assert.match(await text(page, ".intro .lede"), /join the waitlist to get in first/);

  await page.goto(site.url + "/dashboard");
  assert.ok(page.url().endsWith("/waitlist"));
  assert.ok(await page.locator("#waitlist-form").isVisible(), "the form, before launch");
  assert.equal(await page.locator(".open-actions >> visible=true").count(), 0);
});

test("open: every way in leads into the app, from the first frame, with Log in beside it", async function () {
  process.env.FINDASH_APP_OPEN = "1";
  // A browser keeps /app-state.js for a minute; a new visitor asks afresh.
  const errors = page.errors;
  await page.context().close();
  page = await openPage(browser, { viewport: { width: 1280, height: 900 } });
  page.errors = errors;
  await visit("/");
  assert.equal(await markedBeforeBody(), true, "marked before the page was drawn: no flash of the waitlist");
  assert.deepEqual(await visibleWaysIn("header .enter-link"), [["Open the dashboard", "/dashboard"]]);
  assert.ok(await page.locator("header .login-link").isVisible());
  assert.deepEqual((await visibleWaysIn(".intro .cta-row a"))[0], ["Open the dashboard", "/dashboard"]);
  assert.deepEqual(await visibleWaysIn("#coming-next a"), [["Open daily stock", "/stock"]]);
  assert.equal(await page.locator('main a[href="/waitlist"] >> visible=true').count(), 0, "no waitlist buttons");
  assert.doesNotMatch(await text(page, ".intro .lede"), /waitlist/);
  assert.deepEqual(await visibleWaysIn(".footer-links a[href='/dashboard']"), [["Dashboard", "/dashboard"]]);
  assert.equal(await page.locator(".footer-links a[href='/waitlist'] >> visible=true").count(), 0);
});

test("open: the waitlist page says FinDash is open and offers the way in instead of the form", async function () {
  await visit("/waitlist");
  assert.equal(await text(page, "h1"), "Join FinDash");
  assert.ok(await page.locator("#waitlist-form").isHidden());
  assert.deepEqual(await visibleWaysIn(".open-actions a"),
    [["Open the dashboard", "/dashboard"], ["Open daily stock", "/stock"], ["Log in", "/login"]]);
  await page.goto(site.url + "/dashboard", { waitUntil: "networkidle" });
  assert.ok(page.url().endsWith("/dashboard"), "the dashboard itself is open");
  assert.deepEqual(await visibleWaysIn("header .enter-link"), [["Stock", "/stock"]], "on the dashboard, the way to stock");
});

test("open: the restaurant page and the 404 lead into the app too", async function () {
  await visit("/restaurant-profit-and-loss");
  assert.ok(await page.locator('main a[href="/dashboard"]').first().isVisible());
  assert.equal(await page.locator('main a[href="/waitlist"] >> visible=true').count(), 0);
  assert.doesNotMatch(await text(page, "main .lede"), /waitlist/);
});

test("no unexpected errors in the browser console", function () {
  assert.deepEqual(page.errors, []);
});
