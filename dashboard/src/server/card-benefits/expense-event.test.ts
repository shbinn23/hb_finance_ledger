import assert from "node:assert/strict";
import test from "node:test";
import { buildExpenseCardBenefitEventInsert } from "./expense-event.ts";

test("buildExpenseCardBenefitEventInsert maps expense benefit evaluation to event insert payload", () => {
  const event = buildExpenseCardBenefitEventInsert({
    sectionId: "s1",
    whooingEntryId: 1352827,
    entryDate: 20260517,
    submission: {
      approvalAmount: "100000",
      occurredDate: "2026-05-17",
      merchant: "네이버페이",
      categoryAccountType: "expenses",
      categoryAccountId: "x1",
      categoryAccountLabel: "생활비 / 쇼핑",
      paymentAccountType: "liabilities",
      paymentAccountId: "x45",
      paymentAccountLabel: "하나 MG+S",
      discountRuleId: "hana_mgs_simple_pay_10p",
      userMemo: "테스트",
    },
    evaluation: {
      ruleId: "hana_mgs_simple_pay_10p",
      paymentChannel: "simple_pay",
      eligible: true,
      reason: "eligible",
      approvalAmount: 100_000,
      performanceAmount: 100_000,
      eligibleDiscountAmount: 10_000,
      appliedDiscountAmount: 1_000,
      postingAmount: 99_000,
      monthlyCapAmount: 30_000,
      capUsedBefore: 29_000,
      capUsedAfter: 30_000,
    },
  });

  assert.deepEqual(event, {
    sectionId: "s1",
    whooingEntryId: 1352827,
    entryDate: 20260517,
    ruleId: "hana_mgs_simple_pay_10p",
    cardAccountType: "liabilities",
    cardAccountId: "x45",
    expenseAccountId: "x1",
    merchant: "네이버페이",
    paymentChannel: "simple_pay",
    approvalAmount: 100_000,
    performanceAmount: 100_000,
    eligibleDiscountAmount: 10_000,
    appliedDiscountAmount: 1_000,
    postingAmount: 99_000,
    capUsedBefore: 29_000,
    capUsedAfter: 30_000,
    evaluationStatus: "applied",
    evaluationReason: "eligible",
  });
});
