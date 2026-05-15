# Whooing Data Layer Stabilization Design

## Goal

Make Whooing the trusted source for the portfolio's finance analytics while preserving the local `whooing.*` schema as a faithful mirror of the Whooing API. Differences from the previous Easy Household Account Book reporting model should be documented, not hidden by reshaping the Whooing DB into the old model.

## Current State

- Whooing main account data has been reset, migrated, and visually verified against the latest Easy Household Account Book balance screenshots.
- `whooing.entries` is synchronized from Whooing API for `20250731` through `20260515`.
- The final Whooing API snapshot and local `whooing.entries` contain the same `1701` `entry_id` values.
- `whooing.entries` expense totals match `report.fact_transactions` when using transaction-level expense totals.
- Existing dashboard-style monthly spending uses `report.vw_raw_daily_spending`, which calculates daily net spending as `abs(sum(net_amount))`; this is an Easy Household Account Book reporting convention and should not force changes to the Whooing API mirror schema.

## Scope

Phase 1 documents and stabilizes the Whooing data foundation only. It does not redesign the dashboard UI, add ML models, build agent automation, or alter the Whooing mirror schema to imitate the previous source app.

Included:

- Reliable Whooing API to local DB synchronization.
- Verification queries for API snapshot count, local DB count, and `entry_id` parity.
- Documentation of metric definitions, especially expense totals, net daily spending, cashback/discount rows, checkcard behavior, and card payment handling.
- Clear separation between Whooing-native metrics and legacy Easy Household Account Book metrics.
- Tests around sync pagination and data parity where practical.

Excluded:

- Next.js page redesign.
- New machine-learning models.
- Gmail or notification-based auto-registration.
- Whooing API mutation beyond explicit migration or sync commands.
- Changing `whooing.*` tables or sync behavior to preserve legacy Easy Household Account Book reporting semantics.
- Creating dashboard-facing views that make Whooing data look like the old source app unless the view name and documentation explicitly mark them as legacy compatibility.

## Metric Definitions

### Transaction Expense Total

Transaction expense total is the sum of all expense-side money values.

In Whooing terms:

```sql
SUM(money)
WHERE l_account = 'expenses'
```

This answers: "How much expense-side activity was recorded?"

### Legacy Dashboard Net Spending

Legacy dashboard net spending follows the existing `report.vw_raw_daily_spending` behavior:

1. Group source transactions by date.
2. Sum signed `net_amount` values for `transaction_type = '지출'`.
3. Take `abs()` at the daily level.
4. Sum daily values by month.

This answers: "How much did spending reduce net cashflow after same-day positive expense offsets?"

This is not the preferred Phase 1 dashboard direction. It is retained as a documented comparison point because it explains why the old dashboard numbers differ from raw Whooing expense totals.

Whooing `money` is always positive, so this metric cannot be derived from `whooing.entries` alone for migrated data. If this legacy metric is needed for audit or comparison, it must be clearly labeled as legacy compatibility and use the migration source reference in `memo`:

```text
[MIG] ... src=<report.fact_transactions.transaction_id>
```

Then join to `report.fact_transactions` to recover the original signed `net_amount`.

### Whooing-Native Expense Total

Whooing-native expense total should be the default basis for the next dashboard iteration:

```sql
SUM(money)
WHERE l_account = 'expenses'
```

This follows the Whooing entry model directly. Positive expense offsets from the previous app should appear as migrated expense-side activity unless a future dashboard view intentionally classifies them separately as discounts, cashback, or settlements.

### Positive Expense Rows

Positive `net_amount` rows with `transaction_type = '지출'` are not migration errors. They represent cases such as:

- 통신할인
- 캐시백
- 정산
- refund-like corrections encoded by the source app as positive expenses

They explain the difference between legacy net spending and Whooing-native expense totals. Phase 1 should document them, not rewrite Whooing entries or the Whooing mirror schema around them.

## Data Surface Principles

### `whooing.entries`

Raw synchronized Whooing API entries. This table is the local mirror of Whooing data and should remain close to the API payload.

Required behavior:

- Upsert all fetched entries by `entry_id`.
- Delete local entries in the sync range that no longer exist in Whooing.
- Preserve `entry_date`, account sides, `money`, `total`, `memo`, and `app_id`.
- Avoid hidden filtering in the sync layer.

### Dashboard Layer

The next dashboard should read from Whooing-shaped data. It may add read-only reporting views, but those views should:

- Keep `whooing.*` tables unchanged.
- Use Whooing account semantics first.
- Make derived metrics explicit in names and documentation.
- Avoid silently mixing Whooing-native and legacy Easy Household Account Book semantics.

### Legacy Comparison Layer

A legacy comparison query may remain in documentation or tests to prove migration parity, but it should not become the default dashboard model.

Required behavior if kept:

- Extract UUID from `[MIG] src=...`.
- Join to `report.fact_transactions`.
- Reproduce `report.vw_raw_daily_spending` only for audit/comparison.
- Label outputs as legacy or migration-audit metrics.

## Verification

Phase 1 is complete only when these checks pass:

- Whooing API snapshot count equals local `whooing.entries` count for the migration period.
- API `entry_id` set equals local DB `entry_id` set.
- The documented Whooing-native monthly expense total matches direct `whooing.entries` aggregation.
- The documented legacy comparison query explains the known differences from `vw_raw_daily_spending`.
- Unit tests for sync pagination and data parity pass.

## Risks

- Future Whooing-native manual entries will not have `[MIG] src=...`; this is another reason not to make `[MIG] src` the foundation of the dashboard.
- If Easy Household Account Book exports change the meaning of positive expense rows, dashboard net spending semantics should be revisited.
- `memo` is a bridge for migrated history, not a permanent domain key. It can support audit documentation, but not the primary dashboard contract.

## Out Of Phase Follow-Ups

- Add dashboard API endpoints backed by Whooing-native metrics.
- Add a data quality page that shows sync recency, count parity, and metric parity.
- Add agent-safe deduplication keys for future automatic Whooing registration.
