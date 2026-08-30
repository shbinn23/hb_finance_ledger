# Import Operations Runbook

This runbook covers read-only readiness checks for the Pyeonhan Ledger Excel/Gmail import pipeline.
Whooing writes, automatic registration, card-benefit approval, and Gmail access require a separate,
explicit operator decision.

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
  appropriate delegation setup. Confirm the credential type before choosing the adapter.

The current repository contains a fail-closed runtime boundary and mock adapter tests. It does not contain
a live Gmail OAuth adapter and therefore cannot access Gmail by configuration alone.

## Review-only policies

- Refund/cashback rows can mean income, expense reversal, or card benefit. They are never automatic.
- 민생지원쿠폰 difference adjustments remain review-only until a balance-adjustment or support-income
  policy is explicitly chosen.
- Update and delete candidates are never automatically applied.

## Before any live operation

1. Back up PostgreSQL and record the latest import batch ID.
2. Confirm the source file hash has not already been processed.
3. Confirm automatic-create candidates and every proposed Whooing payload.
4. Confirm card-benefit candidates have a matched Whooing entry and no existing event.
5. Execute at most one explicitly approved live action, then verify mirror sync and idempotency before
   continuing.

## Rollback

Disable Gmail import and restart only the affected runtime. The read-only watcher must not mutate Gmail.
For database-backed import actions, retain batch and operation rows as an audit trail; do not delete them
to simulate rollback. Correct the source or mapping, then rerun dry-run reconciliation before any further
write.
