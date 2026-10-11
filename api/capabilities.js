/**
 * GET /api/capabilities
 *
 * Says which optional features are actually set up on this site, so the
 * page can offer only what exists instead of showing a button that fails.
 *
 * Returns true or false for each, never the addresses or keys behind them.
 * Knowing that a forecast service is set up tells an attacker nothing
 * useful; knowing where it lives would.
 */

import { accountsAreSetUp } from "../lib/supabase.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET only" });
  }

  // A minute of caching is plenty: the answer only changes when the site's
  // settings change, which means a redeploy anyway.
  res.setHeader("Cache-Control", "public, max-age=60");

  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY);
  return res.status(200).json({
    briefing: hasClaude,
    mapping: hasClaude,
    photos: hasClaude,
    accounts: accountsAreSetUp(),
    forecast: Boolean(process.env.FORECAST_URL)
  });
}
