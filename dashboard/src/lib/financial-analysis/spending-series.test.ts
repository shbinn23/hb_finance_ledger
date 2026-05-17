import assert from "node:assert/strict";
import test from "node:test";
import { buildSpendingSeries } from "./spending-series.ts";

test("financial spending series carries actual forward through observed no-spend days", () => {
  const forecast = {
    today: "2026-05-16",
    series: Array.from({ length: 31 }, (_, index) => {
      const day = index + 1;
      return {
        day,
        ai: null,
        projected: day * 100_000,
        upper: day * 110_000,
        lower: day * 90_000,
      };
    }),
  };

  const points = buildSpendingSeries(
    [{ day: 15, amount: 1_180_343 }],
    [],
    forecast,
  );

  assert.equal(points.find((point) => point.day === 15)?.actual, 1_180_343);
  assert.equal(points.find((point) => point.day === 16)?.actual, 1_180_343);
  assert.equal(points.find((point) => point.day === 17)?.actual, null);
});

test("financial spending series starts actual projection at observed day", () => {
  const forecast = {
    today: "2026-05-16",
    series: Array.from({ length: 31 }, (_, index) => {
      const day = index + 1;
      return {
        day,
        ai: null,
        projected: day * 100_000,
        upper: day * 110_000,
        lower: day * 90_000,
      };
    }),
  };

  const points = buildSpendingSeries(
    [{ day: 15, amount: 1_180_343 }],
    [],
    forecast,
  );

  assert.equal(points.find((point) => point.day === 15)?.actualProjection, null);
  assert.equal(points.find((point) => point.day === 16)?.actualProjection, 1_180_343);
  assert.equal(points.find((point) => point.day === 17)?.actualProjection, 1_280_343);
});
