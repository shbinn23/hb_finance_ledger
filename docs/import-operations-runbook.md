# Import Operations Runbook

This runbook covers the Pyeonhan Ledger Excel/Gmail import pipeline. Gmail access is read-only and
creates only import review metadata. Whooing writes, automatic registration, and card-benefit approval
require a separate, explicit operator decision.

## Docker startup and health

```bash
docker compose --profile etl --profile ml up -d --build
docker compose ps
curl -fsS http://127.0.0.1:3000/api/system/status
```

The minimum import runtime is `db`, `dashboard`, and `etl-service`. `ml-engine` is unrelated to import.

## Runtime readiness

1. Confirm `db`, `dashboard`, and `etl-service` are healthy.
2. Read `GET /api/system/status` and verify:
   - `mirror.freshness` is `fresh`.
   - `pendingSyncCount` is zero.
   - `importOperations.supported` is true.
   - Gmail is `disabled` or `needs_credentials` until OAuth is intentionally connected.
   - `gmailImport.dryRunOnly` remains true for initial operation.
3. Open `/imports` and run an Excel dry-run. Do not select automatic registration during readiness checks.

An approval-candidate count of zero is normal when discounted rows are already linked to matching
`app.card_benefit_events`. The safe state is: candidate zero, event missing zero, and amount mismatch zero.

## Read-only reconciliation queries

```sql
select id, status, total_count, review_count, duplicate_count, source_file_hash, created_at
from app.import_batches
order by id desc
limit 5;

select benefit_status, count(*)
from app.import_rows
where batch_id = (select max(id) from app.import_batches)
group by benefit_status
order by benefit_status;

select count(*) as duplicate_event_links
from (
  select benefit_event_id
  from app.import_rows
  where batch_id = (select max(id) from app.import_batches)
    and benefit_event_id is not null
  group by benefit_event_id
  having count(*) > 1
) duplicates;
```

The Excel dry-run additionally compares approval, performance, posting, and discount amounts against the
linked event. Any missing event or amount mismatch remains review-only.

## Gmail OAuth preparation

- Use the minimum `gmail.readonly` scope.
- Keep credential and token files outside the repository and mount them read-only.
- Restrict local file permissions to the service account only, for example mode `0600`.
- Never print credential, token, authorization header, or raw OAuth response values.
- Keep `GMAIL_IMPORT_ENABLED=false` until both the adapter and credentials have been reviewed.
- Keep `GMAIL_IMPORT_DRY_RUN_ONLY=true` for the first live mailbox checks.
- A service-account credential does not normally grant access to a personal Gmail mailbox without an
  appropriate Workspace domain delegation. This runtime rejects it for personal Gmail.

For a personal Gmail mailbox, complete Google OAuth consent with scope
`https://www.googleapis.com/auth/gmail.readonly` and keep the resulting `authorized_user` JSON containing
`client_id`, `client_secret`, and `refresh_token` outside the repository. Configure either:

Create the `authorized_user` credential once with a Google Cloud **Desktop app** OAuth client JSON:

```bash
cd dashboard
npm run gmail:oauth -- \
  --client /absolute/path/client_secret.json \
  --output "$HOME/.config/hb_finance_ledger/gmail-authorized-user.json"
chmod 600 "$HOME/.config/hb_finance_ledger/gmail-authorized-user.json"
```

The command opens the system browser, requests only `gmail.readonly`, uses a loopback callback with PKCE,
and stores only the long-lived `authorized_user` fields. It does not print OAuth values. If Google revokes
or expires the refresh token, rerun the same command and replace the local output file. Do not use a
service-account JSON for a personal Gmail mailbox.

```text
GMAIL_IMPORT_ENABLED=true
GMAIL_IMPORT_DRY_RUN_ONLY=true
GMAIL_OAUTH_CREDENTIAL_PATH=/run/secrets/gmail-authorized-user.json
GMAIL_API_TIMEOUT_MS=15000
```

or the three `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, and
`GMAIL_OAUTH_REFRESH_TOKEN` values. Never commit either form. If client metadata and the user token are
separate files, use `GMAIL_CREDENTIALS_FILE` plus `GMAIL_TOKEN_FILE` (or `GMAIL_TOKEN_PATH`).

For Docker Compose, mount the host credential explicitly with a local override that is never committed:

```yaml
services:
  dashboard:
    volumes:
      - /absolute/host/path/gmail-authorized-user.json:/run/secrets/gmail-authorized-user.json:ro
```

Keep the dashboard bound to localhost, or place it behind an authenticated reverse proxy. Browser poll
requests are restricted to the dashboard origin; direct operator requests without an `Origin` header are
supported for local `curl` use.

Missing, unsupported, or invalid credentials fail closed as `needs_credentials`; the runtime does not
fall back to Gmail access or any ledger write. Enabling Gmail import only enables read-only search,
attachment download, reconciliation, and import review metadata persistence.

## Manual Gmail dry-run

Recommended email shape:

- Subject contains `편한가계부` or `가계부`.
- Attachment filename ends in `.xlsx` and is 5MB or smaller.
- Default query: `has:attachment filename:xlsx subject:(편한가계부 OR 가계부)`.

Use the `Gmail dry-run 확인` button on `/imports`, or:

```bash
curl -fsS -X POST http://127.0.0.1:3000/api/imports/gmail/poll
```

The response reports `checkedMessages`, `foundAttachments`, `importedBatches`, `reusedBatches`, and safe
errors. It never submits Whooing transactions or card-benefit events. New Excel files create `review`
batches; repeated Gmail attachment IDs or repeated SHA-256 file content are reused/skipped.
Message-list pagination is followed until completion, and every OAuth/Gmail request has a bounded timeout.
Batch and row persistence is one database transaction; concurrent processing of the same file hash is
serialized before the existing review batch is reused.

## Review-only policies

- Refund/cashback rows can mean income, expense reversal, or card benefit. They are never automatic.
- 민생지원쿠폰 difference adjustments remain review-only until a balance-adjustment or support-income
  policy is explicitly chosen.
- Update and delete candidates are never automatically applied.

## `/imports` interpretation

- Approval candidates `0`, missing events `0`, and amount mismatches `0` is a normal fully reconciled state.
- `event_exists` means a matching structured card-benefit event already exists; do not approve it again.
- 신한 레이디 lunch rows must satisfy approval minus floor(5%) equals posting.
- MG+S simple-pay rows use the configured rule rate; MG+S subscription rows use their separate 50% rule.
- `auto_creatable` remains disabled operationally while Gmail is dry-run-only.
- Refund/cashback, 민생지원쿠폰 differences, updates, and deletes remain review-only.

## Before any live operation

1. Back up PostgreSQL and record the latest import batch ID.
2. Confirm the source file hash has not already been processed.
3. Confirm automatic-create candidates and every proposed Whooing payload.
4. Confirm card-benefit candidates have a matched Whooing entry and no existing event.
5. Execute at most one explicitly approved live action, then verify mirror sync and idempotency before
   continuing.

Gmail poll itself is not a live Whooing operation. It may write only `app.import_batches` and
`app.import_rows` review metadata. Do not call `/api/imports/pyeonhan/apply` during Gmail readiness checks.

## Common issues

- `disabled`: set `GMAIL_IMPORT_ENABLED=true` only after OAuth review and restart dashboard.
- `needs_credentials`: provide a personal OAuth refresh token; a service-account key is insufficient.
- Gmail read failure: verify the refresh token, readonly scope, query, and mounted file permissions.
- ETL offline or mirror stale: stop review and restore ETL health before trusting reconciliation.
- `mapping_required`: configure the account/category mapping; do not force automatic creation.
- only `event_exists`: all detected discounted transactions already have structured events.
- `auto_creatable` is zero: the snapshot is already mirrored or requires mappings/review; this is not an error.

## Rollback

Disable Gmail import and restart only the affected runtime. The read-only watcher must not mutate Gmail.
For database-backed import actions, retain batch and operation rows as an audit trail; do not delete them
to simulate rollback. Correct the source or mapping, then rerun dry-run reconciliation before any further
write.
