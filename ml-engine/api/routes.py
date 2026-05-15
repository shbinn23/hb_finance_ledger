import pandas as pd
from datetime import date
from time import perf_counter
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from engine.spending_forecaster import SpendingForecaster
from engine.anomaly_detector import AnomalyDetector
from engine.forecast_processor import ForecastProcessor
from engine.task_cache import TaskCache, stable_hash
from repository.ml_repo import (
    fetch_ai_training_features,
    fetch_anomaly_ml_features,
    fetch_fixed_profile,
    fetch_past_months,
)

router = APIRouter()

_forecaster: SpendingForecaster | None = None
_detector: AnomalyDetector | None = None
_forecast_cache = TaskCache(max_entries=48)
_anomaly_cache = TaskCache(max_entries=24)


def _get_forecaster() -> SpendingForecaster:
    global _forecaster
    if _forecaster is None:
        _forecaster = SpendingForecaster()
    return _forecaster


def _get_detector() -> AnomalyDetector:
    global _detector
    if _detector is None:
        _detector = AnomalyDetector()
    return _detector


class PredictRequest(BaseModel):
    today: date


class DetectRequest(BaseModel):
    today: date


class TimeSeriesPoint(BaseModel):
    ds: date
    y: float


class FixedProfilePoint(BaseModel):
    due_day: int = Field(ge=1, le=31)
    avg_amount: float


class ForecastTaskRequest(BaseModel):
    task_id: str = "monthly-variable-spend"
    today: date
    series: list[TimeSeriesPoint]
    actual: list[TimeSeriesPoint] = Field(default_factory=list)
    fixed_profile: list[FixedProfilePoint] = Field(default_factory=list)
    prediction_length: int | None = Field(default=None, ge=1, le=31)
    num_samples: int = Field(default=100, ge=20, le=200)


class AnomalyFeatureRow(BaseModel):
    transaction_date: date
    day_of_month: float
    day_of_week: float
    is_weekend: int
    is_holiday: int
    parent_category: str
    description: str
    amount: float


class DetectTaskRequest(BaseModel):
    task_id: str = "transaction-anomaly"
    today: date
    rows: list[AnomalyFeatureRow]


@router.get("/health")
def health():
    return {"status": "ok"}


def _build_timeseries(df_raw: pd.DataFrame, today: pd.Timestamp):
    df_raw = df_raw.copy()
    df_raw["transaction_date"] = pd.to_datetime(df_raw["transaction_date"])
    pivot = df_raw.pivot_table(
        index=df_raw["transaction_date"].dt.day,
        columns=df_raw["transaction_date"].dt.strftime("%Y-%m"),
        values="daily_amount",
        aggfunc="sum",
    ).fillna(0).cumsum()

    curr_m = today.strftime("%Y-%m")
    actual = pivot[curr_m].loc[:today.day] if curr_m in pivot.columns else pd.Series(dtype=float)
    past_months = pivot.drop(columns=[curr_m]) if curr_m in pivot.columns else pivot
    return actual, past_months


def _points_to_frame(points: list[TimeSeriesPoint]) -> pd.DataFrame:
    if not points:
        return pd.DataFrame({
            "ds": pd.Series(dtype="datetime64[ns]"),
            "y": pd.Series(dtype="float64"),
        })

    df = pd.DataFrame([point.model_dump() for point in points])
    df["ds"] = pd.to_datetime(df["ds"])
    df["y"] = pd.to_numeric(df["y"], errors="coerce").fillna(0)
    return df.groupby("ds", as_index=False)["y"].sum().sort_values("ds")


def _fixed_profile_to_frame(points: list[FixedProfilePoint]) -> pd.DataFrame:
    if not points:
        return pd.DataFrame(columns=["due_day", "avg_amount"])

    df = pd.DataFrame([point.model_dump() for point in points])
    df["avg_amount"] = pd.to_numeric(df["avg_amount"], errors="coerce").fillna(0)
    return df.groupby("due_day", as_index=False)["avg_amount"].sum()


def _actual_series(actual_frame: pd.DataFrame, today: pd.Timestamp) -> pd.Series:
    if actual_frame.empty:
        return pd.Series(dtype=float)

    curr_m = today.strftime("%Y-%m")
    current = actual_frame[actual_frame["ds"].dt.strftime("%Y-%m") == curr_m]
    if current.empty:
        return pd.Series(dtype=float)

    return current.groupby(current["ds"].dt.day)["y"].sum().sort_index().cumsum().loc[: today.day]


def _past_months_from_series(series_frame: pd.DataFrame, today: pd.Timestamp) -> pd.DataFrame:
    if series_frame.empty:
        return pd.DataFrame()

    curr_m = today.strftime("%Y-%m")
    pivot = series_frame.pivot_table(
        index=series_frame["ds"].dt.day,
        columns=series_frame["ds"].dt.strftime("%Y-%m"),
        values="y",
        aggfunc="sum",
    ).fillna(0).cumsum()

    return pivot.drop(columns=[curr_m]) if curr_m in pivot.columns else pivot


def _compute_forecast_task(req: ForecastTaskRequest) -> dict:
    today = pd.Timestamp(req.today)
    prediction_length = req.prediction_length or today.days_in_month
    series_frame = _points_to_frame(req.series)
    if series_frame.empty:
        raise HTTPException(status_code=422, detail="예측 입력 시계열이 비어 있습니다.")

    curr_m_str = today.strftime("%Y-%m")
    train_frame = series_frame[series_frame["ds"].dt.strftime("%Y-%m") < curr_m_str].copy()
    if len(train_frame) < 14:
        train_frame = series_frame

    forecast = _get_forecaster().predict(train_frame, prediction_length, num_samples=req.num_samples)
    if forecast is None:
        raise HTTPException(status_code=422, detail="데이터 부족으로 예측 불가 (최소 5일 필요)")

    forecast.index = range(1, prediction_length + 1)
    actual_source = _points_to_frame(req.actual) if req.actual else series_frame
    actual = _actual_series(actual_source, today)
    past_months = _past_months_from_series(series_frame, today)
    fixed_profile = _fixed_profile_to_frame(req.fixed_profile)

    ai_pure, ai_bounds, projected, components = ForecastProcessor.apply_postprocessing_rules(
        forecast,
        actual,
        past_months,
        train_frame,
        fixed_profile,
        today,
    )
    summary = ForecastProcessor.full_month_summary(actual, ai_pure, ai_bounds)
    projected_curve = summary["projected_path"]
    lower_curve = summary["lower_projected_path"]
    upper_curve = summary["upper_projected_path"]

    daily_forecast = []
    for day in range(1, today.days_in_month + 1):
        daily_forecast.append({
            "day": day,
            "forecast_cumulative_total": float(ai_pure.loc[day]),
            "expected_variable_cumulative": float(components.loc[day, "variable"]),
            "expected_fixed_cumulative": float(components.loc[day, "fixed"]),
            "lower_cumulative_total": float(ai_bounds.loc[day, "lower"]),
            "upper_cumulative_total": float(ai_bounds.loc[day, "upper"]),
            "projected_total": float(projected_curve.loc[day]),
            "lower_projected_total": float(lower_curve.loc[day]),
            "upper_projected_total": float(upper_curve.loc[day]),
        })

    return {
        "ai_pure": ai_pure.tolist(),
        "ai_upper": ai_bounds["upper"].tolist(),
        "ai_lower": ai_bounds["lower"].tolist(),
        "projected": projected.tolist(),
        "projected_index": projected.index.tolist(),
        "actual_month_to_date": summary["actual_month_to_date"],
        "projected_month_total": summary["projected_month_total"],
        "lower_month_total": summary["lower_month_total"],
        "upper_month_total": summary["upper_month_total"],
        "daily_forecast": daily_forecast,
        "source": "model",
    }


@router.post("/forecast")
def forecast(req: ForecastTaskRequest):
    payload = req.model_dump(mode="json")
    key = stable_hash({"version": 1, "model": "amazon/chronos-t5-base", "payload": payload})
    started = perf_counter()

    def compute():
        return _compute_forecast_task(req)

    result, cache_hit = _forecast_cache.get_or_compute(key, compute)
    return {
        **result,
        "cache_hit": cache_hit,
        "model_status": "model",
        "input_hash": key,
        "duration_ms": round((perf_counter() - started) * 1000, 2),
    }


@router.post("/detect/features")
def detect_features(req: DetectTaskRequest):
    payload = req.model_dump(mode="json")
    key = stable_hash({"version": 1, "model": "isolation-forest", "payload": payload})
    started = perf_counter()

    def compute():
        if not req.rows:
            return []

        df = pd.DataFrame([row.model_dump() for row in req.rows])
        anomalies = _get_detector().detect_anomalies(df, pd.Timestamp(req.today))

        if anomalies.empty:
            return []

        anomalies = anomalies.copy()
        if "transaction_date" in anomalies.columns:
            anomalies["transaction_date"] = anomalies["transaction_date"].astype(str)
        return anomalies.to_dict(orient="records")

    result, cache_hit = _anomaly_cache.get_or_compute(key, compute)
    return {
        "rows": result,
        "cache_hit": cache_hit,
        "input_hash": key,
        "duration_ms": round((perf_counter() - started) * 1000, 2),
    }


@router.post("/predict")
def predict(req: PredictRequest):
    today = pd.Timestamp(req.today)
    prediction_length = today.days_in_month

    df_train = fetch_ai_training_features()
    if "ds" in df_train.columns:
        curr_m_str = today.strftime("%Y-%m")
        df_train_ctx = df_train[
            pd.to_datetime(df_train["ds"]).dt.strftime("%Y-%m") < curr_m_str
        ].copy()
        if len(df_train_ctx) < 14:
            df_train_ctx = df_train
    else:
        df_train_ctx = df_train

    curr_f_raw = _get_forecaster().predict(df_train_ctx, prediction_length)
    if curr_f_raw is None:
        raise HTTPException(status_code=422, detail="데이터 부족으로 예측 불가 (최소 5일 필요)")

    curr_f_raw.index = range(1, prediction_length + 1)

    raw_daily = fetch_past_months()
    actual, past_months = _build_timeseries(raw_daily, today)
    fixed_profile = fetch_fixed_profile()

    ai_pure, ai_bounds, projected, _components = ForecastProcessor.apply_postprocessing_rules(
        curr_f_raw, actual, past_months, df_train, fixed_profile, today
    )

    return {
        "ai_pure":          ai_pure.tolist(),
        "ai_upper":         ai_bounds["upper"].tolist(),
        "ai_lower":         ai_bounds["lower"].tolist(),
        "projected":        projected.tolist(),
        "projected_index":  projected.index.tolist(),
    }


@router.post("/detect")
def detect(req: DetectRequest):
    today = pd.Timestamp(req.today)

    df = fetch_anomaly_ml_features()
    anomalies = _get_detector().detect_anomalies(df, today)

    if anomalies.empty:
        return []

    anomalies = anomalies.copy()
    if "transaction_date" in anomalies.columns:
        anomalies["transaction_date"] = anomalies["transaction_date"].astype(str)

    return anomalies.to_dict(orient="records")
