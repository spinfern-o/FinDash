/* The plan box on the login page, for someone logged in: which plan they
   are on, how much of this month's allowance they have used, and the way
   to Plus (or to manage it).

   Paying happens on Stripe's own pages: the buttons here only ask this
   site's server (/api/billing) for the address of Stripe's checkout or
   billing page and go there. Card details never touch FinDash. */

import { PLANS, FEATURE_NAMES } from "./plans.js";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];

function box() {
  return document.getElementById("plan-box");
}

/* "2026-11-16" -> "16 November 2026". */
function longDate(isoDate) {
  const parts = isoDate.split("-").map(Number);
  return `${parts[2]} ${MONTH_NAMES[parts[1] - 1]} ${parts[0]}`;
}

/* "3 of 10 photo reads · 0 of 2 requests for advice". Column matching is
   left out: its allowance is the same on every plan and rarely reached. */
function usageText(status) {
  const parts = [];
  for (const feature of ["photo", "advice"]) {
    parts.push(`${status.usage[feature]} of ${status.limits[feature]} ${FEATURE_NAMES[feature]}`);
  }
  return parts.join(" · ");
}

/* What is said about a Plus subscription: when it renews or ends, or that
   a payment failed. */
function subscriptionText(subscription) {
  let billed = "billed monthly";
  if (subscription.interval === "year") {
    billed = "billed yearly";
  }
  if (subscription.status === "past_due") {
    return `${billed}. <b>The last payment didn't go through:</b> update your card with Manage billing.`;
  }
  if (!subscription.periodEnd) {
    return billed + ".";
  }
  if (subscription.cancelAtPeriodEnd) {
    return `cancelled: Plus carries on until ${longDate(subscription.periodEnd)}, then you're back on Free.`;
  }
  return `${billed}, renews ${longDate(subscription.periodEnd)}.`;
}

function freePlanHtml(status) {
  let offer = "";
  if (status.billing) {
    const plus = PLANS.plus;
    offer = `<div class="plan-actions">
        <button type="button" class="submit" data-checkout="month">Get Plus: $${plus.monthlyPrice} a month</button>
        <button type="button" class="ghost" data-checkout="year">or $${plus.yearlyPrice} a year</button>
      </div>
      <p class="plan-note">Plus gives you ${plus.limits.photo} ${FEATURE_NAMES.photo} and ${plus.limits.advice}
        ${FEATURE_NAMES.advice} a month. You pay on Stripe's secure page and can cancel any time.
        <a href="/pricing">Compare plans</a></p>`;
  }
  return `<p class="plan-name">Your plan: <b>Free</b></p>
    <p class="plan-usage">This month: ${usageText(status)}</p>
    ${offer}`;
}

function plusPlanHtml(status) {
  let about = "";
  if (status.subscription) {
    about = " &middot; " + subscriptionText(status.subscription);
  }
  return `<p class="plan-name">Your plan: <b>Plus</b>${about}</p>
    <p class="plan-usage">This month: ${usageText(status)}</p>
    <div class="plan-actions">
      <button type="button" class="ghost" data-portal>Manage billing</button>
    </div>
    <p class="plan-note">Change your card, see invoices or cancel, on Stripe's billing page.</p>`;
}

function showProblem(text) {
  const problem = box().querySelector(".plan-problem");
  problem.textContent = text;
  problem.hidden = !text;
}

/* Asks the server for a Stripe page's address and goes there. */
async function goToStripe(action, body, button) {
  showProblem("");
  button.disabled = true;
  let answer = {};
  let ok = false;
  try {
    const response = await fetch("/api/billing?action=" + action, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    answer = await response.json();
    ok = response.ok;
  } catch {
    answer = { error: "Couldn't reach FinDash. Check your connection and try again." };
  }
  if (ok && answer.url) {
    location.href = answer.url;
    return;
  }
  button.disabled = false;
  showProblem(answer.error || "That didn't work. Try again in a moment.");
}

function handleClick(event) {
  const checkout = event.target.closest("[data-checkout]");
  if (checkout) {
    goToStripe("checkout", { interval: checkout.dataset.checkout }, checkout);
    return;
  }
  const portal = event.target.closest("[data-portal]");
  if (portal) {
    goToStripe("portal", {}, portal);
  }
}

let isWired = false;

/* Fills the plan box for whoever is logged in. Stays hidden when accounts
   or plans aren't set up here, or the server can't be reached. Returns the
   plan ("free" or "plus"), or null when it couldn't tell. */
export async function showPlanBox() {
  const element = box();
  if (!isWired) {
    element.addEventListener("click", handleClick);
    isWired = true;
  }
  let status;
  try {
    const response = await fetch("/api/billing?action=status", { credentials: "same-origin" });
    if (!response.ok) {
      element.hidden = true;
      return null;
    }
    status = await response.json();
  } catch {
    element.hidden = true;
    return null;
  }

  let html = freePlanHtml(status);
  if (status.plan === "plus") {
    html = plusPlanHtml(status);
  }
  element.innerHTML = html + `<p class="plan-problem" role="alert" hidden></p>`;
  element.hidden = false;
  return status.plan;
}

/* For deleting the account: ends Plus at once, so nothing more is charged.
   Returns { ok, cancelled }: ok is false when Stripe couldn't be reached,
   and then nothing else should be deleted either. */
export async function endPlusForDeletion() {
  try {
    const response = await fetch("/api/billing?action=cancel", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    // 404: no billing function on this copy of FinDash; 503: no accounts.
    if (response.status === 404 || response.status === 503) {
      return { ok: true, cancelled: false };
    }
    if (!response.ok) {
      return { ok: false, cancelled: false };
    }
    const answer = await response.json();
    return { ok: true, cancelled: Boolean(answer.cancelled) };
  } catch {
    return { ok: false, cancelled: false };
  }
}
