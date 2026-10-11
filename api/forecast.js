/**
 * POST /api/forecast
 *
 * Passes a request on to the Chronos-Bolt service in forecast/. Kept behind
 * this site's own address so the service's address and token never reach
 * the browser.
 *
 * Like /api/briefing this receives figures rather than header text, so the
 * page only calls it when the reader presses the button. It takes a bare
 * list of numbers: no month names, no line items, no budget. Twelve numbers
 * say nothing about whose business it is.
 *
 * Request:  { "series": [7580, 5420, -3640, ...], "horizon": 3 }
 * Response: { "model": "...", "low": [...], "predicted": [...], "high": [...] }
 *
 * Answers 503 with a clear reason when FORECAST_URL is not set, so the page
 * can keep its own trend line rather than show an error.
 */

const MAXIMUM_POINTS = 240;
const MAXIMUM_HORIZON = 12;
const TIMEOUT_MILLISECONDS = 50_000;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/* One of the three lists in the service's answer, as numbers. Null unless it
   has exactly `horizon` entries and every one is a finite number.
   Dropping the bad entries instead once turned a partly broken answer into a
   plausible shorter forecast. */
function numberList(value, horizon) {
  if (!Array.isArray(value) || value.length !== horizon) {
    return null;
  }
  const numbers = value.map(Number);
  if (!numbers.every(Number.isFinite)) {
    return null;
  }
  return numbers;
}

/* A range where low is above high is not a wide forecast, it is a broken one. */
function isInOrder(low, predicted, high) {
  for (let step = 0; step < low.length; step++) {
    if (!(low[step] <= predicted[step] && predicted[step] <= high[step])) {
      return false;
    }
  }
  return true;
}

/* Asks the service, giving up after TIMEOUT_MILLISECONDS: the model is
   small, but running it on a container that has just started is not instant. */
async function askForecastService(baseUrl, series, horizon) {
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, TIMEOUT_MILLISECONDS);

  try {
    return await fetch(baseUrl.replace(/\/$/, "") + "/forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        series: series.map(Number),
        horizon: horizon,
        token: process.env.FORECAST_TOKEN ?? ""
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const serviceUrl = process.env.FORECAST_URL;
  if (!serviceUrl) {
    return res.status(503).json({
      error: "no forecast service configured",
      hint: "set FORECAST_URL to a deployment of forecast/main.py"
    });
  }

  const body = req.body ?? {};
  const series = body.series;
  if (!Array.isArray(series) || !series.length || series.length > MAXIMUM_POINTS) {
    return res.status(400).json({ error: `series must be 1-${MAXIMUM_POINTS} numbers` });
  }
  if (!series.every(isFiniteNumber)) {
    return res.status(400).json({ error: "series must be finite numbers" });
  }
  let horizon = 3;
  if (body.horizon !== undefined) {
    horizon = Number(body.horizon);
  }
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > MAXIMUM_HORIZON) {
    return res.status(400).json({ error: `horizon must be 1-${MAXIMUM_HORIZON}` });
  }

  try {
    const upstream = await askForecastService(serviceUrl, series, horizon);

    if (!upstream.ok) {
      console.error("[findash-error] forecast upstream:", upstream.status);
      // A 503 is passed on rather than turned into a 502. The service answers
      // 503 when it is up but the model cannot be loaded (no torch, no
      // weights): "unavailable, keep the local trend", not "broken". Its
      // detail can name a file path, so it is logged, not repeated.
      if (upstream.status === 503) {
        return res.status(503).json({ error: "forecast model not available" });
      }
      return res.status(502).json({ error: "forecast service returned " + upstream.status });
    }

    const answer = await upstream.json();
    const low = numberList(answer.low, horizon);
    const predicted = numberList(answer.predicted, horizon);
    const high = numberList(answer.high, horizon);
    if (!low || !predicted || !high) {
      return res.status(502).json({ error: "forecast service returned an incomplete band" });
    }
    if (!isInOrder(low, predicted, high)) {
      return res.status(502).json({ error: "forecast quantiles are out of order" });
    }

    return res.status(200).json({
      model: String(answer.model ?? "chronos"),
      horizon: horizon,
      low: low,
      predicted: predicted,
      high: high
    });
  } catch (error) {
    // Never repeat the upstream error: it can carry the service's address.
    console.error("[findash-error] forecast failed:", error);
    if (error?.name === "AbortError") {
      return res.status(502).json({ error: "forecast timed out" });
    }
    return res.status(502).json({ error: "forecast unavailable" });
  }
}
