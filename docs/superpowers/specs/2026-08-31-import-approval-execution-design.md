# Import Approval Execution Design

## Goal

Turn the existing Gmail/Excel reconciliation review into an explicit, row-scoped approval workflow. Approved expense, income, and transfer rows may create Whooing entries; approved update rows may update one matched Whooing entry; exact card-benefit candidates may create one `app.card_benefit_events` row; and confirmed mappings may update `app.import_mappings`.

Development and verification remain non-live. No valid Whooing write, entry update, card-benefit approval, automatic registration, deletion, or account creation is executed while implementing this design.

## Policy

| Reconciliation state | Available action |
| --- | --- |
| `auto_creatable` expense/income/transfer | Explicit create approval |
| `possible_update` with one matched mirror entry | Explicit update approval |
| `rule_matched` benefit candidate | Explicit benefit approval |
| `mapping_required` | Confirmed mapping to an existing Whooing account |
| `review_required` | Mark reviewed or skip locally |
| `duplicate`, `event_exists` | No external write |
| `possible_delete`, `conflict`, uncertain benefit, refund/cashback/support coupon | Review only |

Automatic deletion and automatic Whooing account creation are not implemented. New assets must be created manually in Whooing and then mapped.

## Persistence

Add `migrations/008_expand_import_action_operations.sql`, but do not apply it during development. It extends `app.import_write_operations` without removing existing rows:

- allow operation types `create`, `update`, `benefit`, `skip`, `review`, and `mapping`;
- keep the existing `pending`, `created`, and `failed` statuses;
- make `row_id` nullable only for mapping operations;
- add nullable mapping subject fields for `mapping_type` and `source_key`;
- enforce that row actions have a row and mapping actions have a mapping subject;
- preserve unique `operation_key`, including the source content hash for update actions;
- replace the existing broad `(row_id, operation_type)` uniqueness with terminal uniqueness for create and benefit actions, while allowing a later content revision to produce a new update operation;
- extend `app.import_rows.status` with `updated`, `skipped`, and `reviewed` so completed local actions are not left looking actionable.

Runtime capability probing must verify the expanded constraint/columns. If migration 008 is not applied, execution endpoints return a safe unsupported response before any external or app-data write.

`app.ledger_write_operations` remains the idempotency authority for Whooing entry creation. `app.import_write_operations` records the import-facing action and outcome. Mapping remains idempotent through the existing mapping unique key plus its operation key.

## Server Components

### Import action repository

The repository loads persisted import-row evidence, reserves or reads an import operation, records outcomes, lists recent action history, and updates row/batch status. It never trusts client-supplied amounts, mappings, status, or matched entry ids.

### Import action service

The service supports these actions:

- `create`: load an `auto_creatable` row, rebuild its ledger request, and call the existing Dashboard ledger service;
- `update`: load a `possible_update` row and matched mirror entry, build a server-side Whooing update payload, call the update client, then best-effort sync the old and new dates;
- `benefit`: delegate to the existing benefit approval service after applying the import write gate;
- `mapping`: validate and save a mapping to an existing local Whooing account;
- `skip` and `review`: local metadata actions only.

Create actions use the existing deterministic ledger operation key. A repeated successful operation returns the stored result without another Whooing request. Sync failure after a successful create/update is reported as `pending`; it does not convert the external write into a failure or invite resubmission.

### Whooing update client

Add a minimal `PUT /entries/:entry_id.json` client using the existing authentication and safe error conventions. The payload is built entirely from persisted import/mapping evidence. It is only invoked for a unique positive matched entry id and never for delete candidates. Tests use an injected mock client; no live PUT is executed.

## API

- `POST /api/imports/actions/register`
  - body: confirmed `importRowIds`;
  - accepts only persisted `auto_creatable` rows;
  - supports expense, income, and transfer;
  - returns created, reused, skipped, failed, and sync summaries.
- `POST /api/imports/actions/approve-update`
  - body: one confirmed `importRowId`;
  - accepts only `possible_update` with matched mirror evidence.
- `POST /api/imports/actions/review`
  - body: one or more row ids plus `skip` or `review`;
  - local metadata only.
- Existing benefit and mapping endpoints remain, but use the shared confirmation, same-origin, capability, operation, and dry-run policies.

All mutation endpoints require same-origin requests and an explicit `confirmed: true`. Invalid input is rejected before capability checks. `GMAIL_IMPORT_DRY_RUN_ONLY=true` blocks create, update, and benefit writes with HTTP 409. Mapping and review metadata remain allowed because they do not modify Whooing or card-benefit facts.

## UI

`/imports` remains review-first and adds:

- row selection for eligible create actions;
- explicit create/update/benefit confirmation messages stating the destination data store;
- disabled reasons for dry-run-only, migration missing, invalid status, missing mapping, duplicates, and review-only policies;
- mapping confirmation and a required re-reconciliation refresh after save;
- recent operation history with action, status, target row, external entry id, sync state, and safe failure reason;
- poll result counts and automatic display of the latest batch.

The UI never offers delete or automatic account-create actions.

## Error and Partial-Success Handling

- Reserve/idempotency failure: no external request.
- Whooing create/update failure: operation `failed`, row remains retryable, safe error only.
- Whooing success plus sync failure: operation `created`, sync `pending`, user warned not to resubmit.
- Batch selection with mixed outcomes: return per-row results and aggregate `partial` semantics.
- Benefit event already present: return existing result without another insert.
- Mapping save repeated with the same target: return the existing mapping as success.

No raw payload, auth header, token, credential, or Gmail content is logged.

## Testing and Verification

Use injected mocks for all Whooing POST/PUT behavior. Cover expense, income, transfer, update, idempotent retry, partial sync, invalid states, mapping validation/idempotency, benefit duplicate/rule mismatch, dry-run blocking, UI disabled reasons, action history, and Gmail poll refresh.

Run the full Node test suite, lint, production build, `git diff --check`, Docker dashboard rebuild, and read-only HTTP smoke. Only invalid or dry-run-blocked mutation requests may be sent to the running app. No valid live mutation is part of verification.

## Rollout

1. Merge and deploy the code with dry-run-only still true.
2. Review and apply migration 008 separately.
3. Confirm capability status, ETL online state, and fresh mirror.
4. Send a current full-month export and review reconciliation.
5. Disable dry-run-only and restart only when ready for a supervised live test.
6. Approve exactly one new row, verify Whooing and mirror state, then proceed one row at a time.

Rollback is operational: re-enable dry-run-only immediately. Created or updated Whooing entries are not automatically reversed; correction is a separate explicit manual action. Automatic deletion remains prohibited.
