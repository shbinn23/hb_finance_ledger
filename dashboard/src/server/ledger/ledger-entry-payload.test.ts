import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExpensePostingFromCardBenefit,
  buildWhooingBalanceAdjustmentEntryPayload,
  buildWhooingCardPaymentEntryPayload,
  buildWhooingExpenseEntryPayload,
  buildWhooingIncomeEntryPayload,
  buildWhooingTransferEntryPayload,
  calculateExpensePosting,
} from "./ledger-entry-payload.ts";

test("expense payload posts expenses against the selected payment account", () => {
  const submission = {
    approvalAmount: "7700",
    occurredDate: "2026-08-30",
    merchant: "점심",
    categoryAccountType: "expenses" as const,
    categoryAccountId: "x12",
    categoryAccountLabel: "필수 / 식비",
    paymentAccountType: "assets" as const,
    paymentAccountId: "x3",
    paymentAccountLabel: "국민은행",
    discountRuleId: "none",
    userMemo: "",
  };

  assert.deepEqual(
    buildWhooingExpenseEntryPayload({
      sectionId: "s1",
      submission,
      calculation: calculateExpensePosting(submission),
    }),
    {
      section_id: "s1",
      entry_date: "20260830",
      l_account: "expenses",
      l_account_id: "x12",
      r_account: "assets",
      r_account_id: "x3",
      item: "점심",
      money: 7700,
      memo: "승인금액 7,700원",
    },
  );
});

test("card benefit posting preserves approval, discount, and posting evidence", () => {
  const calculation = buildExpensePostingFromCardBenefit(
    { userMemo: "구독" },
    {
      ruleId: "hana_mgs_subscription_50p",
      paymentChannel: "simple_pay",
      eligible: true,
      reason: "eligible",
      approvalAmount: 7890,
      performanceAmount: 7890,
      eligibleDiscountAmount: 3945,
      appliedDiscountAmount: 3945,
      postingAmount: 3945,
      monthlyCapAmount: 60000,
      capUsedBefore: 0,
      capUsedAfter: 3945,
    },
    "하나 MG+S 구독 50%",
  );

  assert.equal(calculation.postingAmount, 3945);
  assert.match(calculation.mergedMemo, /승인금액 7,890원/);
  assert.match(calculation.mergedMemo, /적용할인액 3,945원/);
  assert.match(calculation.mergedMemo, /후잉등록금액 3,945원/);
});

test("income payload posts the deposit asset against income", () => {
  const payload = buildWhooingIncomeEntryPayload({
    sectionId: "s1",
    submission: {
      amount: "100000",
      occurredDate: "2026-08-30",
      source: "용돈",
      depositAccountType: "assets",
      depositAccountId: "x3",
      depositAccountLabel: "국민은행",
      incomeAccountType: "income",
      incomeAccountId: "x10",
      incomeAccountLabel: "기타수익",
      userMemo: "",
    },
  });

  assert.equal(payload.l_account, "assets");
  assert.equal(payload.l_account_id, "x3");
  assert.equal(payload.r_account, "income");
  assert.equal(payload.r_account_id, "x10");
});

test("transfer payload posts the destination asset against the source asset", () => {
  const payload = buildWhooingTransferEntryPayload({
    sectionId: "s1",
    submission: {
      amount: "8990",
      occurredDate: "2026-08-01",
      fromAccountType: "assets",
      fromAccountId: "x34",
      fromAccountLabel: "새마을금고",
      toAccountType: "assets",
      toAccountId: "x3",
      toAccountLabel: "국민은행",
      item: "계좌이체",
      userMemo: "",
    },
  });

  assert.equal(payload.l_account_id, "x3");
  assert.equal(payload.r_account_id, "x34");
});

test("card payment payload reduces liabilities from an asset account", () => {
  const payload = buildWhooingCardPaymentEntryPayload({
    sectionId: "s1",
    submission: {
      amount: "676",
      occurredDate: "2026-08-10",
      liabilityAccountType: "liabilities",
      liabilityAccountId: "x56",
      liabilityAccountLabel: "국민 톡톡",
      assetAccountType: "assets",
      assetAccountId: "x3",
      assetAccountLabel: "국민은행",
      item: "카드대금 상환",
      userMemo: "",
    },
  });

  assert.equal(payload.l_account, "liabilities");
  assert.equal(payload.r_account, "assets");
  assert.equal(payload.money, 676);
});

test("balance adjustment preserves asset and liability accounting directions", () => {
  const base = {
    sectionId: "s1",
    submission: {
      occurredDate: "2026-08-30",
      targetAccountType: "assets" as "assets" | "liabilities",
      targetAccountIdType: "assets" as "assets" | "liabilities",
      targetAccountId: "x3",
      targetAccountLabel: "국민은행",
      direction: "increase" as "increase" | "decrease",
      amount: "5000",
      reason: "검산 차이",
      capitalAccountType: "capital" as const,
      capitalAccountId: "x1",
      capitalAccountLabel: "자본",
      userMemo: "",
    },
  };

  const assetIncrease = buildWhooingBalanceAdjustmentEntryPayload(base);
  const assetDecrease = buildWhooingBalanceAdjustmentEntryPayload({
    ...base,
    submission: { ...base.submission, direction: "decrease" },
  });
  const liabilityIncrease = buildWhooingBalanceAdjustmentEntryPayload({
    ...base,
    submission: {
      ...base.submission,
      targetAccountType: "liabilities",
      targetAccountIdType: "liabilities",
      direction: "increase",
    },
  });
  const liabilityDecrease = buildWhooingBalanceAdjustmentEntryPayload({
    ...base,
    submission: {
      ...base.submission,
      targetAccountType: "liabilities",
      targetAccountIdType: "liabilities",
      direction: "decrease",
    },
  });

  assert.deepEqual([assetIncrease.l_account, assetIncrease.r_account], ["assets", "capital"]);
  assert.deepEqual([assetDecrease.l_account, assetDecrease.r_account], ["capital", "assets"]);
  assert.deepEqual([liabilityIncrease.l_account, liabilityIncrease.r_account], ["capital", "liabilities"]);
  assert.deepEqual([liabilityDecrease.l_account, liabilityDecrease.r_account], ["liabilities", "capital"]);
});
