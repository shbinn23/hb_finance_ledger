import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAvailableResource,
  calculateSavingDefenseBalance,
  FINANCIAL_PLAN,
} from "./resource-reservation.ts";

test("saving defense balance compares income, saving target, and projected total spend", () => {
  const surplus = calculateSavingDefenseBalance({
    monthlyIncome: FINANCIAL_PLAN.monthlyIncome,
    monthlySavingTarget: FINANCIAL_PLAN.monthlySavingTarget,
    projectedActualMonthTotal: 1_900_000,
  });

  assert.equal(surplus.savingDefenseBalance, 210_000);
  assert.equal(surplus.isDeficit, false);
  assert.equal(surplus.surplusAmount, 210_000);
  assert.equal(surplus.deficitAmount, 0);

  const deficit = calculateSavingDefenseBalance({
    monthlyIncome: FINANCIAL_PLAN.monthlyIncome,
    monthlySavingTarget: FINANCIAL_PLAN.monthlySavingTarget,
    projectedActualMonthTotal: 2_620_000,
  });

  assert.equal(deficit.savingDefenseBalance, -510_000);
  assert.equal(deficit.isDeficit, true);
  assert.equal(deficit.surplusAmount, 0);
  assert.equal(deficit.deficitAmount, 510_000);
});

test("available resource reserves fixed costs before variable spend", () => {
  const result = calculateAvailableResource({
    monthlyIncome: FINANCIAL_PLAN.monthlyIncome,
    monthlySavingTarget: FINANCIAL_PLAN.monthlySavingTarget,
    currentFixedAmount: 346_907,
    remainingFixedScheduledAmount: 771_680,
    currentVariableSpend: 833_436,
  });

  assert.equal(result.reservedFixedTotal, 1_118_587);
  assert.equal(result.variableSpendPool, 991_413);
  assert.equal(result.currentVariableSpend, 833_436);
  assert.equal(result.availableResource, 157_977);
  assert.equal(result.isOverrun, false);
  assert.equal(result.remainingAmount, 157_977);
  assert.equal(result.overrunAmount, 0);
});

test("available resource reports overrun without double-counting fixed spend", () => {
  const result = calculateAvailableResource({
    monthlyIncome: 3_110_000,
    monthlySavingTarget: 1_000_000,
    currentFixedAmount: 500_000,
    remainingFixedScheduledAmount: 600_000,
    currentVariableSpend: 1_200_000,
  });

  assert.equal(result.reservedFixedTotal, 1_100_000);
  assert.equal(result.variableSpendPool, 1_010_000);
  assert.equal(result.availableResource, -190_000);
  assert.equal(result.isOverrun, true);
  assert.equal(result.remainingAmount, 0);
  assert.equal(result.overrunAmount, 190_000);
});
