# Import Approval Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit, idempotent approval workflow that can create or update approved Whooing entries, create exact card-benefit events, and save local mappings while remaining fail-closed in dry-run-only mode.

**Architecture:** Extend the existing import persistence contract with migration 008, then add a row-scoped action repository and service that rebuild actions exclusively from persisted evidence. Existing ledger creation, benefit approval, mapping, and sync components remain authoritative; a minimal Whooing PUT client is added only for approved `possible_update` rows.

**Tech Stack:** Next.js App Router, TypeScript, Node test runner, PostgreSQL, existing Whooing API client, React.

**Spec:** `docs/superpowers/specs/2026-08-31-import-approval-execution-design.md`

## Global Constraints

- Do not apply migrations or execute valid Whooing, card-benefit, Gmail, or ledger writes during development verification.
- `GMAIL_IMPORT_DRY_RUN_ONLY` defaults to true and blocks create, update, and benefit execution.
- Gmail remains read-only; automatic delete and automatic account creation remain unsupported.
- Every mutation requires same-origin validation, explicit confirmation, capability validation, and an operation key.
- Never log credentials, tokens, auth headers, raw Gmail contents, or raw authenticated payloads.
- Preserve Dashboard ledger entry, card bill, card benefit, ML, and Accounting behavior.

---

### Task 1: Expand the import action persistence contract

**Files:**
- Create: `migrations/008_expand_import_action_operations.sql`
- Modify: `dashboard/src/server/import/import-migration-contract.test.ts`

**Interfaces:**
- Produces: operation types `create | update | benefit | skip | review | mapping`, nullable `row_id` only for mapping, mapping subject columns, and row statuses `updated | skipped | reviewed`.

- [ ] **Step 1: Write failing migration contract tests** asserting transaction protection, operation types, row/mapping subject checks, status expansion, and update-compatible uniqueness.
- [ ] **Step 2: Run** `node --experimental-strip-types --test dashboard/src/server/import/import-migration-contract.test.ts` and verify the migration-008 assertions fail because the file does not exist.
- [ ] **Step 3: Add migration 008** using additive `alter table`, dropping only the superseded constraints/index, adding mapping subject columns and checks, and creating partial unique indexes for terminal create/benefit operations.
- [ ] **Step 4: Re-run the migration contract test** and verify it passes without applying the migration.
- [ ] **Step 5: Commit** with `feat: expand import action operation schema`.

### Task 2: Add import action request and repository boundaries

**Files:**
- Modify: `dashboard/src/server/import/import-actions.ts`
- Modify: `dashboard/src/server/import/import-actions.test.ts`
- Modify: `dashboard/src/server/import/import-repository.ts`
- Create: `dashboard/src/server/import/import-action-repository.test.ts`

**Interfaces:**
- Produces: `parseImportCreateRequest`, `parseImportUpdateRequest`, `parseImportReviewRequest`, `getImportActionCapabilities`, `loadImportActionRow`, `reserveImportAction`, `finishImportAction`, `listImportActionHistory`.
- Consumes: existing persisted import rows, mappings, mirror entries, and `app.import_write_operations`.

- [ ] **Step 1: Write failing parser tests** for explicit confirmation, positive row ids, review actions, and invalid mixed payloads.
- [ ] **Step 2: Run the parser tests** and confirm they fail for missing functions.
- [ ] **Step 3: Implement minimal pure request parsers** and keep existing mapping parsing behavior intact.
- [ ] **Step 4: Write failing repository tests** for migration-008 capability detection, server-side row evidence loading, operation reuse, outcome recording, and safe history output.
- [ ] **Step 5: Run repository tests** and confirm the expected missing repository functions fail.
- [ ] **Step 6: Implement repository functions** with parameterized SQL, no client-supplied financial evidence, and safe error fields only.
- [ ] **Step 7: Run both test files** and verify green.
- [ ] **Step 8: Commit** with `feat: add import action persistence boundary`.

### Task 3: Implement approved create and review actions

**Files:**
- Create: `dashboard/src/server/import/import-action-service.ts`
- Create: `dashboard/src/server/import/import-action-service.test.ts`
- Create: `dashboard/src/app/api/imports/actions/register/route.ts`
- Create: `dashboard/src/app/api/imports/actions/review/route.ts`
- Modify: `dashboard/src/server/import/import-action-routes.test.ts`

**Interfaces:**
- Produces: `executeApprovedImportCreates({ rowIds, dependencies })` and `executeImportReviewAction({ rowIds, action, dependencies })`.
- Consumes: existing `createRuntimeDashboardLedgerEntry`, import repository evidence, deterministic ledger operation keys, and sync status returned by the ledger service.

- [ ] **Step 1: Write failing service tests** for expense, income, transfer, duplicate operation reuse, mixed partial outcomes, sync pending, invalid status, possible-delete rejection, and conflict rejection.
- [ ] **Step 2: Run the service tests** and verify failures are caused by the missing service.
- [ ] **Step 3: Implement minimal create/review orchestration** that accepts only persisted eligible rows and delegates payload construction/write idempotency to the existing ledger service.
- [ ] **Step 4: Re-run service tests** and verify green.
- [ ] **Step 5: Write failing route contract tests** for same-origin, confirmation, invalid input before gate checks, dry-run 409, missing migration 503, and no external call on blocked requests.
- [ ] **Step 6: Implement register/review routes** with dependency-free runtime adapters and aggregate per-row results.
- [ ] **Step 7: Run route and service tests** and verify green.
- [ ] **Step 8: Commit** with `feat: add approved import create actions`.

### Task 4: Implement explicitly approved Whooing updates

**Files:**
- Modify: `dashboard/src/server/whooing/write-client.ts`
- Create: `dashboard/src/server/whooing/write-client.test.ts`
- Modify: `dashboard/src/server/import/import-action-service.ts`
- Modify: `dashboard/src/server/import/import-action-service.test.ts`
- Create: `dashboard/src/app/api/imports/actions/approve-update/route.ts`
- Modify: `dashboard/src/server/import/import-action-routes.test.ts`
- Remove: `dashboard/src/app/api/imports/updates/approve/route.ts`

**Interfaces:**
- Produces: `updateWhooingEntry(entryId, payload)` using `PUT entries/:entry_id.json`, and approved update execution from one persisted `possible_update` row.
- Consumes: server-loaded matched mirror entry, resolved mappings, persisted source content hash, and best-effort date sync.

- [ ] **Step 1: Write failing write-client tests** asserting PUT path/method, section id preservation, partial update form payload, safe error behavior, and rejection of invalid entry ids.
- [ ] **Step 2: Run the write-client tests** and verify the missing update function fails.
- [ ] **Step 3: Implement the minimal update client** by sharing the existing authenticated request conventions without adding delete/account APIs.
- [ ] **Step 4: Write failing action-service tests** for unique matched entry requirement, persisted diff payload, content-hash operation key, idempotent reuse, dry-run blocking, and sync pending after successful PUT.
- [ ] **Step 5: Run the action-service tests** and confirm expected failures.
- [ ] **Step 6: Implement update orchestration and the new route**, then remove the obsolete 501 route.
- [ ] **Step 7: Run write-client, service, and route tests** and verify green.
- [ ] **Step 8: Commit** with `feat: add approved import update actions`.

### Task 5: Unify mapping and benefit approval safeguards

**Files:**
- Modify: `dashboard/src/app/api/imports/account-mappings/route.ts`
- Modify: `dashboard/src/app/api/imports/benefit-events/route.ts`
- Modify: `dashboard/src/server/import/pyeonhan-benefit-approval.ts`
- Modify: `dashboard/src/server/import/pyeonhan-benefit-approval.test.ts`
- Modify: `dashboard/src/server/import/import-action-routes.test.ts`

**Interfaces:**
- Produces: operation-logged mapping and benefit approvals using the same confirmation, origin, capability, and dry-run policy as create/update actions.

- [ ] **Step 1: Write failing route/service tests** for missing confirmation, invalid origin, dry-run benefit blocking, migration capability failure, mapping idempotency, duplicate event reuse, and rule/card mismatch.
- [ ] **Step 2: Run targeted tests** and confirm the current routes fail the new policy assertions.
- [ ] **Step 3: Add shared guards and operation recording** while preserving mapping as an allowed local metadata action under dry-run-only.
- [ ] **Step 4: Re-run targeted tests** and verify green.
- [ ] **Step 5: Commit** with `feat: secure import mapping and benefit approvals`.

### Task 6: Turn `/imports` into the approval console

**Files:**
- Modify: `dashboard/src/features/imports/imports-page.tsx`
- Modify: `dashboard/src/features/imports/imports-page.test.ts`
- Modify: `dashboard/src/server/import/gmail-import-runtime.ts`
- Modify: `dashboard/src/server/import/gmail-import-runtime.test.ts`

**Interfaces:**
- Consumes: latest batch rows, dry-run/capability state, operation history, existing poll endpoint, and action endpoints.
- Produces: eligible row selection, create/update/benefit confirmations, mapping/review actions, disabled reasons, action results, operation history, and poll-result refresh.

- [ ] **Step 1: Write failing UI/model tests** for eligible filters, blocked reasons, no delete/account-create control, confirmation copy, operation history, poll result counts, and latest-batch refresh.
- [ ] **Step 2: Run UI/runtime tests** and verify failures represent missing approval-console behavior.
- [ ] **Step 3: Implement the smallest UI changes** using existing components and layout, keeping review rows compact and all live action buttons disabled under dry-run-only.
- [ ] **Step 4: Re-run UI/runtime tests** and verify green.
- [ ] **Step 5: Commit** with `feat: add import approval console`.

### Task 7: Document rollout and verify without live writes

**Files:**
- Modify: `docs/import-operations-runbook.md`

**Interfaces:**
- Produces: operator steps for poll, mapping, create/update/benefit approval, dry-run release, rollback, idempotency, and prohibited review-only cases.

- [ ] **Step 1: Update the runbook** with the supervised one-row rollout and rollback-by-reenabling-dry-run policy.
- [ ] **Step 2: Run targeted tests** for import actions, migrations, benefit approval, Gmail runtime, ledger payload/idempotency, and imports UI.
- [ ] **Step 3: Run the complete Node test suite** with `node --experimental-strip-types --test $(rg --files dashboard/src | rg '\\.test\\.(ts|tsx)$')`.
- [ ] **Step 4: Run** `npm run lint`, `npm run build`, and `git diff --check` from `dashboard` where applicable.
- [ ] **Step 5: Rebuild only the dashboard** with `docker compose --profile etl --profile ml up -d --build dashboard`.
- [ ] **Step 6: Perform read-only HTTP smoke** for `/overview`, `/ledger`, `/imports`, `/cards`, `/cards/benefits`, `/cards/bills`, `/assets`, `/accounting`, `/ml`, `/api/system/status`, and `/api/ledger/entry-options`; send only invalid or dry-run-blocked mutation requests.
- [ ] **Step 7: Inspect git diff and staged files** for credentials, tokens, Gmail content, `.env`, and secret files; confirm migration 008 was not applied and no valid mutation ran.
- [ ] **Step 8: Commit documentation** with `docs: finalize import execution runbook`.
- [ ] **Step 9: Push** `main` to `origin/main`, then verify `git status -sb` is clean and `git rev-list --left-right --count origin/main...main` is `0 0`.

## Self-Review

- Spec coverage: persistence, create/update/review, benefit/mapping safeguards, dry-run gate, UI, operation history, Gmail refresh, docs, tests, Docker, and rollout are assigned to Tasks 1-7.
- Placeholder scan: no deferred implementation placeholders are used; intentionally unsupported delete/account-create operations are explicit product policy.
- Type consistency: create/update/review parsers feed the action service; repository functions provide persisted evidence and operation outcomes; UI consumes route results and capability/history state.
