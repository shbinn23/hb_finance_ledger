import assert from "node:assert/strict";
import test from "node:test";
import { buildPeriodOptions, parsePeriodQuery, resolvePeriod } from "./period-filter.ts";

const options = {
  years: [
    { value: "2026", label: "2026년" },
    { value: "2025", label: "2025년" },
  ],
  months: [
    { value: "2026-05", label: "2026년 5월" },
    { value: "2026-04", label: "2026년 4월" },
  ],
};

test("period filter resolves legacy month query as month mode", () => {
  const period = resolvePeriod(parsePeriodQuery({ month: "2026-05" }), options);

  assert.equal(period.mode, "month");
  assert.equal(period.month, "2026-05");
  assert.equal(period.startDate, 20260501);
  assert.equal(period.endDate, 20260601);
});

test("period filter resolves quarter year and all ranges", () => {
  const quarter = resolvePeriod(parsePeriodQuery({ period: "quarter", year: "2026", quarter: "2" }), options);
  const year = resolvePeriod(parsePeriodQuery({ period: "year", year: "2026" }), options);
  const all = resolvePeriod(parsePeriodQuery({ period: "all" }), options);

  assert.equal(quarter.label, "2026년 2분기");
  assert.equal(quarter.startDate, 20260401);
  assert.equal(quarter.endDate, 20260701);
  assert.equal(year.startDate, 20260101);
  assert.equal(year.endDate, 20270101);
  assert.equal(all.startDate, null);
  assert.equal(all.endDate, null);
});

test("period filter falls back safely for invalid values", () => {
  const period = resolvePeriod(parsePeriodQuery({ period: "month", month: "bad" }), options);

  assert.equal(period.mode, "month");
  assert.equal(period.month, "2026-05");
  assert.equal(period.startDate, 20260501);
  assert.equal(period.endDate, 20260601);
});

test("period filter current fallback uses KST date boundaries", () => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = "UTC";
  const kstBoundaryOptions = {
    years: [
      { value: "2026", label: "2026년" },
      { value: "2025", label: "2025년" },
    ],
    months: [
      { value: "2026-06", label: "2026년 6월" },
      { value: "2026-05", label: "2026년 5월" },
    ],
  };

  try {
    const kstMidnightFromUtc = new Date("2026-05-31T15:05:00Z");
    const month = resolvePeriod(parsePeriodQuery({ period: "month", month: "bad" }), kstBoundaryOptions, kstMidnightFromUtc);
    const year = resolvePeriod(parsePeriodQuery({ period: "year", year: "bad" }), kstBoundaryOptions, kstMidnightFromUtc);
    const quarter = resolvePeriod(parsePeriodQuery({ period: "quarter", year: "2026", quarter: "bad" }), kstBoundaryOptions, kstMidnightFromUtc);

    assert.equal(month.month, "2026-06");
    assert.equal(month.startDate, 20260601);
    assert.equal(month.endDate, 20260701);
    assert.equal(year.year, "2026");
    assert.equal(quarter.quarter, "2");
  } finally {
    process.env.TZ = originalTimezone;
  }
});

test("period options include current KST month even before entries exist", () => {
  const kstMidnightFromUtc = new Date("2026-05-31T15:05:00Z");
  const periodOptions = buildPeriodOptions([
    { value: "2026-05", label: "2026년 5월" },
  ], kstMidnightFromUtc);

  assert.deepEqual(periodOptions.months.map((month) => month.value), ["2026-06", "2026-05"]);
  assert.deepEqual(periodOptions.months.map((month) => month.label), ["2026년 6월", "2026년 5월"]);
  assert.deepEqual(periodOptions.years.map((year) => year.value), ["2026"]);
});

test("period options normalize every month label from its own value", () => {
  const kstMidnightFromUtc = new Date("2026-05-31T15:05:00Z");
  const periodOptions = buildPeriodOptions([
    { value: "2026-05", label: "2026년 5월" },
    { value: "2026-04", label: "2026년 5월" },
  ], kstMidnightFromUtc);

  assert.deepEqual(periodOptions.months, [
    { value: "2026-06", label: "2026년 6월" },
    { value: "2026-05", label: "2026년 5월" },
    { value: "2026-04", label: "2026년 4월" },
  ]);
});
