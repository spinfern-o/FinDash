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
      // Pass a 503 through rather than flattening it to 502. The service
      // answers 503 when it is up but the model is not loadable (no torch, no
      // weights) - that is "unavailable, keep the local trend", not "broken".
      // The upstream detail can name a file path, so it is logged, not echoed.
      if (upstream.status === 503) {
        return res.status(503).json({ error: "forecast model not available" });
      }
      return res.status(502).json({ error: "forecast service returned " + upstream.status });
    }

    const data = await upstream.json();

    // BE-050: filtering non-finite values silently shortened the arrays, so a
    // partly-bad response became a plausible shorter forecast. Require exactly
    // the horizon asked for, all finite, and the quantiles in order - a band
    // where low > high is not a wide forecast, it is a broken one.
    const band = v =>
      Array.isArray(v) && v.length === h && v.every(x => Number.isFinite(Number(x)))
        ? v.map(Number)
        : null;

    const low = band(data.low), predicted = band(data.predicted), high = band(data.high);
    if (!low || !predicted || !high) {
      return res.status(502).json({ error: "forecast service returned an incomplete band" });
    }
    for (let i = 0; i < h; i++) {
      if (!(low[i] <= predicted[i] && predicted[i] <= high[i])) {
        return res.status(502).json({ error: "forecast quantiles are out of order" });
      }
    }

    return res.status(200).json({
      model: String(data.model ?? "chronos"),
      horizon: h,
      low, predicted, high,
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
