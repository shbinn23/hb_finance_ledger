import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedPyeonhanTransaction } from "./pyeonhan-types.ts";
import { identifyPyeonhanCardBenefitCandidate } from "./pyeonhan-card-benefit.ts";

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

test("identifies exact MG+S subscription and Shinhan Lady lunch candidates", () => {
  assert.equal(
    identifyPyeonhanCardBenefitCandidate(transaction({}))?.ruleId,
    "hana_mgs_subscription_50p",
  );
  assert.equal(
    identifyPyeonhanCardBenefitCandidate(transaction({
      sourceAssetName: "신한 레이디",
      sourceCategoryName: "필수",
      sourceSubcategoryName: "식비",
      item: "아워홈",
      memo: "점심",
      postingAmount: 7315,
      approvalAmount: 7700,
      discountAmount: 385,
    }))?.ruleId,
    "shinhan_lady_lunch_5p",
  );
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
