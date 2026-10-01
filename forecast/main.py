"""
Chronos-Bolt forecasting service for FinDash.

amazon/chronos-bolt-base predicts QUANTILES rather than a single number, which
is exactly the shape the dashboard wants: p10 is the worst case, p50 the
expected path, p90 the best. Nothing is trained - the model is zero-shot.

This lives outside Vercel on purpose. The model needs torch, which blows past
the 250 MB serverless bundle limit, so it runs as its own small service and
api/forecast.js proxies to it.

    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8000

Then set FORECAST_URL in Vercel to this service's URL.
"""

import os
from typing import List

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from chronos import BaseChronosPipeline

MODEL_ID = os.environ.get("CHRONOS_MODEL", "amazon/chronos-bolt-base")

# Shared secret so the service is not an open GPU/CPU burner on the internet.
SERVICE_TOKEN = os.environ.get("FORECAST_TOKEN", "")

# Monthly business data: a handful of points, never thousands.
MAX_POINTS = 240
MAX_HORIZON = 12

app = FastAPI(title="FinDash forecast")

_pipeline = None


def pipeline() -> BaseChronosPipeline:
    """Loaded once, on first use - not at import, so the container starts fast."""
    global _pipeline
    if _pipeline is None:
        _pipeline = BaseChronosPipeline.from_pretrained(
            MODEL_ID,
            device_map="cpu",
            torch_dtype=torch.float32,
        )
    return _pipeline


class ForecastRequest(BaseModel):
    series: List[float] = Field(..., description="One value per period, oldest first")
    horizon: int = Field(3, ge=1, le=MAX_HORIZON)
    token: str = ""


class ForecastResponse(BaseModel):
    model: str
    horizon: int
    low: List[float]       # p10 - the worst case
    predicted: List[float]  # p50 - the expected path
    high: List[float]      # p90 - the best case


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_ID}


@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest):
    if SERVICE_TOKEN and req.token != SERVICE_TOKEN:
        raise HTTPException(status_code=403, detail="bad token")

    if not req.series or len(req.series) > MAX_POINTS:
        raise HTTPException(status_code=400, detail=f"series must be 1-{MAX_POINTS} points")
    if any(not isinstance(v, (int, float)) or v != v for v in req.series):
        raise HTTPException(status_code=400, detail="series must be finite numbers")

    # Chronos handles short context, but say so rather than pretending otherwise:
    # at four points the band will be very wide, which is the honest answer.
    context = torch.tensor(req.series, dtype=torch.float32)

    quantiles, _mean = pipeline().predict_quantiles(
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
