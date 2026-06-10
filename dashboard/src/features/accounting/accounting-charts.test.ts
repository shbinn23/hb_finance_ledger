import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("accounting page renders professional chart layer before detailed tables", () => {
  const pageSource = readFileSync(resolve(__dirname, "components/accounting-page.tsx"), "utf8");
  const chartSource = readFileSync(resolve(__dirname, "components/accounting-charts.tsx"), "utf8");

  assert.match(pageSource, /<AccountingCharts model=\{model\} \/>/);
  assert.doesNotMatch(pageSource, /<PageNarrative/);
  assert.doesNotMatch(pageSource, /accounting-report-deck/);
  assert.match(chartSource, /기간손익 추이/);
  assert.match(chartSource, /현금흐름 활동별 분해/);
  assert.match(chartSource, /자산변동 계정별 순증감/);
  assert.match(chartSource, /부채·카드 사용\/상환 비교/);
  assert.match(chartSource, /ResponsiveContainer/);
  assert.match(chartSource, /includedInNetCashFlow/);
  assert.match(chartSource, /liabilityIncrease/);
  assert.match(chartSource, /liabilityDecrease/);
});
