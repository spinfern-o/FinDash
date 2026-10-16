/* Who may use the features that call Claude, and how often.

   Reading a photo, writing advice and matching column names each cost
   money per use, paid from this site's Anthropic account. So each needs a
   logged-in person, and each person has a monthly allowance per feature
   that depends on their plan (docs/js/plans.js: Free, or Plus through
   Stripe, lib/billing.js), counted in Supabase
   (supabase/migrations/20261016000000_plans_and_billing.sql).

   Without that, anyone who found these addresses could run up the bill. The
   spending limit set in the Anthropic console stays the final backstop. */

import { accountsAreSetUp, supabaseClient } from "./supabase.js";
import { currentSession, isSameSite } from "./session.js";
import { billingIsSetUp, billingStatus } from "./billing.js";
import { PLANS, FEATURE_NAMES } from "../docs/js/plans.js";

/* claim_ai_use_this_month does not exist yet: the site's owner has not run
   the SQL. */
function isMissingFunction(error) {
  return error.code === "PGRST202" || error.code === "42883";
}

/* What someone who has used up this month's allowance is told, and on the
   free plan, what Plus would give them. */
function limitReachedMessage(feature, plan) {
  const limit = PLANS[plan].limits[feature];
  let message = `You've used this month's ${limit} ${FEATURE_NAMES[feature]}.`;
  const plusGivesMore = PLANS.plus.limits[feature] > limit;
  if (plan === "free" && billingIsSetUp() && plusGivesMore) {
    message += ` FinDash Plus includes ${PLANS.plus.limits[feature]} a month: see the Pricing page.`;
  } else {
    message += " They start again on the 1st.";
  }
  if (feature === "columns") {
    message += " Meanwhile, files that use the template's column names always work.";
  }
  return message;
}

/* Adds the tokens one answer from Claude used to this person's counts for
   today, so the real cost of each feature can be worked out (the query is
   in the migration). Never fails the request it belongs to. */
async function countTokens(client, feature, usage) {
  if (!usage) {
    return;
  }
  const input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) +
    (usage.cache_read_input_tokens || 0);
  const { error } = await client.rpc("add_ai_tokens", {
    feature_name: feature,
    input_count: input,
    output_count: usage.output_tokens || 0
  });
  if (error) {
    console.error("[findash-error] token count:", error.code || "", error.message);
  }
}

/* Checks that this request may use `feature` ("photo", "advice" or
   "columns") and counts the use. Returns null when it may not, having
   already answered the request with the reason. Otherwise returns
   { plan, countTokens(usage) }: call countTokens with Claude's usage once
   it has answered. */
export async function allowAiUse(req, res, feature) {
  if (!accountsAreSetUp()) {
    res.status(503).json({ error: "This needs accounts, which aren't set up on this site yet." });
    return null;
  }
  if (!isSameSite(req)) {
    res.status(403).json({ error: "request from another site" });
    return null;
  }

  const session = await currentSession(req, res);
  if (!session) {
    res.status(401).json({ error: "Log in to use this. Accounts are free.", needsLogin: true });
    return null;
  }

  const plan = (await billingStatus(session)).plan;
  const client = supabaseClient(session.accessToken);
  const { data, error } = await client.rpc("claim_ai_use_this_month", {
    feature_name: feature,
    monthly_limit: PLANS[plan].limits[feature]
  });
  if (error) {
    console.error("[findash-error] ai usage check:", error.code || "", error.message);
    if (isMissingFunction(error)) {
      res.status(503).json({ error: "Usage limits aren't set up on this site yet." });
    } else {
      res.status(502).json({ error: "This couldn't be checked right now. Try again in a moment." });
    }
    return null;
  }

  if (data !== true) {
    const refusal = { error: limitReachedMessage(feature, plan), plan: plan };
    if (plan === "free" && billingIsSetUp()) {
      refusal.upgrade = "/pricing";
    }
    res.status(429).json(refusal);
    return null;
  }
  return {
    plan: plan,
    countTokens: function (usage) {
      return countTokens(client, feature, usage);
    }
  };
}
