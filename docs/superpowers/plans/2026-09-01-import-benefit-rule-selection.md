# Import Benefit Rule Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect imported card discounts from amounts, resolve active DB rule candidates, allow safe user selection, and keep ledger registration independent from unresolved benefits.

**Architecture:** Add a pure rule-candidate resolver fed by active rules from the import repository. Reconciliation persists only the resolved status/final rule, while candidate lists are recalculated for display and execution. Existing ledger create and benefit approval operations remain separately idempotent and are composed by one selection endpoint.

**Tech Stack:** Next.js App Router, React, TypeScript, PostgreSQL, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-01-import-benefit-rule-selection-design.md`

## Global Constraints

- Whooing ledger amounts use `posting_amount`.
- Benefit events store approval, performance, posting, and applied discount separately.
- No live Whooing write, Gmail write, sync, or valid mutation request during verification.
- Existing review-only policies for refunds, cashback, support coupons, conflicts, and deletes remain unchanged.
- Candidate selection is always revalidated on the server.

---

### Task 1: Benefit selection schema contract

**Files:**
- Create: `migrations/011_expand_import_benefit_selection.sql`
- Modify: `dashboard/src/server/import/import-migration-contract.test.ts`

**Interfaces:**
- Produces persisted statuses `rule_selection_required` and `rule_unknown` while preserving every migration 007 status.

- [ ] Write a migration contract test requiring an additive transaction-wrapped constraint replacement.
- [ ] Run the migration contract test and confirm it fails because migration 011 is absent.
- [ ] Add migration 011 that drops/recreates only `import_rows_benefit_status_check` with old and new values.
- [ ] Run the migration contract test and confirm it passes.
- [ ] Commit with `feat: add import benefit selection states`.

### Task 2: Active-rule candidate resolver

**Files:**
- Modify: `dashboard/src/server/import/pyeonhan-card-benefit.ts`
- Modify: `dashboard/src/server/import/pyeonhan-card-benefit.test.ts`

**Interfaces:**
- Produces `resolvePyeonhanCardBenefitCandidates(transaction, mappedCard, activeRules)` returning `{ status, selectedRuleId, candidates }`.
- Candidate contains rule id, label, rate, performance policy, match kind, confidence, and reason.

- [ ] Add failing tests for amount-based discount detection, exact one/multiple/zero candidates, minimum amount, wrong card, and cap-limited behavior.
- [ ] Add the 25,250 approval / 22,725 posting / 2,525 discount MG+S regression test and confirm RED.
- [ ] Implement integer monetary matching against supplied active DB rules; remove category dependence from discount detection.
- [ ] Preserve only narrowly useful source evidence as candidate evidence, not as the primary discount detector.
- [ ] Run the resolver tests and confirm GREEN.
- [ ] Commit with `feat: resolve imported card benefit rules`.

### Task 3: Reconciliation and repository integration

**Files:**
- Modify: `dashboard/src/server/import/pyeonhan-reconciliation.ts`
- Modify: `dashboard/src/server/import/pyeonhan-reconciliation.test.ts`
- Modify: `dashboard/src/server/import/import-repository.ts`
- Modify: `dashboard/src/server/import/pyeonhan-dry-run.ts`
- Modify: `dashboard/src/server/import/import-action-repository.test.ts`

**Interfaces:**
- Produces `getActiveImportCardBenefitRules()` and passes rules into `reconcilePyeonhanTransactions`.
- `ReconciledImportRow` exposes `cardBenefitCandidates` and keeps `cardBenefitCandidate` as the unique selected candidate for compatibility.

- [ ] Add failing reconciliation tests proving unresolved benefits do not block `auto_creatable` ledger status.
- [ ] Add failing repository source tests for active-rule loading and selected-rule persistence.
- [ ] Implement active-rule loading and rule-aware reconciliation.
- [ ] Persist the unique rule only; leave `benefit_rule_id` null for multiple/zero candidates.
- [ ] Update summary counts so selection-required/unknown are benefit review counts.
- [ ] Run reconciliation/repository/import tests and confirm GREEN.
- [ ] Commit with `feat: reconcile import benefit candidates`.

### Task 4: Server-validated selection and execution

**Files:**
- Create: `dashboard/src/server/import/import-benefit-selection.ts`
- Create: `dashboard/src/server/import/import-benefit-selection.test.ts`
- Create: `dashboard/src/app/api/imports/benefit-candidates/select-rule/route.ts`
- Modify: `dashboard/src/server/import/import-repository.ts`
- Modify: `dashboard/src/server/import/pyeonhan-benefit-approval.ts`
- Modify: `dashboard/src/server/import/pyeonhan-benefit-runtime.ts`
- Modify: `dashboard/src/server/import/import-action-routes.test.ts`

**Interfaces:**
- API accepts `{ importRowId, selectedRuleId, action, confirmed }` where action is `register_and_apply` or `benefit_only`.
- Service reloads persisted row/rules/mirror evidence, recalculates candidates, then reuses existing ledger-create and benefit-operation paths.

- [ ] Add failing tests for invalid/wrong-card/inactive/rate/min-amount rule selection.
- [ ] Add failing tests for ledger-only safety, register-and-apply, benefit-only, duplicate event, and ledger-success/benefit-pending behavior.
- [ ] Implement request parsing, same-origin/dry-run/capability gates, and deterministic operation reuse.
- [ ] Update benefit approval to accept a server-validated selected rule and preserve posting/approval/performance/discount semantics.
- [ ] Run selection, approval, operation, route, and Dashboard ledger regression tests.
- [ ] Commit with `feat: apply selected import benefit rules`.

### Task 5: `/imports` rule selection UI

**Files:**
- Modify: `dashboard/src/features/imports/imports-page.tsx`
- Modify: `dashboard/src/features/imports/imports-page.test.ts`

**Interfaces:**
- Renders candidate selector and actions from server-provided candidate metadata.
- Sends only row id, selected rule id, action, and confirmation.

- [ ] Add failing source/render tests for amount evidence, unique preselection, required multi-candidate selection, zero-candidate ledger-only copy, and action labels.
- [ ] Extend benefit status labels and candidate model.
- [ ] Add the selector, server action call, confirmation copy, loading lock, and partial-success message.
- [ ] Keep existing update/delete/mapping actions unchanged.
- [ ] Run imports page and action-route tests.
- [ ] Commit with `feat: add import benefit rule review`.

### Task 6: Automation, documentation, and release verification

**Files:**
- Modify: `dashboard/src/server/import/import-auto-execution.ts`
- Modify: `dashboard/src/server/import/import-auto-execution.test.ts`
- Modify: `docs/import-operations-runbook.md`

**Interfaces:**
- Auto execution creates the ledger for safe unresolved rows but creates a benefit event only for one exact candidate.

- [ ] Add failing automation tests for unique candidate full execution and multiple/zero candidate ledger-only execution.
- [ ] Implement the minimal policy change and update the runbook.
- [ ] Run all import, card-benefit, card-bill, Dashboard ledger, period, and Gmail tests.
- [ ] Run `npm run lint`, `npm run build`, and `git diff --check` from `dashboard`/repository as appropriate.
- [ ] Rebuild dashboard with `docker compose --profile etl --profile ml up -d --build dashboard`.
- [ ] Perform read-only HTTP smoke for `/imports`, `/cards/benefits`, `/overview`, and safe GET endpoints; send only invalid mutation requests where needed.
- [ ] Verify no secret files are staged, commit final documentation/verification changes, and push `main` to `origin/main`.
