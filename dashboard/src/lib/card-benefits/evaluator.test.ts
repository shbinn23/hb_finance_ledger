import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCardBenefit, resolveMonthlyCap } from "./evaluator.ts";
import type { CardBenefitRule } from "./types.ts";

const mgsRule: CardBenefitRule = {
  ruleId: "hana_mgs_simple_pay_10p",
  cardAccountType: "liabilities",
  cardAccountId: "x45",
  name: "하나 MG+S 간편결제 10%",
  status: "active",
  priority: 10,
  paymentChannel: "simple_pay",
  minApprovalAmount: 10_000,
  discountType: "rate",
  discountRateBps: 1000,
  monthlyCapTiers: [
    { performanceThreshold: 300_000, monthlyCapAmount: 15_000 },
    { performanceThreshold: 600_000, monthlyCapAmount: 30_000 },
    { performanceThreshold: 1_000_000, monthlyCapAmount: 60_000 },
  ],
  postingPolicy: "reduce_expense",
};

const shinhanLadyLunchRule: CardBenefitRule = {
  ruleId: "shinhan_lady_lunch_5p",
  cardAccountType: "liabilities",
  cardAccountId: "x50",
  name: "신한 레이디 점심 5%",
  status: "active",
  priority: 20,
  paymentChannel: null,
  minApprovalAmount: null,
  discountType: "rate",
  discountRateBps: 500,
  monthlyCapTiers: [],
  postingPolicy: "reduce_expense",
};

function input(overrides: Partial<Parameters<typeof evaluateCardBenefit>[0]> = {}) {
  return {
    occurredDate: "2026-05-17",
    selectedRuleId: "hana_mgs_simple_pay_10p",
    cardAccountType: "liabilities" as const,
    cardAccountId: "x45",
    expenseAccountId: "x1",
    merchant: "네이버페이",
    approvalAmount: 10_000,
    rules: [mgsRule],
    monthlyContext: {
      benefitMonth: "2026-05",
      performanceAmount: 1_000_000,
      capUsedByRule: {},
    },
    ...overrides,
  };
}

test("MG+S simple pay applies 10 percent discount from 10,000 won", () => {
  const result = evaluateCardBenefit(input());

  assert.equal(result.ruleId, "hana_mgs_simple_pay_10p");
  assert.equal(result.eligible, true);
  assert.equal(result.approvalAmount, 10_000);
  assert.equal(result.performanceAmount, 10_000);
  assert.equal(result.eligibleDiscountAmount, 1_000);
  assert.equal(result.appliedDiscountAmount, 1_000);
  assert.equal(result.postingAmount, 9_000);
  assert.equal(result.monthlyCapAmount, 60_000);
  assert.equal(result.capUsedBefore, 0);
  assert.equal(result.capUsedAfter, 1_000);
});

test("MG+S simple pay below 10,000 won does not discount", () => {
  const result = evaluateCardBenefit(input({ approvalAmount: 9_999 }));

  assert.equal(result.eligible, false);
  assert.equal(result.ruleId, "hana_mgs_simple_pay_10p");
  assert.equal(result.reason, "below_min_approval_amount");
  assert.equal(result.appliedDiscountAmount, 0);
  assert.equal(result.postingAmount, 9_999);
});

test("no selected card benefit rule does not discount", () => {
  const result = evaluateCardBenefit(input({ selectedRuleId: null, approvalAmount: 100_000 }));

  assert.equal(result.eligible, false);
  assert.equal(result.ruleId, null);
  assert.equal(result.reason, "no_selected_rule");
  assert.equal(result.appliedDiscountAmount, 0);
  assert.equal(result.postingAmount, 100_000);
});

test("MG+S selected with another card does not discount", () => {
  const result = evaluateCardBenefit(input({
    approvalAmount: 100_000,
    cardAccountId: "x50",
  }));

  assert.equal(result.eligible, false);
  assert.equal(result.ruleId, "hana_mgs_simple_pay_10p");
  assert.equal(result.reason, "card_account_mismatch");
  assert.equal(result.appliedDiscountAmount, 0);
  assert.equal(result.postingAmount, 100_000);
});

test("Shinhan Lady lunch applies selected 5 percent rule without monthly status", () => {
  const result = evaluateCardBenefit(input({
    selectedRuleId: "shinhan_lady_lunch_5p",
    cardAccountId: "x50",
    merchant: "점심",
    approvalAmount: 20_000,
    rules: [mgsRule, shinhanLadyLunchRule],
    monthlyContext: {
      benefitMonth: "2026-05",
      performanceAmount: 0,
      capUsedByRule: {},
    },
  }));

  assert.equal(result.ruleId, "shinhan_lady_lunch_5p");
  assert.equal(result.eligible, true);
  assert.equal(result.eligibleDiscountAmount, 1_000);
  assert.equal(result.appliedDiscountAmount, 1_000);
  assert.equal(result.postingAmount, 19_000);
  assert.equal(result.monthlyCapAmount, null);
});

test("MG+S applies only remaining monthly cap", () => {
  const result = evaluateCardBenefit(input({
    approvalAmount: 100_000,
    monthlyContext: {
      benefitMonth: "2026-05",
      performanceAmount: 1_000_000,
      capUsedByRule: { hana_mgs_simple_pay_10p: 59_000 },
    },
  }));

  assert.equal(result.eligibleDiscountAmount, 10_000);
  assert.equal(result.appliedDiscountAmount, 1_000);
  assert.equal(result.postingAmount, 99_000);
  assert.equal(result.capUsedBefore, 59_000);
  assert.equal(result.capUsedAfter, 60_000);
});

test("MG+S applies only remaining cap in the 600,000 performance tier", () => {
  const result = evaluateCardBenefit(input({
    approvalAmount: 100_000,
    monthlyContext: {
      benefitMonth: "2026-05",
      performanceAmount: 600_000,
      capUsedByRule: { hana_mgs_simple_pay_10p: 29_000 },
    },
  }));

  assert.equal(result.monthlyCapAmount, 30_000);
  assert.equal(result.eligibleDiscountAmount, 10_000);
  assert.equal(result.appliedDiscountAmount, 1_000);
  assert.equal(result.postingAmount, 99_000);
  assert.equal(result.capUsedBefore, 29_000);
  assert.equal(result.capUsedAfter, 30_000);
});

test("MG+S does not discount when monthly cap is exhausted", () => {
  const result = evaluateCardBenefit(input({
    approvalAmount: 100_000,
    monthlyContext: {
      benefitMonth: "2026-05",
      performanceAmount: 1_000_000,
      capUsedByRule: { hana_mgs_simple_pay_10p: 60_000 },
    },
  }));

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "monthly_cap_exhausted");
  assert.equal(result.appliedDiscountAmount, 0);
  assert.equal(result.postingAmount, 100_000);
});

test("MG+S does not discount when automatic cap cannot be calculated", () => {
  const result = evaluateCardBenefit(input({
    approvalAmount: 100_000,
    monthlyContext: {
      benefitMonth: "2026-05",
      performanceAmount: 0,
      capUsedByRule: {},
    },
  }));

  assert.equal(result.eligible, false);
  assert.equal(result.ruleId, "hana_mgs_simple_pay_10p");
  assert.equal(result.reason, "automatic_cap_unavailable");
  assert.equal(result.appliedDiscountAmount, 0);
  assert.equal(result.postingAmount, 100_000);
});

test("MG+S monthly cap tiers resolve by performance amount", () => {
  assert.equal(resolveMonthlyCap(mgsRule.monthlyCapTiers, 299_999), null);
  assert.equal(resolveMonthlyCap(mgsRule.monthlyCapTiers, 300_000), 15_000);
  assert.equal(resolveMonthlyCap(mgsRule.monthlyCapTiers, 600_000), 30_000);
  assert.equal(resolveMonthlyCap(mgsRule.monthlyCapTiers, 1_000_000), 60_000);
  assert.equal(resolveMonthlyCap(mgsRule.monthlyCapTiers, 1_200_000), 60_000);
});
