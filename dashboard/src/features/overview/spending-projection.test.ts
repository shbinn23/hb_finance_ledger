import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("overview spending chart exposes actual-adjusted ML projection", () => {
  const modelSource = readFileSync(resolve(__dirname, "model.ts"), "utf8");
  const typeSource = readFileSync(resolve(__dirname, "types.ts"), "utf8");
  const chartSource = readFileSync(resolve(__dirname, "components/spending-chart.tsx"), "utf8");
  const tooltipSource = readFileSync(resolve(__dirname, "../../components/charts/forecast-tooltip.tsx"), "utf8");

  assert.match(typeSource, /actualProjection: number \| null/);
  assert.match(modelSource, /actualProjection/);
  assert.match(modelSource, /actualToday \+ \(point\.projected - mlToday\)/);
  assert.match(chartSource, /dataKey="actualProjection"/);
  assert.match(chartSource, /실지출 예상/);
  assert.match(tooltipSource, /현재 실제 지출에 ML 잔여 예측을 더한 값/);
});

test("overview summary uses actual projection final with available resource and sync cards", () => {
  const modelSource = readFileSync(resolve(__dirname, "model.ts"), "utf8");
  const globalCss = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");

  assert.match(modelSource, /actualProjectionFinal/);
  assert.match(modelSource, /id: "available-resource"/);
  assert.match(modelSource, /label: "가용 리소스"/);
  assert.match(modelSource, /id: "sync"/);
  assert.match(modelSource, /label: "동기화"/);
  assert.match(modelSource, /monthlyIncome = 3_110_000/);
  assert.match(modelSource, /monthlySavingTarget = 1_000_000/);
  assert.match(modelSource, /reservedFixedTotal/);
  assert.match(modelSource, /currentVariableSpend/);
  assert.match(modelSource, /monthlyIncome - monthlySavingTarget - reservedFixedTotal/);
  assert.match(modelSource, /variableSpendPool - currentVariableSpend/);
  assert.doesNotMatch(modelSource, /monthlyIncome - monthlySavingTarget - projectedActualMonthTotal/);
  assert.match(modelSource, /월말까지 변동지출 여유/);
  assert.match(modelSource, /변동지출 리소스/);
  assert.match(modelSource, /ML 예상/);
  assert.match(globalCss, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
});

test("overview repository exposes monthly expense category totals for resource reservation", () => {
  const repositorySource = readFileSync(resolve(__dirname, "../../server/whooing/repository.ts"), "utf8");
  const typeSource = readFileSync(resolve(__dirname, "model.ts"), "utf8");

  assert.match(typeSource, /currentExpenseByCategory/);
  assert.match(repositorySource, /getCurrentExpenseByCategory/);
  assert.match(repositorySource, /coalesce\(a\.category, 'normal'\) as category/);
  assert.match(repositorySource, /getCurrentExpenseByCategory\(\)/);
});
