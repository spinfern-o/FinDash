/* FinDash Plus through Stripe (api/billing.js, lib/billing.js), against the
   stand-ins for Stripe and Supabase: the plan comes from Stripe and only
   counts when Stripe's record of the customer names the same account;
   checkout and the billing page need a login on this site; deleting an
   account ends Plus; and an outage falls back to the free plan, never to
   an error. Also: the plans the server enforces are the ones the pricing
   page and the structured data advertise. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startSite } from "../support/site.mjs";
import { httpClient } from "../support/http-client.mjs";
import { newEmail } from "../support/browser.mjs";
import { PLANS } from "../../docs/js/plans.js";

const PASSWORD = "correct horse battery";
const ADVICE_REQUEST = {
  months: [{ month: "July", year: 2026, revenue: 72000, budget: 66000, direct: 45500, operating: 7750,
    variable: 3750, fixed: 7420, netProfit: 7580 }],
  currency: "USD"
};
const PHOTO_REQUEST = {
  image: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  mediaType: "image/png"
};

let site;

before(async function () {
  site = await startSite();
});

after(async function () {
  await site.stop();
});

/* A new logged-in person: { client, email, id }. */
async function newPerson() {
  const client = httpClient(site);
  const email = newEmail("plus");
  const response = await client.post("/api/auth?action=signup", { email: email, password: PASSWORD });
  assert.equal(response.status, 200);
  return { client: client, email: email, id: site.supabase.userId(email) };
}

/* Someone who has paid for Plus: checkout, then the stand-in's Pay. */
async function personWithPlus(interval) {
  const person = await newPerson();
  const checkout = await person.client.post("/api/billing?action=checkout", { interval: interval || "month" });
  assert.equal(checkout.status, 200);
  const paid = await fetch(checkout.json.url + "/pay", { redirect: "manual" });
  assert.equal(paid.status, 303);
  return person;
}

test("a new account is on the free plan, with this month's use and the free limits", async function () {
  const person = await newPerson();
  const status = await person.client.get("/api/billing?action=status");
  assert.equal(status.status, 200);
  assert.deepEqual(status.json, { billing: true, plan: "free", limits: PLANS.free.limits,
    usage: { photo: 0, advice: 0, columns: 0 }, subscription: null });
  assert.equal(site.stripe.requests.length, 0, "no Stripe customer yet, so Stripe isn't asked");
  assert.equal((await httpClient(site).get("/api/billing?action=status")).status, 401);
});

test("checkout makes one Stripe customer for the account and sends them to Stripe's page", async function () {
  const person = await newPerson();
  assert.equal((await person.client.post("/api/billing?action=checkout", { interval: "week" })).status, 400);
  assert.equal((await person.client.post("/api/billing?action=checkout", { interval: "month" },
    { origin: "https://another.example" })).status, 403);
  assert.equal((await httpClient(site).post("/api/billing?action=checkout", { interval: "month" })).status, 401);

  const first = await person.client.post("/api/billing?action=checkout", { interval: "year" });
  assert.equal(first.status, 200);
  assert.ok(first.json.url.startsWith(site.stripe.url + "/checkout/"));
  const customerId = site.supabase.billingCustomers.get(person.id);
  assert.deepEqual(site.stripe.customers.get(customerId).metadata, { user_id: person.id });
  assert.equal(site.stripe.customers.get(customerId).email, person.email);

  const sent = site.stripe.requestsTo("POST", "/v1/checkout/sessions").at(-1).fields;
  assert.equal(sent.mode, "subscription");
  assert.equal(sent.customer, customerId);
  assert.equal(sent.client_reference_id, person.id);
  assert.equal(sent["line_items[0][price]"], "price_plus_year");
  assert.equal(sent["subscription_data[metadata][user_id]"], person.id);
  assert.equal(sent.success_url, site.url + "/login?plan=welcome");
  assert.equal(sent.cancel_url, site.url + "/login?plan=not-now");
  assert.equal(sent["automatic_tax[enabled]"], undefined, "sales tax only once switched on");

  // Changing their mind and coming back: the same customer, not a second one.
  await person.client.post("/api/billing?action=checkout", { interval: "month" });
  assert.equal(site.supabase.billingCustomers.get(person.id), customerId);
  assert.equal(site.stripe.requestsTo("POST", "/v1/customers").length, 1);
});

test("once paid, the plan is Plus, with its limits, and a second checkout is refused", async function () {
  const person = await personWithPlus("year");
  const status = (await person.client.get("/api/billing?action=status")).json;
  assert.equal(status.plan, "plus");
  assert.deepEqual(status.limits, PLANS.plus.limits);
  assert.equal(status.subscription.status, "active");
  assert.equal(status.subscription.interval, "year");
  assert.equal(status.subscription.cancelAtPeriodEnd, false);
  assert.match(status.subscription.periodEnd, /^\d{4}-\d{2}-\d{2}$/);

  for (let use = 1; use <= PLANS.free.limits.advice + 1; use++) {
    assert.equal((await person.client.post("/api/briefing", ADVICE_REQUEST)).status, 200, "use " + use);
  }
  const again = await person.client.post("/api/billing?action=checkout", { interval: "month" });
  assert.equal(again.status, 409);
});

test("Plus ends when Stripe says so: cancelled, failed for good, or another product", async function () {
  const person = await personWithPlus();
  const subscription = site.stripe.subscriptions.at(-1);

  subscription.status = "past_due";   // Stripe is still retrying the payment
  const retrying = (await person.client.get("/api/billing?action=status")).json;
  assert.equal(retrying.plan, "plus");
  assert.equal(retrying.subscription.status, "past_due");

  subscription.status = "active";
  subscription.cancel_at_period_end = true;
  assert.equal((await person.client.get("/api/billing?action=status")).json.subscription.cancelAtPeriodEnd, true);

  subscription.status = "unpaid";
  assert.equal((await person.client.get("/api/billing?action=status")).json.plan, "free");

  subscription.status = "active";
  subscription.items.data[0].price.id = "price_something_else";
  assert.equal((await person.client.get("/api/billing?action=status")).json.plan, "free");
});

test("pointing your own row at someone else's Stripe customer gets you nothing of theirs", async function () {
  const payer = await personWithPlus();
  const payersCustomer = site.supabase.billingCustomers.get(payer.id);
  const intruder = await newPerson();
  site.supabase.billingCustomers.set(intruder.id, payersCustomer);

  assert.equal((await intruder.client.get("/api/billing?action=status")).json.plan, "free");
  assert.equal((await intruder.client.post("/api/billing?action=portal", {})).status, 404);
  const cancel = await intruder.client.post("/api/billing?action=cancel", {});
  assert.deepEqual(cancel.json, { cancelled: false });
  assert.equal(site.stripe.customers.get(payersCustomer).deleted, undefined, "the payer's customer is untouched");
  assert.equal((await payer.client.get("/api/billing?action=status")).json.plan, "plus");

  // A checkout now makes the intruder a customer of their own.
  await intruder.client.post("/api/billing?action=checkout", { interval: "month" });
  assert.notEqual(site.supabase.billingCustomers.get(intruder.id), payersCustomer);
});

test("Manage billing opens Stripe's billing page for your own customer only", async function () {
  const person = await personWithPlus();
  const portal = await person.client.post("/api/billing?action=portal", {});
  assert.equal(portal.status, 200);
  assert.equal(portal.json.url, site.stripe.url + "/portal/" + site.supabase.billingCustomers.get(person.id));
  assert.equal(site.stripe.requestsTo("POST", "/v1/billing_portal/sessions").at(-1).fields.return_url,
    site.url + "/login");
  assert.equal((await (await newPerson()).client.post("/api/billing?action=portal", {})).status, 404);
  assert.equal((await person.client.get("/api/billing?action=portal")).status, 405);
});

test("deleting an account ends Plus at once and removes the customer from Stripe", async function () {
  const person = await personWithPlus();
  const customerId = site.supabase.billingCustomers.get(person.id);
  assert.equal((await person.client.post("/api/billing?action=cancel", {}, { origin: "https://another.example" }))
    .status, 403);

  const cancel = await person.client.post("/api/billing?action=cancel", {});
  assert.deepEqual(cancel.json, { cancelled: true });
  assert.equal(site.stripe.customers.get(customerId).deleted, true);
  assert.equal(site.stripe.subscriptions.at(-1).status, "canceled");
  assert.equal(site.supabase.billingCustomers.has(person.id), false);
  assert.equal((await person.client.get("/api/billing?action=status")).json.plan, "free");
  assert.deepEqual((await person.client.post("/api/billing?action=cancel", {})).json, { cancelled: false });
});

test("if Stripe is down, paid features carry on at the free limits, and checkout says so", async function () {
  const person = await personWithPlus();
  site.stripe.options.isDown = true;
  try {
    assert.equal((await person.client.get("/api/billing?action=status")).json.plan, "free");
    assert.equal((await person.client.post("/api/briefing", ADVICE_REQUEST)).status, 200);
    const checkout = await (await newPerson()).client.post("/api/billing?action=checkout", { interval: "month" });
    assert.equal(checkout.status, 502);
    assert.match(checkout.json.error, /Stripe couldn't be reached/);
    const cancel = await person.client.post("/api/billing?action=cancel", {});
    assert.equal(cancel.status, 502, "an account isn't deleted while it might still be charged");
  } finally {
    site.stripe.options.isDown = false;
  }
  assert.ok(site.serverLogs.some(function (line) {
    return line.startsWith("[findash-error] billing status:");
  }));
  assert.equal((await person.client.get("/api/billing?action=status")).json.plan, "plus");
});

test("each answer from Claude adds its tokens to the person's counts", async function () {
  const person = await newPerson();
  assert.equal((await person.client.post("/api/read-document", PHOTO_REQUEST)).status, 200);
  // The stand-in's misread first look gets a second look from the page, not
  // from the server, so this is one request: 1 input and 1 output token.
  assert.deepEqual(site.supabase.tokensToday(person.email, "photo"), { input: 1, output: 1 });
  assert.equal(site.supabase.usesToday(person.email, "photo"), 1);
});

test("without Stripe settings there is no Plus: everyone is free, and nothing is sold", async function () {
  const saved = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const person = await newPerson();
    assert.equal((await httpClient(site).get("/api/capabilities")).json.billing, false);
    const status = (await person.client.get("/api/billing?action=status")).json;
    assert.equal(status.billing, false);
    assert.equal(status.plan, "free");
    assert.equal((await person.client.post("/api/billing?action=checkout", { interval: "month" })).status, 503);
    assert.deepEqual((await person.client.post("/api/billing?action=cancel", {})).json, { cancelled: false });
    for (let use = 1; use <= PLANS.free.limits.advice; use++) {
      await person.client.post("/api/briefing", ADVICE_REQUEST);
    }
    const refused = await person.client.post("/api/briefing", ADVICE_REQUEST);
    assert.equal(refused.json.error, "You've used this month's 2 requests for advice. They start again on the 1st.");
    assert.equal(refused.json.upgrade, undefined);
  } finally {
    process.env.STRIPE_SECRET_KEY = saved;
  }
});

test("the pricing page and the structured data advertise exactly the plans that are enforced", function () {
  const pricing = readFileSync(new URL("../../docs/pricing.html", import.meta.url), "utf8");
  const cells = [...pricing.matchAll(/<td data-limit="(\w+)\.(\w+)">(\d+)<\/td>/g)];
  assert.equal(cells.length, 6);
  for (const [, plan, feature, shown] of cells) {
    assert.equal(Number(shown), PLANS[plan].limits[feature], plan + "." + feature);
  }
  assert.match(pricing, new RegExp(`data-price="monthly">\\$${PLANS.plus.monthlyPrice}<`));
  assert.match(pricing, new RegExp(`data-price="yearly">\\$${PLANS.plus.yearlyPrice}<`));
  assert.match(pricing, new RegExp(`\\$${PLANS.plus.monthlyPrice} a month, or \\$${PLANS.plus.yearlyPrice} a year`));

  const home = readFileSync(new URL("../../docs/index.html", import.meta.url), "utf8");
  const data = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(home)[1]);
  const app = data["@graph"].find(function (item) {
    return item["@type"] === "WebApplication";
  });
  assert.deepEqual(app.offers.map(function (offer) {
    return offer.price;
  }), ["0", String(PLANS.plus.monthlyPrice), String(PLANS.plus.yearlyPrice)]);
});
