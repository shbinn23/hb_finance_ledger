# Import Benefit Rule Selection Design

## Goal

Make the Pyeonhan Ledger import review distinguish an observed card discount from the rule that explains it. A discounted row may still be registered to Whooing at its posting amount when the benefit rule is unknown, while a uniquely matched or explicitly selected rule may additionally create one structured `app.card_benefit_events` record.

This design preserves the existing review-first import workflow. Automatic deletion, refund/cashback/support-coupon execution, Gmail write access, and unsupervised Whooing mutation remain out of scope.

## Current Problem

The import currently uses one static classifier to answer two different questions:

1. Did a discount occur?
2. Which card-benefit rule produced it?

When `approval_amount > posting_amount`, the first answer is known from the spreadsheet. The second may still be uncertain because one card can have multiple active rules. Treating that uncertainty as a reason to block the whole row leaves valid ledger expenses unregistered and gives the review UI no safe way to select the correct rule.

The 2026-09-01 Hana MG+S row demonstrates the issue:

- approval amount: 25,250 KRW;
- posting amount: 22,725 KRW;
- observed discount: 2,525 KRW;
- observed rate: 10%;
- no current Whooing mirror entry.

The observed amounts prove that a discount occurred. The active rule set, not a hard-coded merchant classifier, must determine whether one rule can explain it.

## State Model

Ledger reconciliation and benefit reconciliation are independent axes.

### Ledger state

Existing row statuses remain authoritative for ledger actions, including `auto_creatable`, `possible_update`, `duplicate`, `conflict`, and review-only states. Benefit uncertainty does not downgrade an otherwise safe `auto_creatable` expense.

### Benefit state

`discountDetected` is computed from persisted amounts and is not a separate stored status:

```text
approval_amount > posting_amount
discount_amount = approval_amount - posting_amount
```

Persisted `benefit_status` uses these meanings:

| Status | Meaning |
| --- | --- |
| `not_applicable` | No observed discount or the row is not a supported card expense. |
| `rule_matched` | Exactly one active rule safely explains the observed discount. |
| `rule_selection_required` | Two or more active rules remain plausible; the user must select one. |
| `rule_unknown` | A discount exists but no active rule safely explains it. |
| `event_exists` | The matched Whooing entry already has a structured benefit event. |
| `approved`, `created`, `failed`, `skipped` | Existing execution lifecycle states. |
| `rule_uncertain`, `needs_review` | Legacy-readable states retained for compatibility but not emitted by new reconciliation. |

Add an additive migration, `migrations/011_expand_import_benefit_selection.sql`, which replaces only the `import_rows.benefit_status` check constraint and preserves existing values. No candidate table is added.

## Rule Candidate Resolution

### Inputs

For each discounted expense row, reconciliation uses:

- the mapped card account type and id;
- persisted approval, posting, and discount amounts;
- active `app.card_benefit_rules` for that card;
- rule rate, minimum approval amount, payment channel, cap tiers, and performance policy;
- source category, subcategory, item, and memo as supporting evidence.

The repository loads active rules in one read-only query and passes them into reconciliation. The pure resolver has no DB access.

### Monetary matching

Rate matching uses integer money arithmetic, not floating-point tolerance:

```text
theoretical_discount = floor(approval_amount * discount_rate_bps / 10000)
```

A rule is an exact monetary candidate when:

- it belongs to the mapped card;
- the approval amount meets its minimum;
- `theoretical_discount = observed_discount`;
- explicit source evidence does not contradict a rule restriction.

A positive discount smaller than the theoretical discount can be a cap-limited candidate only when the rule has a cap policy. Cap-limited candidates are shown as supporting choices but are never auto-selected solely from the amount. Monthly-cap uncertainty does not erase the observed discount.

Payment-channel, category, item, and memo evidence may strengthen a candidate. Missing evidence must not be invented. Explicitly contradictory evidence excludes the rule.

### Resolution result

- One exact candidate: `rule_matched`; persist its id in `benefit_rule_id` and preselect it in the UI.
- Multiple plausible candidates: `rule_selection_required`; leave `benefit_rule_id` null until the user selects one.
- No plausible candidate: `rule_unknown`; leave `benefit_rule_id` null and allow ledger-only handling.
- Existing event for the matched Whooing entry: `event_exists`, regardless of newly recalculated candidates.

Candidate options are recalculated from active rules whenever the row is displayed or acted upon. Only the user's final selection is persisted. This avoids duplicating rule configuration in an import-specific candidate table.

## Reconciliation Data Flow

1. Parse and normalize the spreadsheet amounts.
2. Load account mappings, mirror entries, existing benefit events, previous snapshots, and active card-benefit rules.
3. Reconcile the ledger row independently from benefit resolution.
4. If the row is a discounted mapped-card expense, resolve rule candidates.
5. Persist the ledger status, benefit status, selected unique rule if any, confidence, and a concise reason.
6. Return candidate metadata to the `/imports` model without persisting the candidate list.

Candidate metadata contains rule id, display name, rate, match kind (`exact` or `cap_limited`), and a short evidence reason. It contains no secret or raw Gmail content.

## Execution Boundaries

### Ledger-only registration

An `auto_creatable` expense may be registered at `posting_amount` when its benefit state is `rule_selection_required` or `rule_unknown`. The row remains visible as benefit-unresolved after the ledger operation succeeds.

### Rule selection and benefit application

Add one explicit endpoint:

```text
POST /api/imports/benefit-candidates/select-rule
```

Request:

```json
{
  "importRowId": 123,
  "selectedRuleId": "hana_mgs_simple_pay_10p",
  "action": "register_and_apply",
  "confirmed": true
}
```

Supported actions:

- `register_and_apply`: create or reuse the ledger entry, then create or reuse its benefit event.
- `benefit_only`: require an existing uniquely matched Whooing entry, then create or reuse its benefit event.

Rows with no safe candidate expose only the existing ledger registration action. The endpoint never accepts an arbitrary amount, card id, matched entry id, or rule definition from the client.

### Server validation

Before any write, the server reloads the import row and:

1. verifies same-origin and explicit confirmation;
2. verifies runtime capability and write gates;
3. recalculates candidates from current active rules;
4. verifies the selected rule belongs to the mapped card and remains plausible;
5. verifies approval, posting, and discount arithmetic;
6. verifies the ledger status permits the requested action;
7. reloads mirror/event evidence to prevent stale decisions;
8. reserves deterministic import and ledger operation keys.

The existing benefit approval endpoint may delegate to this orchestration path for backward compatibility. The import UI uses the new explicit endpoint.

## Partial Success and Idempotency

Ledger creation and benefit-event creation are sequential, separately idempotent operations:

1. Reserve or reuse the import ledger operation.
2. Create or reuse the Whooing entry.
3. Best-effort sync the entry date and resolve the local entry id.
4. Reserve or reuse the benefit operation.
5. Create or reuse the benefit event.

If ledger creation succeeds but sync or benefit creation fails, the ledger operation remains successful. The API reports that the ledger is registered and the benefit is pending or failed; it must not invite another ledger submission. A retry resumes from the unresolved stage and reuses the existing operation/result.

Duplicate protection remains layered:

- deterministic `app.ledger_write_operations.operation_key` for Whooing creation;
- deterministic `app.import_write_operations.operation_key` per import action;
- unique `(section_id, whooing_entry_id)` and event idempotency key for benefit events;
- current mirror/event evidence rechecked immediately before execution.

## Benefit Event Semantics

The implementation uses the current schema names in `app.card_benefit_events`:

- `whooing_entry_id` and `entry_date` identify the source ledger entry;
- `approval_amount` is the spreadsheet approval amount;
- `posting_amount` is the amount registered to Whooing;
- `eligible_discount_amount` is the rule-theoretical discount before a proven cap reduction;
- `applied_discount_amount` is the observed spreadsheet discount;
- `performance_amount` follows the selected rule's `performance_policy`;
- `rule_id` is the server-validated active rule;
- `evaluation_reason` records that the rule was uniquely resolved or user selected from import evidence;
- `idempotency_key` is derived from the import identity and Whooing entry, never from client text.

The event must satisfy `posting_amount = approval_amount - applied_discount_amount`. For a cap-limited observed discount, eligible discount may exceed applied discount; otherwise they are equal.

## Auto-Execution Policy

Safe auto execution remains conservative:

- `auto_creatable` plus no discount: existing ledger auto-registration policy.
- `auto_creatable` plus one exact rule candidate: ledger registration followed by benefit-event creation, subject to the existing write gates and idempotency.
- `auto_creatable` plus multiple or zero candidates: ledger registration only; benefit remains for review.
- existing ledger plus one exact rule candidate: benefit event may use the existing explicit approval policy; no automatic benefit-only write is introduced by this change.
- conflicts, possible deletes, refunds, cashback, support coupons, and account ambiguity remain review-only.

## `/imports` UX

Each discounted row shows one compact benefit block:

- approval, posting, discount, and observed rate;
- benefit status and reason;
- active candidate rules with rate and evidence;
- the matched ledger entry, when present.

Actions depend on state:

- one candidate: preselected rule and `선택 후 반영`;
- multiple candidates: required rule selector, no silent default, then `선택 후 반영`;
- no candidates: `적합한 활성 rule 없음` and `원장만 등록` when ledger-safe;
- existing ledger without event: `혜택만 반영`;
- existing event: disabled `반영됨`.

Confirmation states whether the action will write the Whooing ledger, the app benefit event, or both. A partial-success message explicitly says not to register the ledger again.

## Compatibility

- `/cards` continues to calculate approval and performance from structured events and statement/posting totals from events plus legacy mirror rows.
- Card-bill payment logic remains independent from import benefit resolution.
- Existing Gmail polling, attachment deduplication, possible-update/delete review, and account mapping remain unchanged.
- Existing `rule_uncertain` rows remain readable and are reclassified on the next reconciliation.
- No changes are made to Whooing schemas or existing ledger amounts.

## Testing

Add focused tests for:

1. discount detection independent from rule matching;
2. exact 10% resolution for 25,250 / 22,725 / 2,525;
3. unique, multiple, zero, and cap-limited candidate outcomes;
4. minimum amount and card-account validation;
5. ledger `auto_creatable` retained when benefit selection is unresolved;
6. ledger-only execution for unresolved benefit rows;
7. server rejection of stale, inactive, wrong-card, and non-candidate rule ids;
8. register-and-apply and benefit-only orchestration;
9. ledger success plus sync/benefit failure without duplicate ledger retry;
10. event amount/performance/idempotency semantics;
11. selector, disabled reasons, confirmation copy, and partial-success UI;
12. existing import, card-benefit, card-bill, Dashboard ledger, and Gmail regressions.

All Whooing writes use injected mocks. Verification uses the full Node suite, lint, production build, `git diff --check`, Docker dashboard rebuild, and read-only HTTP smoke. No valid live Whooing mutation is part of implementation verification.

## Rollout

1. Merge code with existing dry-run/write gates intact.
2. Review and apply migration 011 separately.
3. Re-run reconciliation for the latest import batch.
4. Confirm the 2026-09-01 Hana MG+S row shows one exact 10% candidate and remains ledger `auto_creatable`.
5. Preview the action and amounts before any supervised live approval.
6. Approve at most one row, then verify Whooing, mirror, event, `/imports`, and `/cards/benefits` before further use.

Operational rollback is to re-enable dry-run-only and disable import execution. Existing Whooing entries or benefit events are never automatically reversed.
