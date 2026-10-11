/* Who may use the features that call Claude, and how often.

   Reading a photo, writing advice and matching column names each cost
   money per use, paid from this site's Anthropic account. So each needs a
   logged-in person, and each person has a daily allowance per feature,
   counted in Supabase (supabase/migrations/20261012000000_ai_usage_limits.sql).

   Without that, anyone who found these addresses could run up the bill. The
   spending limit set in the Anthropic console stays the final backstop. */

import { accountsAreSetUp, supabaseClient } from "./supabase.js";
import { currentSession, isSameSite } from "./session.js";

/* Requests per person per day (days run midnight to midnight UTC). A photo
   is one request, or two when its first reading fails its own checks. */
export const DAILY_LIMITS = {
  photo: 40,
  advice: 10,
  columns: 60
};

const LIMIT_REACHED_MESSAGES = {
  photo: "You've reached today's limit for reading photos. You can add more tomorrow.",
  advice: "You've reached today's limit for advice. You can ask again tomorrow.",
  columns: "You've reached today's limit for matching column names. Try again tomorrow, or use the template's column names."
};

/* claim_ai_use does not exist yet: the site's owner has not run the SQL. */
function isMissingFunction(error) {
  return error.code === "PGRST202" || error.code === "42883";
}

/* Checks that this request may use `feature` ("photo", "advice" or
   "columns") and counts the use. Returns true when it may go ahead.
   Otherwise it has already answered the request with the reason, and
   returns false. */
export async function allowAiUse(req, res, feature) {
  if (!accountsAreSetUp()) {
    res.status(503).json({ error: "This needs accounts, which aren't set up on this site yet." });
    return false;
  }
  if (!isSameSite(req)) {
    res.status(403).json({ error: "request from another site" });
    return false;
  }

  const session = await currentSession(req, res);
  if (!session) {
    res.status(401).json({ error: "Log in to use this. Accounts are free.", needsLogin: true });
    return false;
  }

  const { data, error } = await supabaseClient(session.accessToken).rpc("claim_ai_use", {
    feature_name: feature,
    daily_limit: DAILY_LIMITS[feature]
  });
  if (error) {
    console.error("[findash-error] ai usage check:", error.code || "", error.message);
    if (isMissingFunction(error)) {
      res.status(503).json({ error: "Usage limits aren't set up on this site yet." });
    } else {
      res.status(502).json({ error: "This couldn't be checked right now. Try again in a moment." });
    }
    return false;
  }

  if (data !== true) {
    res.status(429).json({ error: LIMIT_REACHED_MESSAGES[feature] });
    return false;
  }
  return true;
}
