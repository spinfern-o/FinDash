/* FinDash Plus, billed through Stripe.

   Stripe is the only record of who has paid. Whenever the server needs
   someone's plan (before every request to Claude, and for the account box)
   it asks Stripe about that person's Stripe customer, and only believes the
   answer when Stripe's own record of the customer names the same FinDash
   account. So:
     - there is no webhook to receive and nothing to keep in step: a
       cancellation or a failed payment counts the moment Stripe knows it;
     - this site still never needs Supabase's admin key: which customer is
       whose is kept in the person's own row (billing_customers), and a row
       pointing at someone else's customer gets nothing, not even their
       billing page.
   If Stripe can't be reached, the person gets the free plan's limits for
   that request rather than an error.

   Card details never come near this site: people pay on Stripe's checkout
   page, and change their card or cancel on Stripe's billing page. */

import Stripe from "stripe";
import { supabaseClient } from "./supabase.js";

/* The two Stripe prices for Plus: their IDs, from the Stripe dashboard.
   Read from the settings each time, like the key, so a change of settings
   needs no restart. */
function prices() {
  return { month: process.env.STRIPE_PRICE_MONTHLY, year: process.env.STRIPE_PRICE_YEARLY };
}

// Subscriptions that count as paid. past_due: the last payment failed and
// Stripe is still retrying it (Stripe dashboard -> Billing -> Revenue
// recovery); Plus carries on meanwhile, and ends if the retries do.
const PAID_STATUSES = ["active", "trialing", "past_due"];

export function billingIsSetUp() {
  const plusPrices = prices();
  return Boolean(process.env.STRIPE_SECRET_KEY && plusPrices.month && plusPrices.year);
}

/* A Stripe client for one request. STRIPE_API_URL is only ever set by the
   tests, to send it to their stand-in for Stripe. */
function stripeClient() {
  const options = { maxNetworkRetries: 1, timeout: 10000 };
  if (process.env.STRIPE_API_URL) {
    const address = new URL(process.env.STRIPE_API_URL);
    options.host = address.hostname;
    options.port = address.port;
    options.protocol = address.protocol.replace(":", "");
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, options);
}

function logStripeError(where, error) {
  console.error("[findash-error] billing " + where + ":", error.type || error.code || "", error.message);
}

/* The Stripe customer ID kept in this person's own row, or null. */
async function storedCustomerId(session) {
  const { data, error } = await supabaseClient(session.accessToken)
    .from("billing_customers")
    .select("stripe_customer_id")
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  return data.stripe_customer_id;
}

async function saveCustomerId(session, customerId) {
  const { error } = await supabaseClient(session.accessToken)
    .from("billing_customers")
    .upsert({ user_id: session.user.id, stripe_customer_id: customerId });
  if (error) {
    throw error;
  }
}

async function forgetCustomerId(session) {
  const { error } = await supabaseClient(session.accessToken)
    .from("billing_customers")
    .delete()
    .eq("user_id", session.user.id);
  if (error) {
    throw error;
  }
}

/* This person's Stripe customer ID, but only when Stripe's own record of
   that customer was made for this account (its metadata names the account,
   set by this server when the customer was created). Null otherwise. */
async function verifiedCustomerId(stripe, session) {
  const customerId = await storedCustomerId(session);
  if (!customerId) {
    return null;
  }
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || !customer.metadata || customer.metadata.user_id !== session.user.id) {
    return null;
  }
  return customer.id;
}

/* Whether a subscription is a paid one for FinDash Plus. */
function isPaidPlus(subscription) {
  if (!PAID_STATUSES.includes(subscription.status)) {
    return false;
  }
  const plusPrices = prices();
  return subscription.items.data.some(function (item) {
    return item.price.id === plusPrices.month || item.price.id === plusPrices.year;
  });
}

/* What the account box shows about a subscription. Since Stripe's
   2025 API versions, the billing period belongs to each item. */
function describeSubscription(subscription) {
  const item = subscription.items.data[0];
  let interval = "month";
  if (item.price.id === prices().year) {
    interval = "year";
  }
  let periodEnd = null;
  if (item.current_period_end) {
    periodEnd = new Date(item.current_period_end * 1000).toISOString().slice(0, 10);
  }
  return {
    status: subscription.status,
    interval: interval,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    periodEnd: periodEnd
  };
}

/* This person's plan: { plan: "free" | "plus", subscription }, where
   subscription describes the paid one, or is null. Never throws: when
   Stripe or the database can't answer, the answer is the free plan. */
export async function billingStatus(session) {
  const free = { plan: "free", subscription: null };
  if (!billingIsSetUp()) {
    return free;
  }
  const stripe = stripeClient();
  try {
    const customerId = await verifiedCustomerId(stripe, session);
    if (!customerId) {
      return free;
    }
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
    const paid = subscriptions.data.find(isPaidPlus);
    if (!paid) {
      return free;
    }
    return { plan: "plus", subscription: describeSubscription(paid) };
  } catch (error) {
    logStripeError("status", error);
    return free;
  }
}

/* Starts paying for Plus: the address of Stripe's checkout page for it.
   interval is "month" or "year"; origin is this site's address, for
   coming back. The Stripe customer is made on the first visit and kept. */
export async function checkoutAddress(session, interval, origin) {
  const stripe = stripeClient();
  let customerId = await verifiedCustomerId(stripe, session);
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      metadata: { user_id: session.user.id }
    });
    customerId = customer.id;
    await saveCustomerId(session, customerId);
  }

  const settings = {
    mode: "subscription",
    customer: customerId,
    client_reference_id: session.user.id,
    line_items: [{ price: prices()[interval], quantity: 1 }],
    subscription_data: { metadata: { user_id: session.user.id } },
    allow_promotion_codes: true,
    success_url: origin + "/login?plan=welcome",
    cancel_url: origin + "/login?plan=not-now"
  };
  // Sales tax worked out by Stripe Tax, once it is set up in the Stripe
  // dashboard (README.md, "Paid plans"). It needs the customer's address,
  // which the checkout page then asks for.
  if (process.env.STRIPE_AUTOMATIC_TAX === "on") {
    settings.automatic_tax = { enabled: true };
    settings.customer_update = { address: "auto" };
  }
  const checkout = await stripe.checkout.sessions.create(settings);
  return checkout.url;
}

/* The address of Stripe's billing page for this person (change card, see
   invoices, cancel), or null when they have never paid. */
export async function billingPageAddress(session, origin) {
  const stripe = stripeClient();
  const customerId = await verifiedCustomerId(stripe, session);
  if (!customerId) {
    return null;
  }
  const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: origin + "/login" });
  return portal.url;
}

/* For deleting the account: removes the customer from Stripe, which ends
   any subscription at once (no more charges) and drops the saved card.
   Stripe keeps its record of past payments, as the law requires. Returns
   true when there was a customer to remove. */
export async function removeCustomer(session) {
  const stripe = stripeClient();
  const customerId = await verifiedCustomerId(stripe, session);
  if (customerId) {
    await stripe.customers.del(customerId);
  }
  await forgetCustomerId(session);
  return Boolean(customerId);
}
