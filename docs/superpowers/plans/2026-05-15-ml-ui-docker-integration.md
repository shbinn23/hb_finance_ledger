# ML UI And Docker Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the ML insights dashboard with shared dashboard layout components and integrate the ML engine into this project as a separate Docker service.

**Architecture:** Keep Next.js, PostgreSQL, ETL, and ML Engine as separate runtime services. Move dashboard finance semantics into the Next.js service layer and keep the ML Engine as a FastAPI model service under `ml-engine/`.

**Tech Stack:** Next.js 16, TypeScript, Recharts, FastAPI, Chronos, scikit-learn, Docker Compose.

---

## File Structure

- Modify `dashboard/src/features/ml/components/ml-page.tsx` to use `section-hero`, `metric-grid`, `MetricCard`, `dashboard-grid`, `dashboard-main`, `dashboard-side`, and shared card/panel primitives.
- Modify `dashboard/src/app/globals.css` to remove or shrink ML-only layout classes that duplicate shared layout primitives.
- Create `ml-engine/` by vendoring the current FastAPI ML engine source.
- Modify `docker-compose.yml` to add `ml-engine` as a separate service and point dashboard defaults at `http://ml-engine:8000` in Docker.
- Modify `dashboard/src/server/ml/client.ts` only if required to keep local fallback and Docker service URL behavior clear.

## Task 1: Align ML Page With Shared Dashboard Layout

**Files:**
- Modify `dashboard/src/features/ml/components/ml-page.tsx`
- Modify `dashboard/src/app/globals.css`

- [x] Replace `section-header` with shared `section-hero`.
- [x] Replace `section-metrics` custom cards with `metric-grid` and `MetricCard`.
- [x] Replace `ml-layout` with `dashboard-grid`, `dashboard-main`, and `dashboard-side`.
- [x] Use shared `Card` primitives for the forecast, status, and anomaly panels.
- [x] Keep ML-specific classes only for content styling that shared components do not cover.
- [x] Run `npm run lint`.

## Task 2: Vendor ML Engine Into Project

**Files:**
- Create `ml-engine/`

- [x] Copy the current `/Users/shbinn/dev/hb-ml-engine` source into `ml-engine/`.
- [x] Exclude `.git`, virtual environments, caches, and local bytecode.
- [x] Preserve the new `/forecast`, `/detect/features`, and task cache changes.
- [x] Run `python3 -m py_compile` against vendored FastAPI files.

## Task 3: Wire Docker Compose Service Boundary

**Files:**
- Modify `docker-compose.yml`
- Modify `dashboard/src/server/ml/client.ts`

- [x] Add a `ml-engine` service that builds from `./ml-engine`, exposes `8000`, and depends on healthy Postgres.
- [x] Set dashboard `ML_ENGINE_URL` default for Docker Compose to `http://ml-engine:8000`.
- [x] Keep local development fallback to `http://127.0.0.1:8000`.
- [x] Run `docker compose config`.

## Task 4: Verification

- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Run Python syntax checks for `ml-engine/api` and `ml-engine/engine`.
- [x] Smoke test `/ml` and `/overview` with `curl`.
