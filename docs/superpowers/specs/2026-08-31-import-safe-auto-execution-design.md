# Safe Gmail Import Auto-execution Design

## Goal

Turn the existing Gmail read-only import pipeline into an operationally safe automation path without allowing uncertain reconciliation results to mutate Whooing.

## Operating contract

- Gmail access remains `gmail.readonly`.
- Automatic execution requires all three conditions: dry-run is off, auto-execute is on, and safe-only is on.
- Only `auto_creatable` expense/income rows, exact transfer pairs, and exact `rule_matched` benefit candidates may execute automatically.
- `possible_update` remains an explicit single-row approval action.
- `possible_delete`, conflicts, refunds, cashback, subsidy/coupon differences, uncertain card rules, and incomplete mappings remain review-only.
- Existing operation keys and import write-operation reservations remain the idempotency boundary.

## Account creation

An unmapped import source becomes an account creation candidate only when its mapping type implies one unambiguous Whooing account type and the title and section are valid. Account creation always requires an explicit confirmation request.

The server revalidates the candidate against the latest batch, refreshes the local account mirror, and checks for an existing exact account before issuing a Whooing account POST. A persisted `account_create` operation stores the returned account id so a retry can resume mirror refresh and mapping without creating another account. After mapping, the Gmail import is polled once again so affected rows are reconciled under the normal safe-only execution policy.

Credit-card-like liability candidates are blocked because a valid Whooing credit-card account needs product-specific fields that the spreadsheet does not provide.

## Runtime

The poll route performs read-only Gmail retrieval and reconciliation first. It then evaluates the environment policy and, when enabled, executes only eligible creates and exact benefit events. The response reports executed, blocked, failed, and operation identifiers without exposing credentials or mail content.

A lightweight dashboard-image worker calls the poll route at the configured interval. It does not contain Gmail credentials itself and does not call any ledger write route directly.

## Failure handling

- Gmail or credential failure is fail-closed.
- Individual write failures are recorded and do not unlock review-only rows.
- A Whooing account POST followed by mirror/mapping failure is resumable using the stored Whooing account id.
- Sync failures remain best-effort and are surfaced in operation results.
- Re-polling the same attachment reuses the batch and operation keys, producing no duplicate account, entry, transfer, or benefit event.

## Deployment

The database migration adds only the account-create operation capability. Secrets stay in ignored local files. Production flags are documented in `.env.example`; the real local override is changed only after backup and migration verification.
