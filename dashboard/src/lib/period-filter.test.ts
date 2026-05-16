import assert from "node:assert/strict";
import test from "node:test";
import { parsePeriodQuery, resolvePeriod } from "./period-filter.ts";

const options = {
  years: [
    { value: "2026", label: "2026년" },
    { value: "2025", label: "2025년" },
  ],
  months: [
    { value: "2026-05", label: "2026.05" },
    { value: "2026-04", label: "2026.04" },
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
