/* FinDash Plus in a real browser, against the stand-ins for Stripe and
   Supabase: the plan box on the login page, paying on (the stand-in for)
   Stripe's checkout page and coming back, leaving it without paying,
   Manage billing, deleting an account with Plus, the advice card's limit
   message, and the pricing page. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startSite } from "../support/site.mjs";
import { launchBrowser, openPage, signUp, newEmail, text } from "../support/browser.mjs";

const PASSWORD = "correct horse battery";

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

/* A page logged in as someone new, on the login page: { page, email }.
   expectsOutage: the test makes Stripe fail on purpose, so the browser's
   own note of the 502 answer is expected. */
async function loggedInOnLoginPage(expectsOutage) {
  let ignore = /mailto|ERR_ABORTED|Failed to launch/;
  if (expectsOutage) {
    ignore = /mailto|ERR_ABORTED|Failed to launch|status of 502/;
  }
  const page = await openPage(browser, { ignore: ignore });
  pages.push(page);
  const email = newEmail("plans");
  assert.equal(await signUp(page, site, email, PASSWORD), 200);
  await page.goto(site.url + "/login", { waitUntil: "networkidle" });
  await page.waitForSelector("#plan-box:not([hidden]) .plan-name");
  return { page: page, email: email };
}

/* Presses a button that leads to Stripe, and waits to arrive there. */
async function goToStripe(page, selector) {
  await Promise.all([page.waitForURL(site.stripe.url + "/**"), page.click(selector)]);
}

test("the plan box shows the free plan, this month's use, and the way to Plus", async function () {
  const { page } = await loggedInOnLoginPage();
  assert.equal(await text(page, "#plan-box .plan-name"), "Your plan: Free");
  assert.equal(await text(page, "#plan-box .plan-usage"), "This month: 0 of 10 photo reads · 0 of 2 requests for advice");
  assert.equal(await text(page, '[data-checkout="month"]'), "Get Plus: $19 a month");
  assert.equal(await text(page, '[data-checkout="year"]'), "or $190 a year");
  assert.equal(await page.getAttribute("#plan-box .plan-note a", "href"), "/pricing");
});

test("paying on Stripe's page brings you back on Plus, welcomed once", async function () {
  const { page, email } = await loggedInOnLoginPage();
  await goToStripe(page, '[data-checkout="month"]');
  await Promise.all([page.waitForURL(site.url + "/login?plan=welcome"), page.click("#pay")]);
  await page.waitForSelector("#message.good");
  assert.match(await text(page, "#message"), /Welcome to Plus/);
  assert.match(await text(page, "#plan-box .plan-name"), /^Your plan: Plus · billed monthly, renews \d+ \w+ \d{4}\.$/);
  assert.equal(await text(page, "#plan-box .plan-usage"), "This month: 0 of 100 photo reads · 0 of 20 requests for advice");
  assert.equal(await page.locator("[data-checkout]").count(), 0);
  assert.equal(new URL(page.url()).search, "", "a refresh won't welcome them again");
  assert.equal(site.stripe.customers.get(site.supabase.billingCustomers.get(site.supabase.userId(email))).email, email);

  // Manage billing goes to Stripe's billing page.
  await goToStripe(page, "[data-portal]");
  assert.match(page.url(), /\/portal\/cus_/);
});

test("leaving Stripe's page without paying changes nothing", async function () {
  const { page } = await loggedInOnLoginPage();
  await goToStripe(page, '[data-checkout="year"]');
  await Promise.all([page.waitForURL(site.url + "/login?plan=not-now"), page.click("#back")]);
  await page.waitForSelector("#message.good");
  assert.equal(await text(page, "#message"), "No payment was taken. You're still on the free plan.");
  assert.equal(await text(page, "#plan-box .plan-name"), "Your plan: Free");
});

test("a cancelled Plus says when it ends; a failed payment says to update the card", async function () {
  const { page } = await loggedInOnLoginPage();
  await goToStripe(page, '[data-checkout="month"]');
  await Promise.all([page.waitForURL(site.url + "/login?plan=welcome"), page.click("#pay")]);
  const subscription = site.stripe.subscriptions.at(-1);

  subscription.cancel_at_period_end = true;
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#plan-box:not([hidden]) .plan-name");
  assert.match(await text(page, "#plan-box .plan-name"), /cancelled: Plus carries on until \d+ \w+ \d{4}, then you're back on Free\./);

  subscription.cancel_at_period_end = false;
  subscription.status = "past_due";
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#plan-box:not([hidden]) .plan-name");
  assert.match(await text(page, "#plan-box .plan-name"), /The last payment didn't go through/);
});

test("a checkout Stripe can't start is explained in the box, and the button works again", async function () {
  const { page } = await loggedInOnLoginPage(true);
  site.stripe.options.isDown = true;
  try {
    await page.click('[data-checkout="month"]');
    await page.waitForSelector("#plan-box .plan-problem:not([hidden])");
    assert.match(await text(page, "#plan-box .plan-problem"), /Stripe couldn't be reached/);
    assert.equal(await page.isDisabled('[data-checkout="month"]'), false);
  } finally {
    site.stripe.options.isDown = false;
  }
});

test("deleting an account with Plus ends it first; if Stripe can't be reached, nothing is deleted", async function () {
  const { page, email } = await loggedInOnLoginPage(true);
  await goToStripe(page, '[data-checkout="month"]');
  await Promise.all([page.waitForURL(site.url + "/login?plan=welcome"), page.click("#pay")]);
  await page.waitForSelector("#plan-box .plan-name");
  const userId = site.supabase.userId(email);
  const customerId = site.supabase.billingCustomers.get(userId);
  site.supabase.figures.set(userId, { figures: { v: 2, months: [], invoices: [] }, updated_at: "2026-10-01" });
  await page.route("mailto:**", function (route) {
    route.abort();
  });
  let question = "";
  page.on("dialog", function (dialog) {
    question = dialog.message();
    dialog.accept();
  });

  site.stripe.options.isDown = true;
  try {
    await page.click("#delete-account");
    await page.waitForSelector("#message.bad");
    assert.match(await text(page, "#message"), /couldn't be ended just now, so nothing was deleted/);
    assert.ok(site.supabase.figures.has(userId));
  } finally {
    site.stripe.options.isDown = false;
  }

  await page.click("#delete-account");
  await page.waitForSelector("#message.good");
  assert.match(question, /If you have Plus, it ends now and you won't be charged again/);
  assert.match(await text(page, "#message"), /^Plus has ended and you won't be charged again\. Your saved figures were removed/);
  assert.equal(site.stripe.customers.get(customerId).deleted, true);
  assert.equal(site.supabase.figures.has(userId), false);
});

test("advice used up for the month: the card links to the pricing page", async function () {
  // The 429 answer is the point of the test; the browser notes it.
  const page = await openPage(browser, { ignore: /status of 429/ });
  pages.push(page);
  assert.equal(await signUp(page, site, newEmail("advice"), PASSWORD), 200);
  await page.route("**/api/briefing", function (route) {
    route.fulfill({ status: 429, json: { error: "You've used this month's 2 requests for advice. FinDash Plus " +
      "includes 20 a month: see the Pricing page.", plan: "free", upgrade: "/pricing" } });
  });
  await page.goto(site.url + "/dashboard", { waitUntil: "networkidle" });
  await page.click("#brief-go");
  await page.waitForSelector("#brief .brief-note a");
  assert.equal(await page.getAttribute("#brief .brief-note a", "href"), "/pricing");
  assert.match(await text(page, "#brief"), /^You've used this month's 2 requests for advice\./);
  assert.equal(await text(page, "#brief-go"), "Try again");
});

test("the pricing page: the plans, linked from every footer, and readable on a phone", async function () {
  const page = await openPage(browser, { viewport: { width: 375, height: 800 } });
  pages.push(page);
  await page.goto(site.url + "/pricing", { waitUntil: "networkidle" });
  assert.equal(await text(page, "h1"), "Pricing");
  assert.match(await page.title(), /^Pricing/);
  assert.equal(await page.locator("#plan-table tbody tr").count(), 8);
  const widths = await page.evaluate(function () {
    return [document.documentElement.scrollWidth, innerWidth];
  });
  assert.equal(widths[0], widths[1], "the table scrolls inside its box, not the page");
  for (const address of ["/", "/dashboard", "/help", "/login", "/privacy", "/terms", "/about"]) {
    await page.goto(site.url + address, { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator('footer a[href="/pricing"]').count(), 1, address);
  }
});

test("no unexpected errors in the browser console", function () {
  for (const page of pages) {
    assert.deepEqual(page.errors, []);
  }
});
