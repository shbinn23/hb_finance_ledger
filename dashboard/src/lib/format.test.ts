import assert from "node:assert/strict";
import test from "node:test";
import { formatDisplayDate, formatDisplayDateTime } from "./format.ts";

test("formatDisplayDate uses the dashboard date format", () => {
  assert.equal(formatDisplayDate("2026-05-16"), "2026.05.16");
  assert.equal(formatDisplayDate("20260516"), "2026.05.16");
  assert.equal(formatDisplayDate(new Date("2026-05-16T02:03:00+09:00")), "2026.05.16");
});

test("formatDisplayDateTime uses the dashboard date-time format", () => {
  assert.equal(formatDisplayDateTime(new Date("2026-05-16T02:03:00+09:00")), "2026.05.16 02:03");
});
