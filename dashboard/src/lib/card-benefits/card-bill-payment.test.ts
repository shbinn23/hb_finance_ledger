import assert from "node:assert/strict";
import test from "node:test";
import { buildCardBillPaymentRows } from "./card-bill-payment.ts";

const billRows = [
  {
    cardAccountId: "x45",
    cardName: "하나 MG+S",
    billAmount: 666_265,
    useStartDate: 20260501,
    useEndDate: 20260531,
    payDate: 10,
  },
  {
    cardAccountId: "x50",
    cardName: "신한 레이디",
    billAmount: 305_655,
    useStartDate: 20260501,
    useEndDate: 20260531,
    payDate: 10,
  },
  {
    cardAccountId: "x22",
    cardName: "우리 SKT",
    billAmount: 0,
    useStartDate: 20260501,
    useEndDate: 20260531,
    payDate: 10,
  },
];

test("buildCardBillPaymentRows recommends the latest repayment account when bill is unpaid", () => {
  const rows = buildCardBillPaymentRows({
    billMonth: "2026-06",
    billRows,
    recommendedAccounts: [
      { cardAccountId: "x45", assetAccountId: "x29", assetName: "새마을금고" },
    ],
    repaymentMatches: [],
  });

  assert.equal(rows[0].repaymentStatus, "ready");
  assert.equal(rows[0].recommendedAssetAccountId, "x29");
  assert.equal(rows[0].recommendedAssetName, "새마을금고");
  assert.equal(rows[0].statusReason, "등록 가능");
});

test("buildCardBillPaymentRows marks a bill registered when an exact repayment exists", () => {
  const rows = buildCardBillPaymentRows({
    billMonth: "2026-06",
    billRows,
    recommendedAccounts: [
      { cardAccountId: "x45", assetAccountId: "x29", assetName: "새마을금고" },
    ],
    repaymentMatches: [
      { cardAccountId: "x45", billAmount: 666_265, matchCount: 1 },
    ],
  });

  assert.equal(rows[0].repaymentStatus, "registered");
  assert.equal(rows[0].statusReason, "동일 금액 상환 거래가 있습니다.");
});

test("buildCardBillPaymentRows ignores repayment matches with a different amount", () => {
  const rows = buildCardBillPaymentRows({
    billMonth: "2026-06",
    billRows,
    recommendedAccounts: [
      { cardAccountId: "x45", assetAccountId: "x29", assetName: "새마을금고" },
    ],
    repaymentMatches: [
      { cardAccountId: "x45", billAmount: 1_000, matchCount: 1 },
    ],
  });

  assert.equal(rows[0].repaymentStatus, "ready");
});

test("buildCardBillPaymentRows marks missing account recommendation and no bill states", () => {
  const rows = buildCardBillPaymentRows({
    billMonth: "2026-06",
    billRows,
    recommendedAccounts: [],
    repaymentMatches: [],
  });

  assert.equal(rows[0].repaymentStatus, "asset_required");
  assert.equal(rows[0].statusReason, "추천 출금계좌가 없습니다.");
  assert.equal(rows[2].repaymentStatus, "no_bill");
  assert.equal(rows[2].statusReason, "청구금액이 없습니다.");
});

test("buildCardBillPaymentRows marks ambiguous duplicate repayment matches for review", () => {
  const rows = buildCardBillPaymentRows({
    billMonth: "2026-06",
    billRows,
    recommendedAccounts: [
      { cardAccountId: "x50", assetAccountId: "x3", assetName: "국민은행" },
    ],
    repaymentMatches: [
      { cardAccountId: "x50", billAmount: 305_655, matchCount: 2 },
    ],
  });

  assert.equal(rows[1].repaymentStatus, "needs_review");
  assert.equal(rows[1].statusReason, "동일 금액 상환 후보가 2건 있습니다.");
});
