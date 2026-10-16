/**
 * /api/billing
 *
 * FinDash Plus, through Stripe (lib/billing.js has how and why). Every
 * request needs someone logged in; the POSTs must come from this site.
 *
 *   GET  ?action=status    -> { billing, plan, limits, usage, subscription }
 *                             billing: whether Plus can be bought here
 *                             usage: this month's uses of each feature
 *   POST ?action=checkout  { interval: "month" | "year" } -> { url }
 *                             Stripe's checkout page for Plus
 *   POST ?action=portal    -> { url }
 *                             Stripe's billing page: card, invoices, cancel
 *   POST ?action=cancel    -> { cancelled }
 *                             for deleting the account: ends Plus at once
 *                             and removes the customer from Stripe
 *
 * Nothing about anyone's figures is ever sent to Stripe.
 */

import { accountsAreSetUp, supabaseClient } from "../lib/supabase.js";
import { currentSession, isSameSite } from "../lib/session.js";
import { billingIsSetUp, billingStatus, checkoutAddress, billingPageAddress, removeCustomer } from "../lib/billing.js";
import { PLANS } from "../docs/js/plans.js";

const INTERVALS = ["month", "year"];

/* "2026-10-01": the first day of this month, in UTC like the counts. */
function firstDayOfThisMonth() {
  return new Date().toISOString().slice(0, 8) + "01";
}

/* This month's uses of each feature: { photo, advice, columns }. Zero for
   all when they can't be read. */
async function usageThisMonth(session) {
  const usage = { photo: 0, advice: 0, columns: 0 };
  const { data, error } = await supabaseClient(session.accessToken)
    .from("ai_usage")
    .select("feature, uses")
    .gte("day", firstDayOfThisMonth());
  if (error) {
    console.error("[findash-error] billing usage:", error.code || "", error.message);
    return usage;
  }
  for (const row of data) {
    if (Object.prototype.hasOwnProperty.call(usage, row.feature)) {
      usage[row.feature] += row.uses;
    }
  }
  return usage;
}

/* This site's own address, for Stripe to send people back to. The Origin
   header has already been checked to be this site (isSameSite); without
   one, the address the request came to. */
function siteOrigin(req) {
  if (req.headers.origin) {
    return req.headers.origin;
  }
  return "https://" + req.headers.host;
}

async function sendStatus(res, session) {
  const status = await billingStatus(session);
  return res.status(200).json({
    billing: billingIsSetUp(),
    plan: status.plan,
    limits: PLANS[status.plan].limits,
    usage: await usageThisMonth(session),
    subscription: status.subscription
  });
}

async function sendCheckout(req, res, session) {
  const interval = req.body && req.body.interval;
  if (!INTERVALS.includes(interval)) {
    return res.status(400).json({ error: 'interval is "month" or "year"' });
  }
  const status = await billingStatus(session);
  if (status.plan === "plus") {
    return res.status(409).json({ error: "You already have Plus. Use Manage billing to change it." });
  }
  const url = await checkoutAddress(session, interval, siteOrigin(req));
  return res.status(200).json({ url: url });
}

async function sendBillingPage(req, res, session) {
  const url = await billingPageAddress(session, siteOrigin(req));
  if (!url) {
    return res.status(404).json({ error: "There's no billing to manage: this account has never had Plus." });
  }
  return res.status(200).json({ url: url });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!accountsAreSetUp()) {
    return res.status(503).json({ error: "accounts aren't set up on this site yet" });
  }

  const action = req.query.action;
  const isStatus = action === "status" && req.method === "GET";
  const isChange = ["checkout", "portal", "cancel"].includes(action) && req.method === "POST";
  if (!isStatus && !isChange) {
    return res.status(405).json({ error: "GET ?action=status, or POST ?action=checkout, portal or cancel" });
  }
  if (isChange && !isSameSite(req)) {
    return res.status(403).json({ error: "request from another site" });
  }

  const session = await currentSession(req, res);
  if (!session) {
    return res.status(401).json({ error: "Log in first.", needsLogin: true });
  }

  if (isStatus) {
    return sendStatus(res, session);
  }
  if (!billingIsSetUp()) {
    if (action === "cancel") {
      return res.status(200).json({ cancelled: false });
    }
    return res.status(503).json({ error: "Plus isn't on sale on this site yet." });
  }

  try {
    if (action === "checkout") {
      return await sendCheckout(req, res, session);
    }
    if (action === "portal") {
      return await sendBillingPage(req, res, session);
    }
    return res.status(200).json({ cancelled: await removeCustomer(session) });
  } catch (error) {
    console.error("[findash-error] billing " + action + ":", error.type || error.code || "", error.message);
    return res.status(502).json({ error: "Stripe couldn't be reached just now. Try again in a moment." });
  }
}
