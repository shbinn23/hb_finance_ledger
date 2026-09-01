import assert from "node:assert/strict";
import test from "node:test";
import type { CardBenefitRule } from "../../lib/card-benefits/types.ts";
import type { NormalizedPyeonhanTransaction } from "./pyeonhan-types.ts";
import { reconstructPyeonhanBenefitAmounts } from "./pyeonhan-benefit-reconstruction.ts";

function transaction(overrides: Partial<NormalizedPyeonhanTransaction> = {}): NormalizedPyeonhanTransaction {
  return {
    sourceRowIndexes: [2],
    occurredDate: "2026-08-15",
    entryType: "expense",
    sourceAssetName: "하나 MG+S",
    counterpartyAssetName: null,
    sourceCategoryName: "선택",
    sourceSubcategoryName: "쇼핑",
    item: "카카오페이 결제",
    memo: "",
    postingAmount: 47_000,
    approvalAmount: 47_000,
    discountAmount: 0,
    currency: "KRW",
    occurrenceIndex: 1,
    sourceIdentityKey: "a".repeat(64),
    sourceContentHash: "b".repeat(64),
    transferPairComplete: true,
    ...overrides,
  };
}

function rule(overrides: Partial<CardBenefitRule> = {}): CardBenefitRule {
  return {
    ruleId: "hana_mgs_simple_pay_10p",
    cardAccountType: "liabilities",
    cardAccountId: "x45",
    name: "하나 MG+S 간편결제 10%",
    status: "active",
    priority: 10,
    paymentChannel: "simple_pay",
    minApprovalAmount: 10_000,
    discountType: "rate",
    discountRateBps: 1_000,
    monthlyCapTiers: [{ performanceThreshold: 1_000_000, monthlyCapAmount: 60_000 }],
    capUsageRuleId: null,
    postingPolicy: "reduce_expense",
    ...overrides,
  };
}

test("reconstructs MG+S 50,000 approval from 47,000 posting and 3,000 remaining cap", () => {
  const result = reconstructPyeonhanBenefitAmounts({
    rows: [{ transaction: transaction(), mappedCard: { accountType: "liabilities", accountId: "x45" } }],
    rules: [rule()],
    monthlyCaps: { "2026-08:hana_mgs_simple_pay_10p": 60_000 },
    existingEvents: [{
      occurredDate: "2026-08-14",
      ruleId: "hana_mgs_simple_pay_10p",
      cardAccountId: "x45",
      appliedDiscountAmount: 57_000,
    }],
  });

  assert.equal(result[0].transaction.approvalAmount, 50_000);
  assert.equal(result[0].transaction.postingAmount, 47_000);
  assert.equal(result[0].transaction.discountAmount, 3_000);
  assert.equal(result[0].approvalSource, "rule_reconstructed");
  assert.equal(result[0].discountSource, "rule_reconstructed");
  assert.equal(result[0].status, "reconstructed");
  assert.match(result[0].reason, /잔여 한도 3,000원/);
});

test("chronologically replays trusted Excel discounts before reconstructing a later row", () => {
  const result = reconstructPyeonhanBenefitAmounts({
    rows: [
      {
        transaction: transaction({
          occurredDate: "2026-08-14",
          postingAmount: 513_000,
          approvalAmount: 570_000,
          discountAmount: 57_000,
        }),
        mappedCard: { accountType: "liabilities", accountId: "x45" },
      },
      {
        transaction: transaction({
          sourceRowIndexes: [3],
          sourceIdentityKey: "c".repeat(64),
          occurredDate: "2026-08-15",
        }),
        mappedCard: { accountType: "liabilities", accountId: "x45" },
      },
    ],
    rules: [rule()],
    monthlyCaps: { "2026-08:hana_mgs_simple_pay_10p": 60_000 },
    existingEvents: [],
  });

  assert.equal(result[0].approvalSource, "excel");
  assert.equal(result[1].status, "reconstructed");
  assert.equal(result[1].transaction.approvalAmount, 50_000);
  assert.equal(result[1].transaction.discountAmount, 3_000);
});

test("keeps an ordinary explicit 10 percent Excel discount unchanged", () => {
  const result = reconstructPyeonhanBenefitAmounts({
    rows: [{
      transaction: transaction({ postingAmount: 45_000, approvalAmount: 50_000, discountAmount: 5_000 }),
      mappedCard: { accountType: "liabilities", accountId: "x45" },
    }],
    rules: [rule({ monthlyCapTiers: [] })],
    monthlyCaps: {},
    existingEvents: [],
  });

  assert.equal(result[0].transaction.approvalAmount, 50_000);
  assert.equal(result[0].transaction.discountAmount, 5_000);
  assert.equal(result[0].status, "unchanged");
  assert.equal(result[0].approvalSource, "excel");
});

test("requires review when a non-exhausted cap leaves multiple inverse approvals", () => {
  const result = reconstructPyeonhanBenefitAmounts({
    rows: [{
      transaction: transaction({ postingAmount: 45_000, approvalAmount: 45_000 }),
      mappedCard: { accountType: "liabilities", accountId: "x45" },
    }],
    rules: [rule()],
    monthlyCaps: { "2026-08:hana_mgs_simple_pay_10p": 60_000 },
    existingEvents: [{
      occurredDate: "2026-08-14",
      ruleId: "hana_mgs_simple_pay_10p",
      cardAccountId: "x45",
      appliedDiscountAmount: 20_000,
    }],
  });

  assert.equal(result[0].transaction.approvalAmount, 45_000);
  assert.equal(result[0].transaction.discountAmount, 0);
  assert.equal(result[0].status, "review");
  assert.match(result[0].reason, /후보가 2개/);
});

test("requires review when multiple same-rate rules can explain the transaction", () => {
  const result = reconstructPyeonhanBenefitAmounts({
    rows: [{ transaction: transaction(), mappedCard: { accountType: "liabilities", accountId: "x45" } }],
    rules: [
      rule(),
      rule({ ruleId: "other_10p", name: "다른 10%", priority: 11 }),
    ],
    monthlyCaps: {
      "2026-08:hana_mgs_simple_pay_10p": 60_000,
      "2026-08:other_10p": 60_000,
    },
    existingEvents: [],
  });

  assert.equal(result[0].status, "review");
  assert.equal(result[0].transaction.approvalAmount, 47_000);
  assert.match(result[0].reason, /후보가 2개/);
});

test("requires review when same-day cap-sensitive transaction order is ambiguous", () => {
  const result = reconstructPyeonhanBenefitAmounts({
    rows: [
      { transaction: transaction({ sourceRowIndexes: [2] }), mappedCard: { accountType: "liabilities", accountId: "x45" } },
      { transaction: transaction({ sourceRowIndexes: [3], sourceIdentityKey: "c".repeat(64) }), mappedCard: { accountType: "liabilities", accountId: "x45" } },
    ],
    rules: [rule()],
    monthlyCaps: { "2026-08:hana_mgs_simple_pay_10p": 60_000 },
    existingEvents: [{
      occurredDate: "2026-08-14",
      ruleId: "hana_mgs_simple_pay_10p",
      cardAccountId: "x45",
      appliedDiscountAmount: 57_000,
    }],
  });

  assert.deepEqual(result.map((row) => row.status), ["review", "review"]);
  assert.match(result[0].reason, /거래 순서/);
});

test("preserves a trustworthy Excel approval amount", () => {
  const result = reconstructPyeonhanBenefitAmounts({
    rows: [{
      transaction: transaction({ approvalAmount: 50_000, discountAmount: 3_000 }),
      mappedCard: { accountType: "liabilities", accountId: "x45" },
    }],
    rules: [rule()],
    monthlyCaps: { "2026-08:hana_mgs_simple_pay_10p": 60_000 },
    existingEvents: [],
  });

  assert.equal(result[0].transaction.approvalAmount, 50_000);
  assert.equal(result[0].approvalSource, "excel");
  assert.equal(result[0].discountSource, "excel_difference");
  assert.equal(result[0].status, "unchanged");
});

test("does not consume a later event while replaying an earlier transaction", () => {
  const result = reconstructPyeonhanBenefitAmounts({
    rows: [{
      transaction: transaction({ occurredDate: "2026-08-10", postingAmount: 47_000, approvalAmount: 47_000 }),
      mappedCard: { accountType: "liabilities", accountId: "x45" },
    }],
    rules: [rule()],
    monthlyCaps: { "2026-08:hana_mgs_simple_pay_10p": 60_000 },
    existingEvents: [{
      occurredDate: "2026-08-11",
      ruleId: "hana_mgs_simple_pay_10p",
      cardAccountId: "x45",
      appliedDiscountAmount: 57_000,
    }],
  });

  assert.equal(result[0].status, "review");
  assert.equal(result[0].transaction.approvalAmount, 47_000);
});

test("does not consume an event whose card account conflicts with its rule", () => {
  const result = reconstructPyeonhanBenefitAmounts({
    rows: [{ transaction: transaction(), mappedCard: { accountType: "liabilities", accountId: "x45" } }],
    rules: [rule()],
    monthlyCaps: { "2026-08:hana_mgs_simple_pay_10p": 60_000 },
    existingEvents: [{
      occurredDate: "2026-08-14",
      ruleId: "hana_mgs_simple_pay_10p",
      cardAccountId: "wrong-card",
      appliedDiscountAmount: 57_000,
    }],
  });

  assert.equal(result[0].status, "review");
  assert.equal(result[0].transaction.approvalAmount, 47_000);
});

test("requires review after an explicit discount cannot be assigned to a capped card rule", () => {
  const result = reconstructPyeonhanBenefitAmounts({
    rows: [
      {
        transaction: transaction({
          occurredDate: "2026-08-14",
          item: "일반 결제",
          postingAmount: 43_000,
          approvalAmount: 50_000,
          discountAmount: 7_000,
        }),
        mappedCard: { accountType: "liabilities", accountId: "x45" },
      },
      {
        transaction: transaction({ sourceRowIndexes: [3], sourceIdentityKey: "c".repeat(64) }),
        mappedCard: { accountType: "liabilities", accountId: "x45" },
      },
    ],
    rules: [rule()],
    monthlyCaps: { "2026-08:hana_mgs_simple_pay_10p": 60_000 },
    existingEvents: [],
  });

  assert.equal(result[1].status, "review");
  assert.match(result[1].reason, /앞선 거래/);
});

test("requires review when an explicit discount shares the same date with a cap-sensitive row", () => {
  const result = reconstructPyeonhanBenefitAmounts({
    rows: [
      {
        transaction: transaction({ approvalAmount: 50_000, postingAmount: 45_000, discountAmount: 5_000 }),
        mappedCard: { accountType: "liabilities", accountId: "x45" },
      },
      {
        transaction: transaction({ sourceRowIndexes: [3], sourceIdentityKey: "c".repeat(64) }),
        mappedCard: { accountType: "liabilities", accountId: "x45" },
      },
    ],
    rules: [rule()],
    monthlyCaps: { "2026-08:hana_mgs_simple_pay_10p": 60_000 },
    existingEvents: [],
  });

  assert.equal(result[1].status, "review");
  assert.match(result[1].reason, /거래 순서/);
});

test("requires review when the import range already contains a capped benefit event", () => {
  const result = reconstructPyeonhanBenefitAmounts({
    rows: [
      {
        transaction: transaction({
          occurredDate: "2026-08-01",
          sourceIdentityKey: "d".repeat(64),
          sourceAssetName: "현금",
        }),
        mappedCard: null,
      },
      { transaction: transaction(), mappedCard: { accountType: "liabilities", accountId: "x45" } },
    ],
    rules: [rule()],
    monthlyCaps: { "2026-08:hana_mgs_simple_pay_10p": 60_000 },
    existingEvents: [{
      occurredDate: "2026-08-10",
      ruleId: "hana_mgs_simple_pay_10p",
      cardAccountId: "x45",
      appliedDiscountAmount: 57_000,
    }],
  });

  assert.equal(result[1].status, "review");
  assert.match(result[1].reason, /공유 한도/);
});
