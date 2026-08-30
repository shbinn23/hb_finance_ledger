# Gmail Import Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Gmail read-only attachment discovery to the existing Pyeonhan Ledger review-batch pipeline through a manual dry-run trigger.

**Architecture:** A credential loader and REST adapter sit behind the existing fail-closed watcher interface. A small import coordinator hands downloaded XLSX files to existing dry-run/review-batch services, and one API route plus `/imports` control exposes the result without enabling Whooing writes.

**Tech Stack:** Next.js 16, TypeScript, native `fetch`, PostgreSQL, Node test runner

**Spec:** `docs/superpowers/specs/2026-08-30-gmail-import-runtime-design.md`

## Global Constraints

- Gmail scope is read-only.
- No Whooing write, sync, automatic registration, event approval, Gmail mutation, or automatic deletion.
- `GMAIL_IMPORT_DRY_RUN_ONLY` defaults to true and is required for the poll route.
- Secret values and raw authenticated responses must never be logged or returned.

---

### Task 1: Credential security and classification

**Files:**
- Create: `dashboard/src/server/import/gmail-credentials.ts`
- Test: `dashboard/src/server/import/gmail-credentials.test.ts`

**Interfaces:**
- Produces: `loadGmailOAuthCredentials(env)` and `classifyGmailCredentialDocument(value)`.

- [ ] Write tests for explicit OAuth env, authorized-user JSON, incomplete OAuth, and service-account rejection.
- [ ] Run the focused test and verify the new exports are missing.
- [ ] Implement secret-safe credential loading and classification.
- [ ] Run the focused test and verify it passes.

### Task 2: Gmail REST adapter

**Files:**
- Create: `dashboard/src/server/import/gmail-api-adapter.ts`
- Test: `dashboard/src/server/import/gmail-api-adapter.test.ts`
- Modify: `dashboard/src/server/import/gmail-watcher.ts`

**Interfaces:**
- Consumes: OAuth credentials from Task 1.
- Produces: `createGmailApiAdapter({ credentials, fetchImpl })` implementing `GmailWatcherAdapter`.

- [ ] Write tests for token refresh, message search, XLSX attachment extraction, and sanitized failures.
- [ ] Run tests and verify failure because the adapter is absent.
- [ ] Implement the minimal REST calls and base64url decoding.
- [ ] Run tests and verify pass.

### Task 3: Dry-run import poll coordinator

**Files:**
- Create: `dashboard/src/server/import/gmail-import-service.ts`
- Test: `dashboard/src/server/import/gmail-import-service.test.ts`
- Modify: `dashboard/src/server/import/import-repository.ts`

**Interfaces:**
- Consumes: `pollConfiguredGmailAttachmentsOnce`, `buildPyeonhanDryRun`, review-batch repository functions.
- Produces: `pollGmailImportOnce(dependencies)` returning checked, found, imported, reused, duplicate, and error counts.

- [ ] Write tests for disabled runtime, new review batch, Gmail identity duplicate, and source-hash reuse.
- [ ] Run tests and verify failure because coordinator/repository support is absent.
- [ ] Add optional Gmail IDs to review-batch persistence and implement the coordinator.
- [ ] Run tests and verify pass.

### Task 4: Manual route and imports UI

**Files:**
- Create: `dashboard/src/app/api/imports/gmail/poll/route.ts`
- Test: `dashboard/src/app/api/imports/gmail/poll/route.test.ts`
- Modify: `dashboard/src/features/imports/imports-page.tsx`
- Modify: `dashboard/src/features/imports/imports-page.test.ts`

**Interfaces:**
- Consumes: `pollGmailImportOnce`.
- Produces: `POST /api/imports/gmail/poll` and a dry-run-only trigger.

- [ ] Write route and source-level UI tests for disabled, missing credentials, success counts, and action labels.
- [ ] Run tests and verify expected failures.
- [ ] Implement the route and UI with no automatic registration action.
- [ ] Run tests and verify pass.

### Task 5: Operations documentation and final verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/import-operations-runbook.md`

- [ ] Document credential formats, chmod, scope, manual poll, status meanings, troubleshooting, and write boundaries.
- [ ] Run all dashboard tests, lint, build, diff check, and HTTP smoke.
- [ ] Attempt a real read-only Gmail search only when credential classification is supported.
- [ ] Commit functional changes and documentation separately, then push `main`.
