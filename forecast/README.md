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

## Is it worth it?

At a dozen monthly points, a least-squares line with a prediction interval is
about as accurate as a foundation model, and that is what the browser already
draws for free. Chronos earns its place once there is a couple of years of
history with real seasonality in it — predicting next September from the last
three Septembers is something a straight line cannot do.
