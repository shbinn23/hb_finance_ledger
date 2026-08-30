import assert from "node:assert/strict";
import test from "node:test";
import {
  entryDateRangeForBenefitMonth,
  monthlyContextFromAutomaticPerformance,
} from "./repository-helpers.ts";

test("entryDateRangeForBenefitMonth returns inclusive start and exclusive end", () => {
  assert.deepEqual(entryDateRangeForBenefitMonth("2026-05"), {
    startDate: 20260501,
    endDate: 20260601,
  });
});

test("monthlyContextFromAutomaticPerformance uses previous performance estimate", () => {
  assert.deepEqual(
    monthlyContextFromAutomaticPerformance({
      benefitMonth: "2026-05",
      performanceAmount: 377_581 + 626_327,
      capUsedByRule: { hana_mgs_simple_pay_10p: 29_000 },
    }),
    {
      benefitMonth: "2026-05",
      performanceAmount: 1_003_908,
      capUsedByRule: { hana_mgs_simple_pay_10p: 29_000 },
    },
  );
});
