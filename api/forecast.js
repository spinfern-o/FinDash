/**
 * POST /api/forecast
 *
 * Proxies to the Chronos-Bolt service in forecast/. Kept behind our own origin
 * so the service URL and its token never reach the browser.
 *
 * Like /api/briefing this receives figures rather than header text, so the page
 * only calls it when the reader presses the button. It takes a bare series of
 * numbers - no month names, no line items, no budget. A list of twelve numbers
 * says nothing about whose business it is.
 *
 * Request:  { "series": [7580, 5420, -3640, ...], "horizon": 3 }
 * Response: { "model": "...", "low": [...], "predicted": [...], "high": [...] }
 *
 * Returns 503 with a clear reason when FORECAST_URL is unset, so the page can
 * fall back to its own trend line rather than showing an error.
 */

const MAX_POINTS = 240;
const MAX_HORIZON = 12;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const base = process.env.FORECAST_URL;
  if (!base) {
    return res.status(503).json({
      error: "no forecast service configured",
      hint: "set FORECAST_URL to a deployment of forecast/main.py",
    });
  }

  const { series, horizon = 3 } = req.body ?? {};

  if (!Array.isArray(series) || !series.length || series.length > MAX_POINTS) {
    return res.status(400).json({ error: `series must be 1-${MAX_POINTS} numbers` });
  }
  if (!series.every(v => typeof v === "number" && Number.isFinite(v))) {
    return res.status(400).json({ error: "series must be finite numbers" });
  }
  const h = Number(horizon);
  if (!Number.isInteger(h) || h < 1 || h > MAX_HORIZON) {
    return res.status(400).json({ error: `horizon must be 1-${MAX_HORIZON}` });
  }

  try {
    // The model is small but CPU inference on a cold container is not instant.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 50_000);

    const upstream = await fetch(base.replace(/\/$/, "") + "/forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        series: series.map(Number),
        horizon: h,
        token: process.env.FORECAST_TOKEN ?? "",
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!upstream.ok) {
      console.error("forecast upstream:", upstream.status);
      return res.status(502).json({ error: "forecast service returned " + upstream.status });
    }

    const data = await upstream.json();
    const nums = v => (Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : []);

    return res.status(200).json({
      model: String(data.model ?? "chronos"),
      low: nums(data.low),
      predicted: nums(data.predicted),
      high: nums(data.high),
    });
  } catch (err) {
    // Never echo the upstream error - it can carry the service URL.
    console.error("forecast failed:", err);
    const aborted = err?.name === "AbortError";
    return res.status(502).json({
      error: aborted ? "forecast timed out" : "forecast unavailable",
    });
  }
}
