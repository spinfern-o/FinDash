/* Logging in, in a real browser: the Log in buttons, creating an account,
   wrong and right passwords, resetting a password from the emailed link,
   confirmation links, accounts switched off, the ?next= guard, and the
   delete-my-account request. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startSite } from "../support/site.mjs";
import { launchBrowser, openPage, newEmail, text } from "../support/browser.mjs";

const EMAIL = newEmail("owner");
let site;
let browser;
let page;

before(async function () {
  site = await startSite();
  browser = await launchBrowser();
  // Refusals these tests cause on purpose (a wrong password is a 401, a
  // reused one a 400) are logged by the browser; they are not faults.
  page = await openPage(browser, { ignore: /status of (400|401)/ });
});

after(async function () {
  await browser.close();
  await site.stop();
});

test("the landing page has Log in beside Open dashboard, in the header and the hero", async function () {
  await page.goto(site.url + "/", { waitUntil: "networkidle" });
  const header = await page.locator("header nav a").evaluateAll(function (links) {
    return links.map(function (link) {
      return link.textContent.trim().replace(/\s+/g, " ");
    });
  });
  assert.match(header.join("|"), /Log in\|Open dashboard/);
  const hero = await page.locator(".cta-row a").evaluateAll(function (links) {
    return links.map(function (link) {
      return link.textContent.trim();
    });
  });
  assert.deepEqual(hero.slice(0, 2), ["Open dashboard", "Log in"]);
  await page.click("header .login-link");
  assert.ok(page.url().endsWith("/login"));
  await page.waitForSelector("#form:not([hidden])");
  assert.equal(await text(page, "#title"), "Log in to FinDash");
});

test("creating an account: a short password is refused before sending, then the dashboard opens", async function () {
  await page.click('[data-mode="signup"]');
  assert.equal(await text(page, "#title"), "Create your account");
  assert.ok(page.url().endsWith("#signup"));
  await page.fill("#email", EMAIL);
  await page.fill("#password", "short");
  await page.click("#submit");
  assert.match(await text(page, "#message"), /at least 8 characters/);

  await page.fill("#password", "a-long-password");
  await Promise.all([page.waitForURL(site.url + "/dashboard"), page.click("#submit")]);
  await page.waitForSelector("#account .account-email");
  assert.equal(await text(page, "#account .account-email"), EMAIL);
  const cookiesScriptsCanSee = await page.evaluate(function () {
    return document.cookie;
  });
  assert.doesNotMatch(cookiesScriptsCanSee, /fd_access|fd_refresh/);
});

test("logging out from the dashboard brings back Log in, and it stays that way", async function () {
  await page.click("#logout");
  await page.waitForSelector("#account .account-link[href='/login']");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("#account .account-email").count(), 0);
});

test("a wrong password is refused; the right one logs in", async function () {
  await page.goto(site.url + "/login", { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", "wrong-password");
  await page.click("#submit");
  await page.waitForSelector("#message:not([hidden])");
  assert.match(await text(page, "#message"), /don't match/);
  assert.equal(await page.getAttribute("#password", "aria-invalid"), "true");
  await page.fill("#password", "a-long-password");
  await Promise.all([page.waitForURL(site.url + "/dashboard"), page.click("#submit")]);
});

test("the login page knows you are logged in, and can log you out", async function () {
  await page.goto(site.url + "/login", { waitUntil: "networkidle" });
  await page.waitForSelector("#signed-in:not([hidden])");
  assert.match(await text(page, "#lede"), new RegExp(EMAIL.replace(/[.+]/g, "\\$&")));
  await page.click("#signed-in #logout");
  await page.waitForSelector("#message.good");
  assert.match(await text(page, "#message"), /logged out/);
  assert.ok(await page.locator("#form").isVisible());
});

test("a password reset answers the same whether or not the email has an account", async function () {
  await page.click("#to-reset");
  assert.equal(await text(page, "#title"), "Reset your password");
  assert.ok(await page.locator("#pw-wrap").isHidden());
  await page.fill("#email", "nobody@nowhere.test");
  await page.click("#submit");
  await page.waitForSelector("#message.good");
  assert.match(await text(page, "#message"), /If there's an account for nobody@nowhere\.test/);
});

test("the reset link: tokens leave the address bar, an old password is refused, a new one works", async function () {
  const link = site.supabase.makeEmailLink(EMAIL);
  await page.goto("about:blank");
  await page.goto(site.url + "/login#access_token=" + link.access_token + "&refresh_token=" + link.refresh_token +
    "&expires_in=3600&token_type=bearer&type=recovery", { waitUntil: "networkidle" });
  await page.waitForSelector('#title:text("Choose a new password")');
  assert.ok(!page.url().includes("access_token"));
  await page.fill("#password", "a-long-password");
  await page.click("#submit");
  await page.waitForSelector("#message.bad");
  assert.match(await text(page, "#message"), /haven't used/);

  await page.fill("#password", "brand-new-password");
  await Promise.all([page.waitForURL(site.url + "/dashboard"), page.click("#submit")]);
  await page.click("#logout");
  await page.goto(site.url + "/login", { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", "brand-new-password");
  await Promise.all([page.waitForURL(site.url + "/dashboard"), page.click("#submit")]);
});

test("a confirmation link logs you in; an expired one is explained", async function () {
  const link = site.supabase.makeEmailLink(EMAIL);
  await page.goto("about:blank");
  await page.goto(site.url + "/login#access_token=" + link.access_token + "&refresh_token=" + link.refresh_token +
    "&expires_in=3600&token_type=bearer&type=signup", { waitUntil: "networkidle" });
  await page.waitForSelector("#signed-in:not([hidden])");
  assert.match(await text(page, "#message"), /Your email is confirmed/);

  await page.goto("about:blank");
  await page.goto(site.url + "/login#error=access_denied&error_code=otp_expired", { waitUntil: "networkidle" });
  await page.waitForSelector("#message.bad");
  assert.match(await text(page, "#message"), /expired/);
});

test("a sign-up that needs email confirmation says so", async function () {
  const other = await openPage(browser);
  await other.route("**/api/auth?action=signup", function (route) {
    route.fulfill({ json: { confirm: true } });
  });
  await other.goto(site.url + "/login#signup", { waitUntil: "networkidle" });
  await other.fill("#email", "new@shop.test");
  await other.fill("#password", "a-long-password");
  await other.click("#submit");
  await other.waitForSelector("#message.good");
  assert.match(await text(other, "#message"), /We sent a link to new@shop\.test/);
  assert.equal(await text(other, "#title"), "Log in to FinDash");
  await other.context().close();
});

test("a sign-up refused for an email problem shows the reason, not 'accounts are off'", async function () {
  const other = await openPage(browser);
  const refusals = [
    { status: 400, code: "email_address_not_authorized", message: "Email address not authorized",
      shown: /can't send emails to that address/ },
    { status: 500, code: "unexpected_failure", message: "Error sending confirmation email",
      shown: /confirmation email couldn't be sent/ },
    { status: 422, code: "signup_disabled", message: "Signups not allowed for this instance",
      shown: /isn't taking new accounts/ }
  ];
  try {
    for (const refusal of refusals) {
      site.supabase.options.signupError = refusal;
      await other.goto("about:blank");
      await other.goto(site.url + "/login#signup", { waitUntil: "networkidle" });
      await other.fill("#email", newEmail("refused"));
      await other.fill("#password", "a-long-password");
      await other.click("#submit");
      await other.waitForSelector("#message.bad");
      const shown = await text(other, "#message");
      assert.match(shown, refusal.shown, refusal.code);
      assert.doesNotMatch(shown, /aren't switched on/, refusal.code);
      assert.ok(!(await other.locator("#submit").isDisabled()), refusal.code + ": the form stays usable");
    }
  } finally {
    site.supabase.options.signupError = null;
    await other.context().close();
  }
});

test("accounts switched off: the form explains, and the dashboard never asks who is logged in", async function () {
  const other = await openPage(browser);
  let authRequests = 0;
  await other.route("**/api/capabilities", function (route) {
    route.fulfill({ json: { accounts: false } });
  });
  await other.route("**/api/auth**", function (route) {
    authRequests += 1;
    route.continue();
  });
  await other.goto(site.url + "/login", { waitUntil: "networkidle" });
  assert.match(await text(other, "#message"), /aren't switched on/);
  assert.ok(await other.locator("#submit").isDisabled());
  await other.goto(site.url + "/dashboard", { waitUntil: "networkidle" });
  assert.ok(await other.locator("#account .account-link[href='/login']").isVisible());
  assert.equal(authRequests, 0);
  await other.context().close();
});

test("?next= pointing at another site is ignored", async function () {
  const other = await openPage(browser);
  await other.goto(site.url + "/login?next=//evil.example/x", { waitUntil: "networkidle" });
  await other.fill("#email", EMAIL);
  await other.fill("#password", "brand-new-password");
  await other.click("#submit");
  await other.waitForURL(site.url + "/dashboard");
  await other.context().close();
});

test("delete my account: asks first, removes the saved figures, logs out, and opens the request email", async function () {
  // Something saved in the account and in this browser first.
  await page.goto(site.url + "/dashboard", { waitUntil: "networkidle" });
  const userId = site.supabase.userId(EMAIL);
  site.supabase.figures.set(userId, { figures: { v: 2, months: [], invoices: [] }, updated_at: "2026-10-01" });
  await page.evaluate(function () {
    localStorage.setItem("findash-data", "{}");
  });

  await page.goto(site.url + "/login", { waitUntil: "networkidle" });
  await page.waitForSelector("#signed-in:not([hidden])");

  // Saying no changes nothing.
  page.once("dialog", function (dialog) {
    dialog.dismiss();
  });
  await page.click("#delete-account");
  await page.waitForTimeout(200);
  assert.ok(site.supabase.figures.has(userId));

  // Saying yes: the request email is opened (caught here instead of a mail app).
  let mailto = "";
  await page.route("mailto:**", function (route) {
    mailto = route.request().url();
    route.abort();
  });
  page.on("framenavigated", function (frame) {
    if (frame.url().startsWith("mailto:")) {
      mailto = frame.url();
    }
  });
  let question = "";
  page.once("dialog", function (dialog) {
    question = dialog.message();
    dialog.accept();
  });
  await page.click("#delete-account");
  await page.waitForSelector("#message.good");
  assert.match(question, /Delete your FinDash account/);
  assert.equal(site.supabase.figures.has(userId), false);
  assert.equal(await page.evaluate(function () {
    return localStorage.getItem("findash-data");
  }), null);
  assert.match(await text(page, "#message"), /send the email that just opened/);
  assert.ok(await page.locator("#form").isVisible(), "logged out");
  const me = await page.request.get(site.url + "/api/auth?action=me");
  assert.equal((await me.json()).user, null);
  if (mailto) {
    assert.match(decodeURIComponent(mailto), /Delete my FinDash account/);
    assert.match(mailto, /^mailto:support\.findash@findash\.tech\?/);
  }
});

test("no unexpected errors in the browser console", function () {
  assert.deepEqual(page.errors.filter(function (message) {
    return !/mailto|ERR_ABORTED|Failed to launch/.test(message);
  }), []);
});
