# Import Operations Runbook

This runbook covers the Pyeonhan Ledger Excel/Gmail import pipeline. Gmail access is always read-only.
In safe automatic mode, reconciliation may create only fully mapped new ledger entries and exact
card-benefit events; account creation and existing-entry updates still require explicit operator approval.

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
GMAIL_IMPORT_QUERY=has:attachment filename:xlsx newer_than:14d subject:(편한가계부 OR 가계부)
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

## Manual Gmail poll

Recommended email shape:

- Subject contains `편한가계부` or `가계부`.
- Attachment filename ends in `.xlsx` and is 5MB or smaller.
- Recommended operational query: `has:attachment filename:xlsx newer_than:14d subject:(편한가계부 OR 가계부)`.

In dry-run mode use `Gmail dry-run 확인`; in safe automatic mode use `Gmail 가져오기 실행`, or:

```bash
curl -fsS -X POST http://127.0.0.1:3000/api/imports/gmail/poll
```

The response reports `checkedMessages`, `foundAttachments`, `importedBatches`, `reusedBatches`, execution
counts, and safe errors. In dry-run mode it does not submit Whooing transactions or card-benefit events.
In safe automatic mode it may create only the allowlisted transactions and exact card-benefit events
described below. New Excel files create `review` batches; repeated Gmail attachment IDs or repeated
SHA-256 file content are reused/skipped.
Message-list pagination is followed until completion, and every OAuth/Gmail request has a bounded timeout.
Batch and row persistence is one database transaction; concurrent processing of the same file hash is
serialized before the existing review batch is reused.
Reused batches refresh only non-terminal reconciliation fields against the current mirror. Created,
updated, skipped, reviewed, and failed rows retain their audit state and operation history.

## Safe automatic operation

Use these flags only after migrations through `011_expand_import_benefit_selection.sql`, a fresh
database backup, healthy ETL, and a successful dry-run review:

```text
GMAIL_IMPORT_DRY_RUN_ONLY=false
GMAIL_IMPORT_AUTO_EXECUTE_ENABLED=true
GMAIL_IMPORT_AUTO_EXECUTE_SAFE_ONLY=true
GMAIL_IMPORT_ACCOUNT_CREATE_ENABLED=true
GMAIL_IMPORT_ACCOUNT_CREATE_REQUIRES_APPROVAL=true
```

All three write-mode conditions must agree before poll automation runs. The scheduled
`gmail-import-worker` calls the dashboard poll route at `GMAIL_IMPORT_POLL_INTERVAL_MS`; it owns no Gmail
or Whooing credential and logs counts only. A manual poll in `/imports` requires confirmation in this mode.

Automatically allowed:

- fully mapped, positive, non-duplicate `auto_creatable` expense/income rows;
- exact reciprocal asset transfers;
- `rule_matched` card-benefit candidates with matching mirror entry, card, amounts, and no existing event.

Discount detection uses only `approval_amount > posting_amount`; category names are not benefit evidence.
The active rule lookup validates card account, observed rate, and minimum approval amount. One exact
candidate is selected automatically. Multiple candidates require an operator selection, and zero candidates
leave the benefit in `rule_unknown` while the otherwise-safe ledger row remains creatable. A selected rule is
revalidated on the server before `app.card_benefit_events` stores approval, performance, posting, and discount
amounts separately. Whooing always receives the posting amount.

Never automatic:

- `possible_update` and `possible_delete` (single-row approval only), conflicts, incomplete mappings;
- refunds, cashback, 민생지원쿠폰/difference income, or uncertain card-benefit rules;
- new account creation. `/imports` shows a candidate, but the operator must confirm type, section, and name.

Approved account creation first refreshes the local account mirror and reuses an exact normalized account
when present. Otherwise it creates one normal Whooing account, stores the returned account id in an
`account_create` operation, refreshes the mirror, saves `app.import_mappings`, and re-polls. A failure after
Whooing creation is resumable without another account POST. Credit-card-like candidates remain blocked
because required card fields are absent from the spreadsheet.

To stop all automatic writes without disconnecting Gmail, set `GMAIL_IMPORT_DRY_RUN_ONLY=true`, restart
dashboard and worker, and confirm `/api/system/status` reports `autoExecuteEnabled=false`.

Before a live window:

```bash
mkdir -p backups
umask 177
docker compose exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > backups/pre_full_auto_import_execution_YYYYMMDD_HHMMSS.sql
chmod 600 backups/pre_full_auto_import_execution_YYYYMMDD_HHMMSS.sql
```

## 2026-08-31 supervised closeout

- Pre-write backup: `backups/pre_final_import_execution_20260831_010053.sql` (1,314,950 bytes, mode `0600`).
- Migration 008 was applied and its action-operation columns, checks, and unique indexes were verified.
- Gmail read-only poll checked 18 messages and 18 XLSX attachments: 6 existing batches were reused and
  12 invalid or non-target attachments were skipped. No duplicate batch or row was created.
- Before the supervised writes, latest batch `#20` contained 197 rows: 146 duplicates, 2 auto-creatable
  rows, 1 mapping-required row, 5 possible updates, and 43 review-required rows. It had 36 existing
  benefit events, no new rule-matched benefit candidate, and one uncertain benefit row.
- The supervised write window registered only row `1500` (10,400 KRW expense) and row `1501`
  (300,000 KRW asset transfer). Both Whooing writes and date-scoped mirror syncs succeeded. A repeated
  approval created zero additional entries, and duplicate operation-key counts remained zero.
- Row `1502` was not registered because `신한 9단적금` has no existing Whooing account. All possible
  updates, refunds/cashback, support-coupon adjustments, uncertain benefits, and delete candidates were
  left untouched.
- The final post-sync reconciliation retained 2 created rows, 146 duplicates, 1 mapping-required row,
  5 possible updates, 2 conflicts, and 41 review-required rows. One possible-delete suggestion remained
  review-only. Benefit evidence resolved to 35 existing events and 2 uncertain rows; no benefit event was
  inserted during this closeout.
- `GMAIL_IMPORT_DRY_RUN_ONLY=true` was restored immediately after verification. Enable `false` only for
  another supervised approval window, then restore `true` and restart dashboard.

## 2026-08-31 safe automatic operation closeout

This section supersedes the dry-run-only runtime state recorded in the supervised closeout above.

- Pre-write backup: `backups/pre_full_auto_import_execution_20260831_013719.sql` (1,378,015 bytes,
  mode `0600`).
- Migration 009 was applied and the resumable `account_create` operation fields and constraints were
  verified.
- Runtime mode is `dryRunOnly=false`, `autoExecuteEnabled=true`, `safeOnly=true`, with account creation
  enabled but always requiring explicit confirmation.
- The live Gmail poll checked 19 messages and 19 XLSX attachments. Seven existing batches were reused,
  no new batch was created, and no duplicate attachment or source-file batch was inserted.
- One clear asset candidate, `신한 9단적금`, was explicitly approved. Whooing created asset account
  `x100` (normalized title `신한9단적금`), the account mirror was refreshed, and the import mapping was
  saved. The resulting transfer row `1699` created Whooing entry `1468651` for 300,000 KRW.
- Whooing also generated its normal zero-value opening-balance entry `1468650` when the account was
  created. This explains the two-entry mirror increase during the account-create window; only one was an
  imported financial transaction.
- The final latest batch contains 1 created row, 148 duplicates, 5 possible updates, 2 conflicts, and
  41 review-required rows. Benefits contain 35 existing events, 2 review rows, and no exact new event.
- A manual re-poll and the scheduled worker's first poll both reported zero eligible executions and zero
  failures. Operation keys remain unique, so no account, entry, or benefit event was duplicated.
- `gmail-import-worker` remains active at the configured interval. It logs only poll counts and calls the
  same guarded dashboard route; it has no Gmail or Whooing credentials of its own.

### Safe `possible_update` execution

- A revision is eligible for `possible_update` only when persisted source evidence identifies one matched
  Whooing entry and the replacement has strong same-date, same-asset, and same-item evidence. Repeated item names on
  another date stay `conflict`; they are not treated as updates or automatic creates.
- A mirror-only similar row without previous snapshot linkage stays `conflict`, even when its date, amount,
  and account happen to match.
- Appended ledger metadata such as `승인금액`, `입금금액`, `이체금액`, and `src=` is ignored when comparing
  the source memo. Metadata-only differences therefore remain `duplicate`.
- A confirmed update rebuilds the full entry payload from server-side evidence and writes the Excel KRW
  value as Whooing `money` (posting amount). Discounted rows keep approval, performance, posting, and
  applied discount as separate `app.card_benefit_events` amounts.
- Immediately before PUT, the service reads the current Whooing entry and compares every persisted mirror
  field. Any remote change or lookup failure stops the update without writing.
- Successful `updated` rows remain authoritative on later polls. The deterministic update key includes
  source identity, content hash, and the target Whooing entry; the benefit key includes source identity
  and occurrence. Legacy update keys remain readable only for completed operations tied to the same
  entry, and repeated approval returns the existing result without another PUT or event insert.
- `conflict`, `mapping_required`, refund/cashback, support-coupon, and uncertain-rule rows remain
  review-only and must not enter automatic update execution.
- A delete approval re-reads and exactly compares the Whooing entry before calling
  `DELETE entries/:entry_id/:section_id.json`. It is blocked when a linked card-benefit event exists,
  and it never runs from Gmail automation.

## Review-only policies

- Refund/cashback rows can mean income, expense reversal, or card benefit. They are never automatic.
- 민생지원쿠폰 difference adjustments remain review-only until a balance-adjustment or support-income
  policy is explicitly chosen.
- Update and delete candidates require separate single-row confirmation. Deletion additionally requires
  the explicit `원장 거래 삭제` confirmation and current-source equality.

## Practical monthly snapshot validation

Use one full-month export after making these four controlled changes in 편한가계부: modify one existing
expense, add one asset, enter the reciprocal in/out rows for one transfer, and add one expense. Send the
export as a new Gmail attachment, then run `Gmail dry-run 확인` once.

- **Existing expense modification:** an unchanged source identity with a changed content hash is
  `possible_update`. When amount changes the identity, reconciliation links it only when the missing
  previous row and new row have strong same-date, same-asset, and same-item evidence. Date changes without stronger
  source evidence remain `conflict`. `/imports` shows the
  previous snapshot and current values plus mirror evidence. A confirmed single-row action rebuilds the
  full Whooing payload from persisted server evidence and uses `PUT entries/:entry_id.json`; it is never
  updated automatically from browser-supplied financial fields.
- **New asset:** an unknown source asset is `mapping_required`. The page shows affected rows, total
  posting amount, and conservative suggestions from existing Whooing accounts. Saving a confirmed
  mapping changes only `app.import_mappings`. When account creation is enabled, a clear non-card
  candidate can be created only after explicit operator confirmation; the account mirror and mapping are
  refreshed before reconciliation resumes.
- **Transfer:** reciprocal `이체출금` and `이체입금` rows merge only when date, amount, both assets, and
  memo agree. The UI states `2개 편한가계부 row → 1개 Whooing transfer`. Missing either account mapping
  keeps the transfer in `mapping_required`; an existing mirror transfer becomes `duplicate`.
- **New expense:** a positive, fully mapped, non-duplicate, non-review row is `auto_creatable`. The
  deterministic `pyeonhan:<source_identity_key>` operation key protects retries. With
  `GMAIL_IMPORT_DRY_RUN_ONLY=true`, both the UI and server reject the Whooing create action.

Automatic deletion is prohibited. A missing prior row is shown as `possible_delete`; only an explicit
single-row approval can delete the matching Whooing entry. Refund, cashback, support coupon, uncertain
card benefit, and delete rows never enter automatic creation.

Before disabling dry-run-only, verify ETL is online, the mirror is fresh, mappings are correct, every
candidate payload is reviewed, and the latest export produces no unexplained conflict. Enable at most one
explicitly approved write and verify its operation key and mirror result before continuing.

## `/imports` interpretation

- Approval candidates `0`, missing events `0`, and amount mismatches `0` is a normal fully reconciled state.
- `event_exists` means a matching structured card-benefit event already exists; do not approve it again.
- 신한 레이디 lunch rows must satisfy approval minus floor(5%) equals posting.
- MG+S simple-pay rows use the configured rule rate; MG+S subscription rows use their separate 50% rule.
- `auto_creatable` remains disabled operationally while Gmail is dry-run-only.
- Refund/cashback and 민생지원쿠폰 differences remain review-only. Deletes remain manual-only.

## Supervised approval rollout

1. Apply migrations through `011_expand_import_benefit_selection.sql` in order after taking a database
   backup. Until migration 011 is present, `/imports` must report benefit review as unavailable and keep
   mutation controls disabled.
2. Keep `GMAIL_IMPORT_DRY_RUN_ONLY=true`, poll or upload one workbook, save its review batch, resolve only
   mappings to existing accounts, and rerun reconciliation.
3. Inspect the persisted row ID, source evidence, mappings, matched mirror entry, approval/posting/discount
   amounts, and proposed action. New account creation is approval-only; automatic deletion is unsupported.
4. Set `GMAIL_IMPORT_DRY_RUN_ONLY=false` only for a supervised window and restart dashboard. Gmail polling
   remains read-only; the flag enables only explicitly confirmed create, update, and benefit actions.
5. Select exactly one `auto_creatable` row and confirm registration. For `possible_update`, approve exactly
   one row after checking the displayed before/after evidence. Benefit approval likewise requires one
   matched row, one rule, and no existing event.
6. Verify the operation history, deterministic operation key, returned Whooing entry ID, and local mirror.
   Repeat the same approval once only to verify reuse/duplicate blocking before expanding beyond one row.
7. Re-enable `GMAIL_IMPORT_DRY_RUN_ONLY=true` and restart dashboard when the supervised window ends.

Create, update, benefit, mapping, skip, and review actions are recorded in
`app.import_write_operations`. The retired `/api/imports/pyeonhan/apply` bulk endpoint returns HTTP 410;
operators must use persisted row approvals from `/imports`.

## Before any live operation

1. Back up PostgreSQL and record the latest import batch ID.
2. Confirm the source file hash has not already been processed.
3. Confirm automatic-create candidates and every proposed Whooing payload.
4. Confirm card-benefit candidates have a matched Whooing entry and no existing event.
5. Execute at most one explicitly approved live action, then verify mirror sync and idempotency before
   continuing.

Gmail access itself is read-only. With safe automatic mode disabled, poll writes only import review
metadata. With safe automatic mode enabled, the same poll may execute only allowlisted create and exact
benefit operations through their idempotent operation logs. The legacy bulk apply endpoint is retired;
do not use it.

## Common issues

- `disabled`: set `GMAIL_IMPORT_ENABLED=true` only after OAuth review and restart dashboard.
- `needs_credentials`: provide a personal OAuth refresh token; a service-account key is insufficient.
- Gmail read failure: verify the refresh token, readonly scope, query, and mounted file permissions.
- ETL offline or mirror stale: stop review and restore ETL health before trusting reconciliation.
- `mapping_required`: map an existing account or explicitly approve a clear non-card account candidate.
- only `event_exists`: all detected discounted transactions already have structured events.
- `auto_creatable` is zero: the snapshot is already mirrored or requires mappings/review; this is not an error.

## Rollback

Immediately set `GMAIL_IMPORT_DRY_RUN_ONLY=true` and restart dashboard to stop further create, update, and
benefit approvals. Disable Gmail import separately only when mailbox polling must also stop. The read-only
watcher must not mutate Gmail.
For database-backed import actions, retain batch and operation rows as an audit trail; do not delete them
to simulate rollback. Correct the source or mapping, then rerun dry-run reconciliation before any further
write.
