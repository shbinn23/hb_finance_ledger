import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedPyeonhanTransaction } from "./pyeonhan-types.ts";
import type { CardBenefitRule } from "../../lib/card-benefits/types.ts";
import {
  identifyPyeonhanCardBenefitCandidate,
  resolvePyeonhanCardBenefitCandidates,
} from "./pyeonhan-card-benefit.ts";

function transaction(overrides: Partial<NormalizedPyeonhanTransaction>): NormalizedPyeonhanTransaction {
  return {
    sourceRowIndexes: [2], occurredDate: "2026-08-15", entryType: "expense",
    sourceAssetName: "하나 MG+S", counterpartyAssetName: null,
    sourceCategoryName: "준필수", sourceSubcategoryName: "구독",
    item: "쿠팡(와우멤버십)_KCP", memo: "", postingAmount: 3945,
    approvalAmount: 7890, discountAmount: 3945, currency: "KRW",
    occurrenceIndex: 1, sourceIdentityKey: "a".repeat(64),
    sourceContentHash: "b".repeat(64), transferPairComplete: true,
    ...overrides,
  };
}

function rule(overrides: Partial<CardBenefitRule>): CardBenefitRule {
  return {
    ruleId: "hana_mgs_simple_pay_10p",
    cardAccountType: "liabilities",
    cardAccountId: "x45",
    name: "하나 MG+S 간편결제 10%",
    status: "active",
    priority: 10,
    paymentChannel: "simple_pay",
    minApprovalAmount: 10000,
    discountType: "rate",
    discountRateBps: 1000,
    monthlyCapTiers: [],
    postingPolicy: "reduce_expense",
    ...overrides,
  };
}

test("resolves the 25,250 to 22,725 MG+S discount from card and amounts", () => {
  const result = resolvePyeonhanCardBenefitCandidates(
    transaction({
      sourceCategoryName: "필수",
      sourceSubcategoryName: "생필품",
      item: "쿠팡",
      postingAmount: 22725,
      approvalAmount: 25250,
      discountAmount: 2525,
    }),
    { accountType: "liabilities", accountId: "x45" },
    [
      rule({}),
      rule({
        ruleId: "hana_mgs_subscription_50p",
        name: "하나 MG+S 구독 50%",
        discountRateBps: 5000,
        minApprovalAmount: null,
      }),
    ],
  );

  assert.equal(result.status, "rule_matched");
  assert.equal(result.selectedRuleId, "hana_mgs_simple_pay_10p");
  assert.deepEqual(result.candidates.map((candidate) => candidate.ruleId), ["hana_mgs_simple_pay_10p"]);
});

test("uses amount difference for discount detection without category evidence", () => {
  const result = resolvePyeonhanCardBenefitCandidates(
    transaction({
      sourceCategoryName: null,
      sourceSubcategoryName: null,
      item: "unknown merchant",
      postingAmount: 9000,
      approvalAmount: 10000,
      discountAmount: 1000,
    }),
    { accountType: "liabilities", accountId: "x45" },
    [rule({})],
  );

  assert.equal(result.status, "rule_matched");
});

test("requires selection for multiple same-rate rules and leaves zero candidates unknown", () => {
  const discounted = transaction({
    sourceAssetName: "신한 레이디",
    postingAmount: 9500,
    approvalAmount: 10000,
    discountAmount: 500,
  });
  const rules = [
    rule({ ruleId: "lunch", cardAccountId: "x50", name: "점심 5%", discountRateBps: 500, minApprovalAmount: null }),
    rule({ ruleId: "medical", cardAccountId: "x50", name: "병원 5%", discountRateBps: 500, minApprovalAmount: null }),
  ];

  const multiple = resolvePyeonhanCardBenefitCandidates(
    discounted,
    { accountType: "liabilities", accountId: "x50" },
    rules,
  );
  assert.equal(multiple.status, "rule_selection_required");
  assert.equal(multiple.selectedRuleId, null);
  assert.equal(multiple.candidates.length, 2);

  const unknown = resolvePyeonhanCardBenefitCandidates(
    discounted,
    { accountType: "liabilities", accountId: "x50" },
    [rule({ ruleId: "shopping", cardAccountId: "x50", discountRateBps: 300 })],
  );
  assert.equal(unknown.status, "rule_unknown");
  assert.equal(unknown.candidates.length, 0);
});

test("filters inactive, wrong-card, and below-minimum rules", () => {
  const result = resolvePyeonhanCardBenefitCandidates(
    transaction({ postingAmount: 4500, approvalAmount: 5000, discountAmount: 500 }),
    { accountType: "liabilities", accountId: "x45" },
    [
      rule({ status: "disabled", minApprovalAmount: null }),
      rule({ ruleId: "wrong-card", cardAccountId: "x99", minApprovalAmount: null }),
      rule({ ruleId: "minimum", minApprovalAmount: 10000 }),
    ],
  );
  assert.equal(result.status, "rule_unknown");
});

test("keeps a partial cap discount selectable but never auto-selects it", () => {
  const result = resolvePyeonhanCardBenefitCandidates(
    transaction({ postingAmount: 158167, approvalAmount: 159000, discountAmount: 833 }),
    { accountType: "liabilities", accountId: "x45" },
    [rule({ monthlyCapTiers: [{ performanceThreshold: 300000, monthlyCapAmount: 15000 }] })],
  );
  assert.equal(result.status, "rule_selection_required");
  assert.equal(result.selectedRuleId, null);
  assert.equal(result.candidates[0]?.matchKind, "cap_limited");
});

test("identifies exact MG+S subscription and Shinhan Lady lunch candidates", () => {
  assert.deepEqual(identifyPyeonhanCardBenefitCandidate(transaction({})), {
    ruleId: "hana_mgs_subscription_50p",
    label: "하나 MG+S · 구독 50%",
    reason: "카드·구독 항목·정확한 50% 할인액이 일치합니다.",
    discountRateBps: 5000,
    performanceAmount: 7890,
    confidence: 1,
  });
  assert.deepEqual(identifyPyeonhanCardBenefitCandidate(transaction({
      sourceAssetName: "신한 레이디",
      sourceCategoryName: "필수",
      sourceSubcategoryName: "식비",
      item: "아워홈",
      memo: "점심",
      postingAmount: 7315,
      approvalAmount: 7700,
      discountAmount: 385,
    })), {
    ruleId: "shinhan_lady_lunch_5p",
    label: "신한 레이디 · 점심 5%",
    reason: "카드·식비 분류·정확한 5% 할인액이 일치합니다.",
    discountRateBps: 500,
    performanceAmount: 7700,
    confidence: 1,
  });
});

test("does not infer Shinhan lunch from rate and broad food category alone", () => {
  assert.equal(identifyPyeonhanCardBenefitCandidate(transaction({
    sourceAssetName: "신한 레이디",
    sourceCategoryName: "필수",
    sourceSubcategoryName: "식비",
    item: "저녁",
    memo: "",
    postingAmount: 7315,
    approvalAmount: 7700,
    discountAmount: 385,
  })), null);
});

test("keeps simple-pay and cap-limited discounts unresolved without explicit evidence", () => {
  assert.equal(identifyPyeonhanCardBenefitCandidate(transaction({
    sourceCategoryName: "선택", sourceSubcategoryName: "식비", item: "배달",
    postingAmount: 9000, approvalAmount: 10000, discountAmount: 1000,
  })), null);
  assert.equal(identifyPyeonhanCardBenefitCandidate(transaction({
    item: "스트라이프(카카오페이)_나이스",
    postingAmount: 158167, approvalAmount: 159000, discountAmount: 833,
  })), null);
});
