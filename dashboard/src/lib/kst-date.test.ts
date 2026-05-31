import assert from "node:assert/strict";
import test from "node:test";

import {
  currentKstDateValue,
  currentKstDay,
  currentKstMonthValue,
  currentKstQuarterValue,
  currentKstYearValue,
  todayKstDateParts,
} from "./kst-date.ts";

const kstMidnightFromUtc = new Date("2026-05-31T15:05:00Z");

test("KST date helpers use Asia/Seoul instead of container local time", () => {
  assert.deepEqual(todayKstDateParts(kstMidnightFromUtc), {
    year: "2026",
    month: "06",
    day: "01",
  });
  assert.equal(currentKstDateValue(kstMidnightFromUtc), 20260601);
  assert.equal(currentKstMonthValue(kstMidnightFromUtc), "2026-06");
  assert.equal(currentKstYearValue(kstMidnightFromUtc), "2026");
  assert.equal(currentKstQuarterValue(kstMidnightFromUtc), "2");
  assert.equal(currentKstDay(kstMidnightFromUtc), 1);
});
