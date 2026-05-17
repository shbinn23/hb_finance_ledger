import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBackfillDryRun,
  matchMgsEvidence,
  proposeShinhanLadyBackfill,
  reverseFivePercentApproval,
  type CardBackfillEntry,
} from "./backfill-2026-05-dry-run.ts";

const baseEntry: CardBackfillEntry = {
  entryId: 1,
  entryDay: 20260506,
  entryDate: "20260506.0000",
  item: "아워홈",
  memo: "",
  postingAmount: 7_315,
  expenseAccountId: "x-expense",
  cardAccountId: "x50",
  cardTitle: "신한레이디",
  hasExistingBenefitEvent: false,
};

test("reverseFivePercentApproval uses memo approval to resolve floor ambiguity", () => {
  const result = reverseFivePercentApproval(7_315, "[MIG] approval=7700; net=7315; discount=385");

  assert.deepEqual(result, {
    status: "success",
    approvalAmount: 7_700,
    appliedDiscountAmount: 385,
  });
});

test("reverseFivePercentApproval rejects ambiguous approval without memo evidence", () => {
  const result = reverseFivePercentApproval(7_315, "");

  assert.equal(result.status, "failed");
  assert.equal(result.reason, "ambiguous_approval");
});

test("proposeShinhanLadyBackfill creates a manual 5 percent event proposal", () => {
  const proposal = proposeShinhanLadyBackfill({
    ...baseEntry,
    memo: "[MIG] approval=7700; net=7315; discount=385",
  });

  assert.equal(proposal.kind, "proposed");
  assert.equal(proposal.row.ruleId, null);
  assert.equal(proposal.row.evaluationStatus, "manual_backfill");
  assert.equal(proposal.row.evaluationReason, "shinhan_lady_manual_5p_backfill");
  assert.equal(proposal.row.approvalAmount, 7_700);
  assert.equal(proposal.row.performanceAmount, 7_700);
  assert.equal(proposal.row.appliedDiscountAmount, 385);
  assert.equal(proposal.row.postingAmount, 7_315);
});

test("matchMgsEvidence matches image evidence by day and posting amount", () => {
  const match = matchMgsEvidence({
    entryId: 2,
    entryDay: 20260510,
    entryDate: "20260510.0003",
    item: "세차",
    memo: "",
    postingAmount: 17_100,
    cardAccountId: "x45",
    cardTitle: "하나MGS",
    hasExistingBenefitEvent: false,
  });

  assert.equal(match.status, "matched");
  assert.equal(match.evidence?.approvalAmount, 19_000);
  assert.equal(match.evidence?.appliedDiscountAmount, 1_900);
});

test("matchMgsEvidence reverse-calculates the 1 won MG+S image mismatch from posting amount", () => {
  const match = matchMgsEvidence({
    entryId: 3,
    entryDay: 20260505,
    entryDate: "20260505.0001",
    item: "유류비",
    memo: "",
    postingAmount: 63_680,
    cardAccountId: "x45",
    cardTitle: "하나MGS",
    hasExistingBenefitEvent: false,
  });

  assert.equal(match.status, "reverse_calculated");
  assert.equal(match.evidence?.approvalAmount, 70_756);
  assert.equal(match.expectedPostingAmount, 63_681);
  assert.equal(match.approvalAmount, 70_755);
  assert.equal(match.appliedDiscountAmount, 7_075);
});

test("buildBackfillDryRun proposes all processable rows including reverse-calculated MG+S rows", () => {
  const result = buildBackfillDryRun([
    {
      ...baseEntry,
      memo: "[MIG] approval=7700; net=7315; discount=385",
    },
    {
      ...baseEntry,
      entryId: 2,
      cardAccountId: "x45",
      cardTitle: "하나MGS",
      entryDay: 20260510,
      entryDate: "20260510.0003",
      item: "세차",
      postingAmount: 17_100,
    },
    {
      ...baseEntry,
      entryId: 3,
      cardAccountId: "x45",
      cardTitle: "하나MGS",
      entryDay: 20260505,
      entryDate: "20260505.0001",
      item: "유류비",
      postingAmount: 63_680,
    },
    {
      ...baseEntry,
      entryId: 4,
      cardAccountId: "x51",
      cardTitle: "롯데라이킷",
      postingAmount: 20_000,
      hasExistingBenefitEvent: true,
    },
  ]);

  assert.equal(result.totalCount, 4);
  assert.equal(result.skippedExistingEventCount, 1);
  assert.equal(result.proposedRows.length, 3);
  assert.equal(result.confirmationRequired.length, 0);
  assert.equal(result.proposedRows[0].evaluationReason, "shinhan_lady_manual_5p_backfill");
  assert.equal(result.proposedRows[1].ruleId, "hana_mgs_simple_pay_10p");
  assert.equal(result.proposedRows[2].evaluationReason, "mgs_backfill_reverse_calculated_from_posting");
  assert.equal(result.proposedRows[2].approvalAmount, 70_755);
});
