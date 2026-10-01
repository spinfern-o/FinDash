# Chronos forecast service

Runs `amazon/chronos-bolt-base` and returns p10 / p50 / p90 for the next N
periods — the worst case, the expected path, and the best case.

It lives outside Vercel because the model needs PyTorch, which is far past the
250 MB serverless bundle limit. `api/forecast.js` proxies to it so the service
URL and token never reach the browser.

## Run it locally

```bash
cd forecast
pip install -r requirements.txt
uvicorn main:app --port 8000
```

First call downloads the model (~200 MB) and takes a while; after that a
forecast is fast on CPU.

```bash
curl -s localhost:8000/forecast -H 'Content-Type: application/json' \
  -d '{"series":[1040,2880,3850,4600,6900,7210,7580,5420,-3640,3070,3420,8940],"horizon":3}'
```

## Deploy it

Any host that runs a Python container works. In rough order of least effort:

| Host | Notes |
|---|---|
| **Modal** | serverless, scales to zero, free tier covers this |
| **Railway / Render** | always-on container, simplest mental model |
| **Hugging Face Spaces** | Docker space, free CPU tier |
| **Fly.io** | scales to zero with a small volume for the model cache |

Set a `FORECAST_TOKEN` env var on the service, or it is an open endpoint anyone
can spend your CPU on.

## Point Vercel at it

In the Vercel project settings add:

| Variable | Value |
|---|---|
| `FORECAST_URL` | `https://your-service.example.com` |
| `FORECAST_TOKEN` | the same token the service expects |

Then **redeploy** — Vercel bakes environment variables in at build time, so an
existing deployment will not pick them up.

Until `FORECAST_URL` is set, `/api/forecast` returns 503 with a reason and the
dashboard falls back to its own trend line. The chart works either way.

## "Chronos is unavailable"

Three different things produce that message. Ask the service which one:

```bash
curl -s localhost:8000/health
```

`/health` answers `200` even when the model is broken, and tells you why:

```json
{"ok": false, "model": "amazon/chronos-bolt-base", "model_loaded": false,
 "error": "No module named 'chronos'. Install the model dependencies: pip install -r requirements.txt"}
```

| `/health` says | Cause | Fix |
|---|---|---|
| `No module named 'chronos'` or `'torch'` | dependencies not installed in the interpreter running the service | `pip install -r requirements.txt` — check you are in the right venv |
| `could not load amazon/chronos-bolt-base: …` | no network on first run, no disk for the ~200 MB download, or a wrong `CHRONOS_MODEL` | re-run with network, or set `HF_HOME` to a writable path |
| `ok: true` | the service is fine — the problem is between Vercel and it | check `FORECAST_URL` / `FORECAST_TOKEN`, then redeploy |

If the editor rather than the service reports it — `Import "chronos" could not be
resolved` — that is only the linter: the package is installed in the service's
venv, not the one the editor points at. Nothing to fix in the code.

There is **no hosted option to fall back on.** `amazon/chronos-bolt-base` is not
served by Hugging Face's serverless Inference API: the model card declares
`library_name: chronos-forecasting` and `inference: null`, so calling
`api-inference.huggingface.co` for it returns an error no matter what token you
hold. Running this service is the only way to use the model.

Whatever the cause, the dashboard stays correct. `/api/forecast` returns `503`,
the page hides the Chronos button and keeps the trend line it computed itself.

## Is it worth it?

At a dozen monthly points, a least-squares line with a prediction interval is
about as accurate as a foundation model, and that is what the browser already
draws for free. Chronos earns its place once there is a couple of years of
history with real seasonality in it — predicting next September from the last
three Septembers is something a straight line cannot do.
