# Whooing Dashboard DB Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the overview dashboard mock data with a server-side view model backed by the local `whooing.*` PostgreSQL mirror.

**Architecture:** Keep `whooing.*` as a raw API mirror. Add a thin dashboard DB adapter, a Whooing repository that owns SQL, and an overview service that converts query rows into the existing feature view model. Keep chart rendering client-side and the overview page server-rendered.

**Tech Stack:** Next.js 16 App Router, TypeScript, PostgreSQL via `pg`, Tailwind CSS v4, Recharts.

---

### Task 1: Install DB Driver

**Files:**
- Modify: `dashboard/package.json`
- Modify: `dashboard/package-lock.json`

- [x] Add `pg` and `@types/pg` to the dashboard package.
- [x] Run `npm install pg @types/pg` in `dashboard`.
- [x] Verify `npm run build` still reaches TypeScript compilation.

### Task 2: Add DB Adapter

**Files:**
- Create: `dashboard/src/lib/db/postgres.ts`

- [x] Create a small server-only `query<T>()` helper.
- [x] Load DB env from `process.env`, with `DB_PASS`/`DB_PASSWORD` compatibility.
- [x] Map Docker-only `DB_HOST=fortress-db` to `localhost` for local dashboard execution.
- [x] Use a singleton `pg.Pool` on `globalThis` to avoid creating a pool per hot reload.

### Task 3: Add Whooing Repository

**Files:**
- Create: `dashboard/src/server/whooing/repository.ts`

- [x] Add SQL for latest sync status.
- [x] Add SQL for balance summary by account type using double-entry deltas.
- [x] Add SQL for current-month daily expense totals.
- [x] Add SQL for current-month expense categories.
- [x] Add SQL for key asset/liability accounts.
- [x] Add SQL for recent expense transactions.

### Task 4: Replace Mock Overview Service

**Files:**
- Modify: `dashboard/src/features/overview/service.ts`
- Modify: `dashboard/src/app/overview/page.tsx`

- [x] Make `getOverviewViewModel()` async.
- [x] Map repository rows into the existing `OverviewViewModel`.
- [x] Keep simple forecast logic local to the service.
- [x] Preserve the presentational component contracts.

### Task 5: Verify

**Files:**
- No new files.

- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Run dashboard locally and verify `/overview` renders with DB values.
- [x] Confirm no backend or ML files changed.
