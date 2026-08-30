# Gmail Import Runtime Design

## Goal

Connect the existing Pyeonhan Ledger Gmail watcher boundary to a real, read-only Gmail REST adapter and a manually triggered dry-run import flow. The flow may persist import review metadata, but it must never write to Whooing, create card-benefit events, modify Gmail, or run sync.

## Security Boundary

- Gmail access uses only OAuth user credentials with the `gmail.readonly` scope.
- Credentials are loaded from explicit environment values or mounted files outside the repository.
- Service-account credentials are classified as unsupported for a personal Gmail mailbox unless domain-wide delegation is separately configured.
- Credentials, tokens, headers, mailbox addresses, and raw API bodies are never logged or returned.
- `GMAIL_IMPORT_ENABLED=false`, incomplete credentials, or `GMAIL_IMPORT_DRY_RUN_ONLY=false` all prevent the manual poll from accessing Gmail.

## Components

1. `gmail-credentials.ts` classifies supported credential sources and returns only the OAuth values needed internally.
2. `gmail-api-adapter.ts` refreshes an OAuth access token and performs Gmail message search, message metadata lookup, and XLSX attachment download through `fetch`.
3. `gmail-import-service.ts` runs one configured poll, applies message/attachment and file-hash deduplication, builds the existing reconciliation result, and creates or reuses a review batch.
4. `POST /api/imports/gmail/poll` exposes the manual, dry-run-only trigger and returns counts without secrets.
5. `/imports` shows runtime state and provides a clearly labeled Gmail dry-run trigger.

## Data Flow

`manual trigger -> credential guard -> Gmail query -> attachment download -> identity/hash dedup -> existing Excel parser -> reconciliation -> existing review batch or new review batch -> /imports result`

The batch remains `review`. `auto_creatable` rows are candidates only. Existing update/delete and refund/cashback/support-coupon policies remain review-only.

## Failure Handling

- Disabled runtime returns a client-safe disabled response without calling Gmail.
- Missing or unsupported credentials returns `needs_credentials` without calling Gmail.
- OAuth or Gmail API failures return a sanitized error and do not expose response bodies.
- Invalid/non-XLSX/oversized attachments are counted as errors and not imported.
- Duplicate Gmail identity or source hash reuses/skips prior work and never creates duplicate batches.

## Verification

- TDD covers credential classification, fail-closed behavior, Gmail REST parsing, attachment deduplication, batch reuse, route status, and UI labels.
- Existing import, ledger, card-benefit, card-bill, KST, PeriodFilter, ML, and Accounting tests remain green.
- A real Gmail read-only search is attempted only if the provided credential is a supported user OAuth credential.
