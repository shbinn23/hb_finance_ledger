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

test("calculateCardPerformanceEstimate uses performance amount and excludes legacy posting", () => {
  const estimate = calculateCardPerformanceEstimate({
    structuredPerformanceTotal: 8_000,
    structuredApprovalTotal: 10_000,
    structuredPostingTotal: 9_000,
    structuredDiscountTotal: 1_000,
    legacyPostingTotal: 20_000,
  });

  assert.equal(estimate.performanceEstimate, 8_000);
  assert.equal(estimate.structuredApprovalTotal, 10_000);
  assert.equal(estimate.structuredPostingTotal, 9_000);
  assert.equal(estimate.structuredDiscountTotal, 1_000);
  assert.equal(estimate.excludedLegacyPostingTotal, 20_000);
  assert.equal(estimate.dataQuality, "structured");
});

test("calculateCardPerformanceEstimate returns no_data without structured performance", () => {
  const estimate = calculateCardPerformanceEstimate({
    structuredPerformanceTotal: 0,
    structuredApprovalTotal: 0,
    structuredPostingTotal: 0,
    structuredDiscountTotal: 0,
    legacyPostingTotal: 20_000,
  });

  assert.equal(estimate.performanceEstimate, 0);
  assert.equal(estimate.excludedLegacyPostingTotal, 20_000);
  assert.equal(estimate.dataQuality, "no_data");
});

test("calculateBenefitCapStatus marks cap unknown without previous structured performance", () => {
  const status = calculateBenefitCapStatus({
    monthlyCapTiers: [
      { performanceThreshold: 300_000, monthlyCapAmount: 15_000 },
      { performanceThreshold: 600_000, monthlyCapAmount: 30_000 },
    ],
    previousMonthStructuredPerformance: 0,
    currentDiscountUsed: 1_000,
  });

  assert.equal(status.autoStatus, "unknown");
  assert.equal(status.autoMonthlyCapAmount, null);
  assert.equal(status.remainingCap, null);
});

test("calculateBenefitCapStatus calculates automatic cap from previous structured performance", () => {
  const status = calculateBenefitCapStatus({
    monthlyCapTiers: [
      { performanceThreshold: 300_000, monthlyCapAmount: 15_000 },
      { performanceThreshold: 600_000, monthlyCapAmount: 30_000 },
    ],
    previousMonthStructuredPerformance: 600_000,
    currentDiscountUsed: 12_000,
  });

  assert.equal(status.autoStatus, "ready");
  assert.equal(status.autoMonthlyCapAmount, 30_000);
  assert.equal(status.remainingCap, 18_000);
  assert.equal(status.usageRate, 40);
});
