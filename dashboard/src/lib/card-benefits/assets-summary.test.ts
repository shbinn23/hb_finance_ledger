import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBenefitCapStatus,
  calculateCardPerformanceEstimate,
  calculateCardStatementEstimate,
  savingRate,
} from "./assets-summary.ts";

test("savingRate calculates applied discount against approval amount", () => {
  assert.equal(savingRate(1_000, 10_000), 10);
  assert.equal(savingRate(0, 0), 0);
});

test("calculateCardStatementEstimate uses posting amount for statement estimate and approval for performance basis", () => {
  const estimate = calculateCardStatementEstimate({
    structuredApprovalTotal: 10_000,
    structuredPostingTotal: 9_000,
    structuredDiscountTotal: 1_000,
    legacyPostingTotal: 20_000,
  });

  assert.equal(estimate.statementEstimate, 29_000);
  assert.equal(estimate.effectiveSpend, 29_000);
  assert.equal(estimate.statementVsEffectiveDelta, 0);
  assert.equal(estimate.approvalEstimateTotal, 30_000);
  assert.equal(estimate.dataQuality, "partial_estimate");
});

test("calculateCardStatementEstimate classifies statement data quality", () => {
  assert.equal(calculateCardStatementEstimate({
    structuredApprovalTotal: 10_000,
    structuredPostingTotal: 9_000,
    structuredDiscountTotal: 1_000,
    legacyPostingTotal: 0,
  }).dataQuality, "structured");
  assert.equal(calculateCardStatementEstimate({
    structuredApprovalTotal: 0,
    structuredPostingTotal: 0,
    structuredDiscountTotal: 0,
    legacyPostingTotal: 20_000,
  }).dataQuality, "legacy_estimate");
  assert.equal(calculateCardStatementEstimate({
    structuredApprovalTotal: 0,
    structuredPostingTotal: 0,
    structuredDiscountTotal: 0,
    legacyPostingTotal: 0,
  }).dataQuality, "no_data");
});

test("calculateCardPerformanceEstimate uses structured performance and legacy posting as a conservative estimate", () => {
  const estimate = calculateCardPerformanceEstimate({
    structuredPerformanceTotal: 8_000,
    structuredApprovalTotal: 10_000,
    structuredPostingTotal: 9_000,
    structuredDiscountTotal: 1_000,
    legacyPostingTotal: 20_000,
  });

  assert.equal(estimate.performanceEstimate, 28_000);
  assert.equal(estimate.structuredApprovalTotal, 10_000);
  assert.equal(estimate.structuredPostingTotal, 9_000);
  assert.equal(estimate.structuredDiscountTotal, 1_000);
  assert.equal(estimate.legacyPerformanceEstimateTotal, 20_000);
  assert.equal(estimate.dataQuality, "partial_estimate");
});

test("statement and performance helpers keep the combined card summary axes separate", () => {
  const base = {
    structuredApprovalTotal: 10_000,
    structuredPostingTotal: 9_000,
    structuredDiscountTotal: 1_000,
    legacyPostingTotal: 20_000,
  };
  const statement = calculateCardStatementEstimate(base);
  const performance = calculateCardPerformanceEstimate({
    ...base,
    structuredPerformanceTotal: 10_000,
  });

  assert.equal(statement.statementEstimate, 29_000);
  assert.equal(statement.approvalEstimateTotal, 30_000);
  assert.equal(performance.performanceEstimate, 30_000);
  assert.equal(performance.legacyPerformanceEstimateTotal, 20_000);
});

test("calculateCardPerformanceEstimate uses legacy posting when structured performance is missing", () => {
  const estimate = calculateCardPerformanceEstimate({
    structuredPerformanceTotal: 0,
    structuredApprovalTotal: 0,
    structuredPostingTotal: 0,
    structuredDiscountTotal: 0,
    legacyPostingTotal: 20_000,
  });

  assert.equal(estimate.performanceEstimate, 20_000);
  assert.equal(estimate.legacyPerformanceEstimateTotal, 20_000);
  assert.equal(estimate.dataQuality, "legacy_estimate");
});

test("calculateBenefitCapStatus marks cap unknown without previous performance estimate", () => {
  const status = calculateBenefitCapStatus({
    monthlyCapTiers: [
      { performanceThreshold: 300_000, monthlyCapAmount: 15_000 },
      { performanceThreshold: 600_000, monthlyCapAmount: 30_000 },
    ],
    previousMonthPerformanceEstimate: 0,
    currentDiscountUsed: 1_000,
  });

  assert.equal(status.autoStatus, "unknown");
  assert.equal(status.autoMonthlyCapAmount, null);
  assert.equal(status.remainingCap, null);
});

test("calculateBenefitCapStatus calculates automatic cap from previous performance estimate", () => {
  const status = calculateBenefitCapStatus({
    monthlyCapTiers: [
      { performanceThreshold: 300_000, monthlyCapAmount: 15_000 },
      { performanceThreshold: 600_000, monthlyCapAmount: 30_000 },
    ],
    previousMonthPerformanceEstimate: 600_000,
    currentDiscountUsed: 12_000,
  });

  assert.equal(status.autoStatus, "ready");
  assert.equal(status.autoMonthlyCapAmount, 30_000);
  assert.equal(status.remainingCap, 18_000);
  assert.equal(status.usageRate, 40);
});

test("calculateBenefitCapStatus includes legacy spending when estimating previous month performance", () => {
  const status = calculateBenefitCapStatus({
    monthlyCapTiers: [
      { performanceThreshold: 300_000, monthlyCapAmount: 15_000 },
      { performanceThreshold: 600_000, monthlyCapAmount: 30_000 },
      { performanceThreshold: 1_000_000, monthlyCapAmount: 60_000 },
    ],
    previousMonthPerformanceEstimate: 377_581 + 626_327,
    currentDiscountUsed: 30_000,
  });

  assert.equal(status.autoStatus, "ready");
  assert.equal(status.autoMonthlyCapAmount, 60_000);
  assert.equal(status.remainingCap, 30_000);
});
