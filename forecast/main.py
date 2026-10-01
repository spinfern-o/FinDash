"""
Chronos-Bolt forecasting service for FinDash.

amazon/chronos-bolt-base predicts QUANTILES rather than a single number, which
is exactly the shape the dashboard wants: p10 is the worst case, p50 the
expected path, p90 the best. Nothing is trained - the model is zero-shot.

This lives outside Vercel on purpose. The model needs torch, which blows past
the 250 MB serverless bundle limit, so it runs as its own small service and
api/forecast.js proxies to it.

    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8000   # or: python main.py

Then set FORECAST_URL in Vercel to this service's URL.

Note that `chronos-forecasting` is not available through Hugging Face's
serverless Inference API - the model card carries `inference: null`, so there is
no hosted endpoint to call. Running this service is the way to use it.
"""

import os
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

MODEL_ID = os.environ.get("CHRONOS_MODEL", "amazon/chronos-bolt-base")

# Shared secret so the service is not an open GPU/CPU burner on the internet.
SERVICE_TOKEN = os.environ.get("FORECAST_TOKEN", "")

# Monthly business data: a handful of points, never thousands.
MAX_POINTS = 240
MAX_HORIZON = 12

app = FastAPI(title="FinDash forecast")

_pipeline = None
_torch = None
_load_error: Optional[str] = None


def _load():
    """Import torch/chronos and load the weights, once, on first use.

    Deliberately NOT at module import. torch and chronos-forecasting are heavy
    optional dependencies; importing them at the top meant a missing or
    mismatched install crashed the process on boot, so /health never answered
    and the only symptom was "No module named 'chronos'" in a log nobody reads.
    Now the service always starts and says what is wrong.
    """
    global _pipeline, _torch, _load_error
    if _pipeline is not None or _load_error is not None:
        return
    try:
        import torch
        from chronos import BaseChronosPipeline
    except ImportError as err:
        _load_error = (
            f"{err}. Install the model dependencies: "
            "pip install -r requirements.txt"
        )
        return
    try:
        _torch = torch
        _pipeline = BaseChronosPipeline.from_pretrained(
            MODEL_ID,
            device_map="cpu",
            torch_dtype=torch.float32,
        )
    except Exception as err:  # network, disk, revoked repo, wrong model id
        _torch = None
        _load_error = f"could not load {MODEL_ID}: {type(err).__name__}: {err}"


class ForecastRequest(BaseModel):
    series: List[float] = Field(..., description="One value per period, oldest first")
    horizon: int = Field(3, ge=1, le=MAX_HORIZON)
    token: str = ""


class ForecastResponse(BaseModel):
    model: str
    horizon: int
    low: List[float]        # p10 - the worst case
    predicted: List[float]  # p50 - the expected path
    high: List[float]       # p90 - the best case


@app.get("/health")
def health():
    """Report whether the model is actually usable, not just that HTTP is up.

    A green health check that only proves the web server booted is how a broken
    model install reaches production.
    """
    _load()
    return {
        "ok": _pipeline is not None,
        "model": MODEL_ID,
        "model_loaded": _pipeline is not None,
        "error": _load_error,
    }


@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest):
    if SERVICE_TOKEN and req.token != SERVICE_TOKEN:
        raise HTTPException(status_code=403, detail="bad token")

    if not req.series or len(req.series) > MAX_POINTS:
        raise HTTPException(status_code=400, detail=f"series must be 1-{MAX_POINTS} points")
    # Pydantic has already coerced these to float, so the remaining risk is
    # NaN/inf, which sail through float() and poison the forecast silently.
    if any(v != v or v in (float("inf"), float("-inf")) for v in req.series):
        raise HTTPException(status_code=400, detail="series must be finite numbers")

    _load()
    if _pipeline is None:
        # 503, not 500: nothing about the request is wrong, the model is simply
        # not available here. api/forecast.js passes this through so the page
        # keeps its locally computed trend line instead of showing an error.
        raise HTTPException(status_code=503, detail=_load_error or "model unavailable")

    # Chronos handles short context, but say so rather than pretending otherwise:
    # at four points the band will be very wide, which is the honest answer.
    context = _torch.tensor(req.series, dtype=_torch.float32)

    quantiles, _mean = _pipeline.predict_quantiles(
        context=context,
        prediction_length=req.horizon,
        quantile_levels=[0.1, 0.5, 0.9],
    )

    # quantiles: [batch, horizon, len(quantile_levels)]
    q = quantiles[0]
    return ForecastResponse(
        model=MODEL_ID,
        horizon=req.horizon,
        low=[round(float(v), 2) for v in q[:, 0]],
        predicted=[round(float(v), 2) for v in q[:, 1]],
        high=[round(float(v), 2) for v in q[:, 2]],
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
