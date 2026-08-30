import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("card benefit event update uses updated_at as compare-and-swap evidence", () => {
  const source = readFileSync(new URL("./repository.ts", import.meta.url), "utf8");
  const update = source.slice(source.indexOf("export async function updateCardBenefitEvent"));
  assert.match(update, /idempotency_key = \$19/);
  assert.match(update, /updated_at = \$20::timestamptz/);
});
