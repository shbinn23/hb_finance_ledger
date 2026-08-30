# Import Benefit Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Pyeonhan Excel review batches durable, allow idempotent operator-approved card-benefit event creation, and expose a safely disabled Gmail runtime boundary.

**Architecture:** Keep dry-run read-only, add an explicit review-save action, and approve benefits only from persisted import rows. The approval service reloads every amount, mapping, rule, mirror entry, and duplicate signal on the server before inserting only `app.card_benefit_events`. Gmail remains an adapter-driven read-only poller with configuration status and no bundled OAuth/network client.

**Tech Stack:** Next.js 16, React 19, TypeScript, PostgreSQL 16, Node test runner.

**Spec:** `/Users/shbinn/.codex/attachments/7377f627-4b1b-4592-b205-e53a4811ed5f/pasted-text.txt`

## Global Constraints

- Never issue a live Whooing write, valid ledger POST, sync, Gmail request, or automatic delete.
- Preserve Dashboard entry, cards, accounting, ML, and existing auto-create behavior.
- Only `auto_creatable` rows may enter the existing ledger-write path.
- Updates, deletes, refunds, cashback, and support-coupon adjustments remain review-only.

---

### Task 1: Durable benefit-review schema

**Files:**
- Create: `migrations/007_add_import_benefit_review.sql`
- Modify: `dashboard/src/server/import/import-migration-contract.test.ts`

- [ ] Write migration contract tests for benefit status, candidate metadata, and event linkage.
- [ ] Run the contract test and verify RED.
- [ ] Add a transactional additive migration with safe checks and indexes.
- [ ] Run the contract test and verify GREEN.

### Task 2: Review persistence and approval service

**Files:**
- Modify: `dashboard/src/server/import/import-repository.ts`
- Create: `dashboard/src/server/import/pyeonhan-benefit-approval.ts`
- Create: `dashboard/src/server/import/pyeonhan-benefit-approval.test.ts`
- Create: `dashboard/src/app/api/imports/pyeonhan/review/route.ts`
- Create: `dashboard/src/app/api/imports/benefit-events/route.ts`

- [ ] Write failing tests for invariant validation, card/rule mismatch, missing mirror entries, and duplicate events.
- [ ] Run focused tests and verify RED.
- [ ] Implement review-only batch persistence and dependency-injected approval logic.
- [ ] Implement routes that accept only file review-save or import row/rule approval identifiers.
- [ ] Run focused tests and verify GREEN.

### Task 3: Reconciliation and operator UI

**Files:**
- Modify: `dashboard/src/server/import/pyeonhan-card-benefit.ts`
- Modify: `dashboard/src/server/import/pyeonhan-reconciliation.ts`
- Modify: `dashboard/src/features/imports/imports-page.tsx`
- Modify: associated tests and `dashboard/src/app/globals.css`

- [ ] Write failing tests for benefit status/counts and protected review-only reasons.
- [ ] Run focused tests and verify RED.
- [ ] Add candidate status/amount/rate/confidence metadata without changing ledger reconciliation.
- [ ] Add status filtering, review-save, candidate approval confirmation, and policy copy.
- [ ] Run focused tests and verify GREEN.

### Task 4: Gmail runtime readiness

**Files:**
- Modify: `dashboard/src/server/import/gmail-watcher.ts`
- Modify: `dashboard/src/server/import/gmail-watcher.test.ts`
- Modify: `.env.example`, `README.md`, and system status files.

- [ ] Write failing tests for query/config status, disabled credentials, and mock polling.
- [ ] Run focused tests and verify RED.
- [ ] Implement read-only config and adapter orchestration without OAuth/network calls.
- [ ] Expose non-secret readiness in system status and imports UI.
- [ ] Run focused tests and verify GREEN.

### Task 5: Local migration and end-to-end verification

- [ ] Back up the local database and apply migration 007 only.
- [ ] Verify schema constraints and indexes with read-only SQL.
- [ ] Run the real Excel dry-run and save a review batch without approving or auto-registering.
- [ ] Run full tests, lint, build, diff check, rebuild dashboard, and HTTP smoke.
- [ ] Commit feature units, push `origin/main`, and confirm zero divergence.
