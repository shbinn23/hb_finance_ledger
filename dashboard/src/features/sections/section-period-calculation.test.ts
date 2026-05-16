import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("section metrics do not treat month periods as aggregate ranges", () => {
  const serviceSource = readFileSync(resolve(__dirname, "service.ts"), "utf8");

  assert.match(serviceSource, /function isPeriodAggregate/);
  assert.match(serviceSource, /function selectedExpenseTotal/);
  assert.match(serviceSource, /model\.selectedPeriod\?\.mode !== "month"/);
  assert.match(serviceSource, /getPeriodAggregate\(basisMonth, selectedPeriod\)/);
  assert.match(serviceSource, /return model\.periodAggregate\.expenses/);
  assert.match(serviceSource, /return model\.periodAggregate\.income/);
  assert.match(serviceSource, /return model\.periodAggregate\.cardPayment/);
  assert.doesNotMatch(serviceSource, /function selectedPeriodSpend/);
  assert.doesNotMatch(serviceSource, /function selectedPeriodIncome/);
  assert.doesNotMatch(serviceSource, /model\.selectedPeriod \? periodSpend : spend/);
  assert.doesNotMatch(serviceSource, /model\.selectedPeriod \? selectedPeriodSpend\(model\.monthlyTrend\) : currentMonthSpend/);
  assert.doesNotMatch(serviceSource, /selectedExpenseTotal[\s\S]*monthlyTrend\.reduce/);
});

test("trend period cards keep total and monthly-average dimensions separate", () => {
  const serviceSource = readFileSync(resolve(__dirname, "service.ts"), "utf8");

  assert.match(serviceSource, /selectedIncomeTotal/);
  assert.match(serviceSource, /selectedCardPaymentTotal/);
  assert.match(serviceSource, /label: "평균 대비"/);
  assert.match(serviceSource, /label: "집계 월수"/);
  assert.match(serviceSource, /value: `\$\{model\.monthlyTrend\.length\}개월`/);
  assert.doesNotMatch(serviceSource, /detail: "선택 기간 \/ 월 평균"/);
});
