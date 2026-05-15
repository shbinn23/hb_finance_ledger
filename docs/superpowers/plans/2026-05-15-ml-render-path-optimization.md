# ML Render Path Optimization Plan

> Use superpowers:executing-plans to execute this plan task by task.

## Task 1: Add ML Engine Cache And Pure Forecast Endpoint

Files:
- `/Users/shbinn/dev/hb-ml-engine/engine/task_cache.py`
- `/Users/shbinn/dev/hb-ml-engine/engine/spending_forecaster.py`
- `/Users/shbinn/dev/hb-ml-engine/api/routes.py`

- [x] Add a small thread-safe in-memory task cache with stable JSON hashing and single-flight duplicate request handling.
- [x] Allow `SpendingForecaster.predict()` to accept `num_samples` with the current default of `100`.
- [x] Add Pydantic models for `TimeSeriesPoint`, `FixedProfilePoint`, and `ForecastTaskRequest`.
- [x] Add `POST /forecast`, accepting model-shaped payloads and returning the existing forecast arrays plus `cache_hit`, `input_hash`, and `duration_ms`.
- [x] Keep legacy `/predict` untouched for compatibility.

## Task 2: Build Dashboard-Side Model Payload From Whooing DB

Files:
- `dashboard/src/server/whooing/ml-task-repository.ts`
- `dashboard/src/features/ml/task-adapter.ts`
- `dashboard/src/server/ml/client.ts`
- `dashboard/src/features/ml/service.ts`

- [x] Query Whooing for daily variable spending series using `accounts.category <> 'steady'`.
- [x] Query current-month actual daily spending for chart anchoring.
- [x] Query fixed profile from `accounts.category = 'steady'`.
- [x] Build the `/forecast` payload in the service layer.
- [x] Update overview and `/ml` forecast calls to use the new payload.
- [x] Move anomaly detection to a dashboard-built feature matrix and ML Engine `/detect/features`.

## Task 3: Verification

- [x] Run Python syntax checks for modified ML engine files.
- [x] Run dashboard lint/build where possible.
- [x] Confirm git status in both repos and document any environment blocker such as Docker/Postgres being down.
