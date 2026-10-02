/**
 * GET /api/capabilities
 *
 * Says which optional, model-backed features are actually configured, so the
 * page can offer only what exists instead of showing a button that fails.
 *
 * Returns booleans only. Never the URLs, never the tokens - knowing that a
 * forecast service is configured tells an attacker nothing useful; knowing
 * where it lives would.
 */

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET only" });
  }

  // A minute of caching is plenty: this changes only when env vars change,
  // which means a redeploy anyway.
  res.setHeader("Cache-Control", "public, max-age=60");

  return res.status(200).json({
    briefing: Boolean(process.env.ANTHROPIC_API_KEY),
    mapping: Boolean(process.env.ANTHROPIC_API_KEY),
    photos: Boolean(process.env.ANTHROPIC_API_KEY),
    forecast: Boolean(process.env.FORECAST_URL),
  });
}
