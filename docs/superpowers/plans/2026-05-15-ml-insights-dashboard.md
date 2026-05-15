# ML Insights Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated ML insights page and make overview month-end spending progress prefer ML forecasts.

**Architecture:** Add a focused `server/ml` client for the ML API, then build feature view models under `features/ml`. Overview receives an optional normalized ML forecast and falls back to its current linear projection when unavailable. Finance semantics stay in the dashboard/service layer; the ML engine only receives model-shaped tasks such as Chronos `ds/y` series or detector feature matrices.

**Tech Stack:** Next.js 16 App Router, TypeScript, React Server Components, Recharts, lucide-react, existing CSS system.

---

## File Structure

- Create `dashboard/src/server/ml/client.ts`: low-level ML API client, response validation, timeout, normalized result types.
- Create `dashboard/src/features/ml/task-adapter.ts`: dashboard-side adapter that documents and normalizes finance-facing forecast/anomaly requests into model-facing task inputs.
- Create `dashboard/src/features/ml/types.ts`: UI-facing ML view-model types.
- Create `dashboard/src/features/ml/service.ts`: builds ML page model and overview forecast adapter.
- Create `dashboard/src/features/ml/components/ml-charts.tsx`: client Recharts forecast chart.
- Create `dashboard/src/features/ml/components/ml-page.tsx`: ML page layout and anomaly/status panels.
- Create `dashboard/src/app/ml/page.tsx`: server page entry point.
- Modify `dashboard/src/components/layout/sidebar.tsx`: add `ML 인사이트` nav item.
- Modify `dashboard/src/features/overview/model.ts`: accept optional ML forecast and use it for summary/chart.
- Modify `dashboard/src/features/overview/service.ts`: fetch ML forecast and pass it to the overview model.
- Modify `dashboard/src/features/overview/types.ts`: add forecast source metadata.

## Task 1: Add ML Client Boundary

**Files:**
- Create: `dashboard/src/server/ml/client.ts`

- [ ] **Step 1: Create typed ML client**

```ts
const defaultMlUrl = process.env.ML_ENGINE_URL ?? "http://127.0.0.1:8000";
const timeoutMs = Number(process.env.ML_ENGINE_TIMEOUT_MS ?? 5000);

export type MlStatus = "ml" | "fallback";

export interface MlForecastSeriesPoint {
  day: number;
  ai: number | null;
  projected: number | null;
  upper: number | null;
  lower: number | null;
}

export interface MlForecastResult {
  source: "ml";
  today: string;
  projectedFinal: number;
  series: MlForecastSeriesPoint[];
}

export interface MlAnomalyResult {
  date: string;
  description: string;
  category: string;
  amount: number;
  score: number;
  isAnomaly: boolean;
}
```

- [ ] **Step 2: Implement timeout fetch and validators**

Use `AbortController`, return `null` on failure, and validate that ML arrays are arrays before mapping.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run lint`

Expected: no TypeScript/ESLint errors from the new file.

## Task 2: Build ML Feature Service And Page

**Files:**
- Create: `dashboard/src/features/ml/task-adapter.ts`
- Create: `dashboard/src/features/ml/types.ts`
- Create: `dashboard/src/features/ml/service.ts`
- Create: `dashboard/src/features/ml/components/ml-charts.tsx`
- Create: `dashboard/src/features/ml/components/ml-page.tsx`
- Create: `dashboard/src/app/ml/page.tsx`

- [ ] **Step 1: Define view-model types**

Include metric cards, forecast rows, anomaly rows, status metadata, and coach messages.

- [ ] **Step 2: Add task adapter boundary**

Create `dashboard/src/features/ml/task-adapter.ts` with the current month forecast and anomaly task factories. These factories should keep finance semantics outside the ML engine and produce only the date/model task inputs the current ML API accepts.

- [ ] **Step 3: Build `getMlInsightsViewModel()`**

Call `fetchMlForecast()` and `fetchMlAnomalies()`. Compute projected final, budget delta, daily safe spend, anomaly counts, and fallback copy.

- [ ] **Step 4: Add Recharts forecast component**

Render confidence band, ML projected path, and AI pure forecast. Keep stable dimensions.

- [ ] **Step 5: Add ML page route**

`dashboard/src/app/ml/page.tsx` should call the service and render `MlPage`.

## Task 3: Connect Overview To ML Forecast

**Files:**
- Modify: `dashboard/src/features/overview/types.ts`
- Modify: `dashboard/src/features/overview/model.ts`
- Modify: `dashboard/src/features/overview/service.ts`

- [ ] **Step 1: Add optional forecast metadata**

Extend overview model with `forecastSource: "ml" | "fallback"`.

- [ ] **Step 2: Add optional ML forecast input to `buildOverviewViewModel()`**

Use ML `projectedFinal` for `월말 예상` and ML series for projected/upper/lower values when available.

- [ ] **Step 3: Fetch ML in overview service**

Call `fetchMlForecast()` from the server service. If unavailable, pass `null`.

## Task 4: Add Navigation And Styles

**Files:**
- Modify: `dashboard/src/components/layout/sidebar.tsx`
- Modify: `dashboard/src/app/globals.css`

- [ ] **Step 1: Add sidebar item**

Add `ML 인사이트` with an appropriate lucide icon.

- [ ] **Step 2: Add focused CSS for ML page**

Add classes for metric grid, forecast layout, anomaly rows, and status panels using the existing design language.

## Task 5: Verification

**Files:**
- No source changes unless verification reveals an issue.

- [ ] **Step 1: Run lint**

Run: `npm run lint`

Expected: pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: pass.

- [ ] **Step 3: Smoke test pages**

Run:

```bash
curl -fsS http://127.0.0.1:3020/overview >/tmp/overview.html
curl -fsS http://127.0.0.1:3020/ml >/tmp/ml.html
```

Expected: both return HTML.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src docs/superpowers/plans/2026-05-15-ml-insights-dashboard.md
git commit -m "feat: add ml insights dashboard"
```

## Self-Review

- Spec coverage: new route, sidebar, ML client boundary, overview ML-first forecast, fallback behavior, and verification are covered.
- Placeholder scan: no TODO/TBD placeholders are intentionally left.
- Type consistency: forecast source uses `"ml" | "fallback"` across client, feature service, and overview. Task adapter naming keeps finance interpretation outside the ML client.
