"""
Chronos-Bolt forecasting service for FinDash.

amazon/chronos-bolt-base predicts QUANTILES rather than a single number,
which is exactly the shape the dashboard wants: the 10th percentile is the
low end, the 50th the expected path, the 90th the high end. Nothing is
trained: the model is used as it comes ("zero-shot").

This lives outside Vercel on purpose. The model needs torch, which is far
bigger than Vercel's 250 MB limit for a function, so it runs as its own small
service and api/forecast.js passes requests on to it.

    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8000   # or: python main.py

Then set FORECAST_URL in Vercel to this service's address.

Note that `chronos-forecasting` is not available through Hugging Face's
serverless Inference API: the model card has `inference: null`, so there is
no hosted endpoint to call. Running this service is the way to use it.
"""

import math
import os
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

MODEL_ID = os.environ.get("CHRONOS_MODEL", "amazon/chronos-bolt-base")

# A shared secret, so the service is not a free computer for anyone on the
# internet. api/forecast.js sends it with every request.
SERVICE_TOKEN = os.environ.get("FORECAST_TOKEN", "")

# Monthly business figures: a handful of points, never thousands.
MAXIMUM_POINTS = 240
MAXIMUM_HORIZON = 12

# Low, expected and high.
QUANTILE_LEVELS = [0.1, 0.5, 0.9]

app = FastAPI(title="FinDash forecast")

# Loaded on first use (see load_model). Until then, and if loading fails,
# chronos_pipeline is None and load_error says why.
chronos_pipeline = None
torch_module = None
load_error: Optional[str] = None


def load_model():
    """Imports torch and chronos and loads the model, once, on first use.

    Deliberately NOT when the program starts. torch and chronos-forecasting
    are large optional packages; importing them at the top meant a missing or
    mismatched install crashed the service on start-up, so /health never
    answered and the only sign was "No module named 'chronos'" in a log
    nobody reads. Now the service always starts and says what is wrong.
    """
    global chronos_pipeline, torch_module, load_error
    if chronos_pipeline is not None or load_error is not None:
        return

    try:
        import torch
        from chronos import BaseChronosPipeline
    except ImportError as error:
        load_error = f"{error}. Install the model dependencies: pip install -r requirements.txt"
        return

    try:
        torch_module = torch
        chronos_pipeline = BaseChronosPipeline.from_pretrained(
            MODEL_ID,
            device_map="cpu",
            torch_dtype=torch.float32,
        )
    except Exception as error:  # network, disk, a removed repository, a wrong model id
        torch_module = None
        load_error = f"could not load {MODEL_ID}: {type(error).__name__}: {error}"


class ForecastRequest(BaseModel):
    series: List[float] = Field(..., description="One value per month, oldest first")
    horizon: int = Field(3, ge=1, le=MAXIMUM_HORIZON)
    token: str = ""


class ForecastResponse(BaseModel):
    model: str
    horizon: int
    low: List[float]        # 10th percentile: the low end
    predicted: List[float]  # 50th percentile: the expected path
    high: List[float]       # 90th percentile: the high end


@app.get("/health")
def health():
    """Says whether the model can actually be used, not just that the web
    server is up. A health check that only proves the server started is how
    a broken model install reaches production."""
    load_model()
    return {
        "ok": chronos_pipeline is not None,
        "model": MODEL_ID,
        "model_loaded": chronos_pipeline is not None,
        "error": load_error,
    }


def check_request(request: ForecastRequest):
    """Raises an HTTP error for a request that cannot be forecast."""
    if SERVICE_TOKEN and request.token != SERVICE_TOKEN:
        raise HTTPException(status_code=403, detail="bad token")

    if not request.series or len(request.series) > MAXIMUM_POINTS:
        raise HTTPException(status_code=400, detail=f"series must be 1-{MAXIMUM_POINTS} points")

    # Pydantic has already turned these into floats, so what is left to catch
    # is NaN and infinity, which pass float() and would quietly spoil the
    # forecast.
    for value in request.series:
        if not math.isfinite(value):
            raise HTTPException(status_code=400, detail="series must be finite numbers")


def rounded_column(quantiles, column):
    """One quantile level across every month ahead, to the cent."""
    return [round(float(value), 2) for value in quantiles[:, column]]


@app.post("/forecast", response_model=ForecastResponse)
def forecast(request: ForecastRequest):
    check_request(request)

    load_model()
    if chronos_pipeline is None:
        # 503, not 500: nothing about the request is wrong, the model is just
        # not available here. api/forecast.js passes this on so the page keeps
        # its own trend line instead of showing an error.
        raise HTTPException(status_code=503, detail=load_error or "model unavailable")

    # Chronos copes with a short history. At four points the range will be
    # very wide, which is the honest answer.
    history = torch_module.tensor(request.series, dtype=torch_module.float32)
    quantiles_per_series, _mean_per_series = chronos_pipeline.predict_quantiles(
        context=history,
        prediction_length=request.horizon,
        quantile_levels=QUANTILE_LEVELS,
    )

    # quantiles_per_series is shaped [series, months ahead, quantile level];
    # there is one series.
    quantiles = quantiles_per_series[0]
    return ForecastResponse(
        model=MODEL_ID,
        horizon=request.horizon,
        low=rounded_column(quantiles, 0),
        predicted=rounded_column(quantiles, 1),
        high=rounded_column(quantiles, 2),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
