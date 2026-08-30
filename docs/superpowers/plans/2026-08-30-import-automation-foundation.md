# Import Automation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add observable ETL/mirror status, durable ledger write safety, and a review-first 편한가계부 Excel import pipeline with mock-tested automatic creation of only unambiguous new transactions.

**Architecture:** Keep Whooing as the ledger source of truth and `whooing.*` as a read mirror. New `app.*` tables provide optional durable operation/import state; runtime code explicitly degrades when migrations are not applied. Excel uploads are parsed and reconciled server-side, while Gmail remains an adapter interface without OAuth or network access.

**Tech Stack:** Next.js 16, React 19, TypeScript, PostgreSQL, Node test runner, ExcelJS, FastAPI ETL health endpoint.

**Spec:** User-approved 2026-08-30 task request in this Codex task.

## Global Constraints

- Do not execute live Whooing writes, valid syncs, Gmail access, or migrations.
- Do not write production DB data while implementing or verifying.
- Do not expose secrets, tokens, raw authorization headers, or raw Whooing payloads.
- Preserve Dashboard ledger entry, card bills, card benefits, ML, and Accounting behavior.
- Automatic import creation is limited to mapped, unambiguous new rows; updates, deletes, discounts without an explicit rule, and conflicts remain review-only.

---

### Task 1: System Status

**Files:**
- Create: `dashboard/src/server/system/system-status.ts`
- Create: `dashboard/src/server/system/system-status-repository.ts`
- Create: `dashboard/src/server/system/system-status.test.ts`
- Create: `dashboard/src/app/api/system/status/route.ts`
- Create: `dashboard/src/components/layout/system-status-pill.tsx`
- Modify: `dashboard/src/components/layout/shell.tsx`
- Modify: `dashboard/src/app/globals.css`

**Interfaces:**
- Produces: `getSystemStatus()` returning ETL status, mirror activity/freshness, and nullable pending count.
- Consumes: existing ETL `GET /health`, PostgreSQL query helper, and `whooing.entries.synced_at`.

- [ ] Write failing tests for ETL online/offline/unknown, 24-hour freshness, stale mirrors, and missing operation table.
- [ ] Run the status tests and confirm failures are caused by missing status implementation.
- [ ] Implement pure classification plus injected fetch/repository dependencies.
- [ ] Add the read-only repository and `GET /api/system/status` route.
- [ ] Add a compact topbar status component that labels mirror time as an estimate.
- [ ] Run focused tests, lint, build, and commit `feat: add etl health and mirror freshness status`.

### Task 2: Partial-Success Ledger Writes

**Files:**
- Modify: `dashboard/src/server/whooing/sync-client.ts`
- Modify: `dashboard/src/server/whooing/sync-client.test.ts`
- Modify: `dashboard/src/server/ledger/ledger-entry-service.ts`
- Modify: `dashboard/src/server/ledger/ledger-entry-service.test.ts`
- Modify: `dashboard/src/app/api/ledger/entries/route.ts`
- Modify: `dashboard/src/components/layout/dashboard-ledger-entry-dialog.tsx`
- Modify: `dashboard/src/components/layout/shell-actions.test.ts`

**Interfaces:**
- Produces: typed `syncReason`, `benefitStatus`, and success responses that remain successful after post-write failures.
- Consumes: existing Whooing write client, card benefit repository, and best-effort sync client.

- [ ] Write failing tests for ETL unavailable/timeout/error classification and benefit-event failure after successful Whooing creation.
- [ ] Run focused tests and confirm the current implementation reports the wrong result.
- [ ] Add reason-bearing `WhooingLocalSyncError` and classify fetch failures without logging secrets.
- [ ] Split Whooing creation, benefit persistence, and local sync into independent result boundaries.
- [ ] Update the dialog copy for reason-specific pending states while retaining resubmit prevention.
- [ ] Run focused tests and regression tests.

### Task 3: Durable Ledger Operation Foundation

**Files:**
- Create: `migrations/004_create_ledger_write_operations.sql`
- Create: `dashboard/src/server/ledger/ledger-operation-repository.ts`
- Create: `dashboard/src/server/ledger/ledger-operation-repository.test.ts`
- Modify: `dashboard/src/server/ledger/ledger-entry-service.ts`
- Modify: `dashboard/src/server/ledger/ledger-entry-service.test.ts`
- Modify: `dashboard/src/app/api/ledger/entries/route.ts`
- Modify: `dashboard/src/components/layout/dashboard-ledger-entry-dialog.tsx`

**Interfaces:**
- Produces: `LedgerOperationStore` with `reserve`, `markCreated`, and `markFailed`; table absence returns `supported: false`.
- Consumes: client-generated operation key retained for retries and regenerated only for a new form transaction.

- [ ] Write failing tests for table-absent degradation, reservation, created duplicate replay, and pending duplicate blocking.
- [ ] Run tests and verify the idempotency behavior is absent.
- [ ] Add the idempotent migration and schema-aware repository.
- [ ] Integrate optional operation reservation before Whooing POST and completion immediately after entry creation.
- [ ] Add `crypto.randomUUID()` form keys and preserve them across retries.
- [ ] Run focused tests, lint, build, and commit `fix: make ledger writes idempotent and partial-success aware`.

### Task 4: Excel Parser

**Files:**
- Modify: `dashboard/package.json`
- Modify: `dashboard/package-lock.json`
- Create: `dashboard/src/server/import/pyeonhan-types.ts`
- Create: `dashboard/src/server/import/pyeonhan-excel-parser.ts`
- Create: `dashboard/src/server/import/pyeonhan-excel-parser.test.ts`

**Interfaces:**
- Produces: `parsePyeonhanWorkbook(buffer)` and `parsePyeonhanRows(rows)` returning normalized transactions.
- Consumes: the exact 11-column positional contract, including duplicate `자산` headers and Excel serial dates.

- [ ] Add ExcelJS as the sole parser dependency.
- [ ] Write failing tests for headers, serial dates, row types, reciprocal transfers, occurrence indexes, and discount candidates.
- [ ] Run tests and confirm parser functions are missing.
- [ ] Implement strict positional validation, normalization, transfer pairing, and SHA-256 identity/content hashes.
- [ ] Run parser tests.

### Task 5: Reconciliation and Import Persistence Foundation

**Files:**
- Create: `migrations/005_create_pyeonhan_import_tables.sql`
- Create: `dashboard/src/server/import/import-repository.ts`
- Create: `dashboard/src/server/import/pyeonhan-reconciliation.ts`
- Create: `dashboard/src/server/import/pyeonhan-reconciliation.test.ts`

**Interfaces:**
- Produces: row statuses `auto_creatable`, `duplicate`, `mapping_required`, `possible_update`, `possible_delete`, `conflict`, and `review_required`.
- Consumes: normalized rows, local account/category mappings, one-to-one mirror candidates, and optional prior import snapshots.

- [ ] Write failing tests for exact mappings, one-to-one duplicate matching, mapping gaps, content changes, missing prior rows, and dry-run summaries.
- [ ] Run tests and confirm reconciliation is missing.
- [ ] Add normalized import tables with uniqueness and foreign-key constraints.
- [ ] Implement schema-aware repositories that perform no persistence when tables are absent.
- [ ] Implement conservative reconciliation: discounted rows without explicit benefit rules and difference-income rows require review.
- [ ] Run reconciliation tests.

### Task 6: Mock-Tested Auto Registration and Imports UI

**Files:**
- Create: `dashboard/src/server/import/pyeonhan-import-service.ts`
- Create: `dashboard/src/server/import/pyeonhan-import-service.test.ts`
- Create: `dashboard/src/app/api/imports/pyeonhan/dry-run/route.ts`
- Create: `dashboard/src/app/api/imports/pyeonhan/apply/route.ts`
- Create: `dashboard/src/features/imports/imports-page.tsx`
- Create: `dashboard/src/features/imports/imports-page.test.ts`
- Create: `dashboard/src/app/imports/page.tsx`
- Modify: `dashboard/src/components/layout/sidebar.tsx`
- Modify: `dashboard/src/app/globals.css`

**Interfaces:**
- Produces: a multipart dry-run route and a confirmed apply route that reparses/reconciles the workbook server-side.
- Consumes: only `auto_creatable` rows; import tables and durable ledger operations must exist before apply.

- [ ] Write failing tests for mock auto-create success, operation duplicate blocking, and exclusion of update/delete/conflict rows.
- [ ] Run tests and confirm the import service is missing.
- [ ] Implement the import service through the shared ledger entry service with injected mockable dependencies.
- [ ] Add size/type-validated multipart routes; keep dry-run read-only and require migrated durable tables for apply.
- [ ] Add the minimal `/imports` upload, summary, comparison table, confirmation, and migration-required states.
- [ ] Run focused tests and route/UI source tests.

### Task 7: Gmail Adapter Skeleton and Documentation

**Files:**
- Create: `dashboard/src/server/import/gmail-watcher.ts`
- Create: `dashboard/src/server/import/gmail-watcher.test.ts`
- Modify: `README.md`

**Interfaces:**
- Produces: a credential-free watcher interface and processed-message identity helper.
- Consumes: downloaded attachment bytes supplied by a future OAuth adapter; performs no Gmail network access.

- [ ] Write a failing test for message/attachment deduplication keys and attachment handoff.
- [ ] Implement the interface and pure helper without OAuth code.
- [ ] Document query env names, polling flow, review policy, and required credentials.
- [ ] Run tests, lint, build, and commit `feat: add pyeonhan import reconciliation and auto registration`.

### Task 8: Verification and Delivery

**Files:**
- Verify only; no new production behavior.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: three verified commits pushed to `origin/main`.

- [ ] Run all Node tests and confirm no test performs a live Whooing, Gmail, sync, or migration action.
- [ ] Run `git diff --check`, `npm run lint`, and `npm run build`.
- [ ] Rebuild only the Dashboard container if needed for read-only HTTP smoke.
- [ ] Smoke all requested pages and safe GET/invalid POST endpoints; do not upload or apply a workbook.
- [ ] Push `main`, then verify `origin/main...main` is `0 0` and the worktree is clean.

## Self-Review

- Spec coverage: status, partial success, durable idempotency, import schema/parser/reconciliation, mock auto-registration, UI, Gmail skeleton, verification, commits, and push are assigned.
- Safety: migration execution, live writes, valid sync, Gmail access, and automatic deletes are excluded.
- Data integrity: identical source rows remain distinct through occurrence indexes and mirror matches are one-to-one.
- Runtime compatibility: absent migrations degrade status/dry-run safely; automatic apply is disabled rather than silently losing idempotency.
