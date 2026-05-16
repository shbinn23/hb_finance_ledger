import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, "../..");

test("trend and budget pages use the common period filter query shape", () => {
  const trendPage = readFileSync(resolve(srcRoot, "app/trend/page.tsx"), "utf8");
  const budgetPage = readFileSync(resolve(srcRoot, "app/budget/page.tsx"), "utf8");
  const sectionPage = readFileSync(resolve(__dirname, "components/section-page.tsx"), "utf8");
  const serviceSource = readFileSync(resolve(__dirname, "service.ts"), "utf8");
  const repoSource = readFileSync(resolve(srcRoot, "server/whooing/analytics-repository.ts"), "utf8");

  assert.match(trendPage, /parsePeriodQuery/);
  assert.match(budgetPage, /parsePeriodQuery/);
  assert.match(trendPage, /period\?: string \| string\[\]/);
  assert.match(budgetPage, /quarter\?: string \| string\[\]/);
  assert.match(sectionPage, /periodFilterKeys/);
  assert.match(sectionPage, /<PeriodFilter options=\{model\.periodOptions\} value=\{model\.selectedPeriod\}/);
  assert.match(serviceSource, /periodFilterKeys/);
  assert.match(serviceSource, /getCategoryAnalytics\([^)]*selectedPeriod/s);
  assert.match(serviceSource, /getFixedExpenseSummary\([^)]*selectedPeriod/s);
  assert.match(repoSource, /period\?: ResolvedPeriod \| null/);
  assert.match(repoSource, /\$2::int is null or .*entry_date >= \$2/s);
  assert.match(repoSource, /\$3::int is null or .*entry_date < \$3/s);
});

test("budget hides monthly D-day schedule when the selected period is not month", () => {
  const sectionPage = readFileSync(resolve(__dirname, "components/section-page.tsx"), "utf8");

  assert.match(sectionPage, /model\.selectedPeriod\?\.mode !== "month"/);
  assert.match(sectionPage, /선택 기간 고정지출 합계/);
  assert.match(sectionPage, /월별 처리 예정일은 월 필터에서 확인/);
});
