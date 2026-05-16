import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, "../..");

test("accounting supports common period search params and read-only scoped aggregation", () => {
  const pageSource = readFileSync(resolve(srcRoot, "app/accounting/page.tsx"), "utf8");
  const serviceSource = readFileSync(resolve(__dirname, "service.ts"), "utf8");
  const typeSource = readFileSync(resolve(__dirname, "types.ts"), "utf8");
  const repoSource = readFileSync(resolve(srcRoot, "server/whooing/accounting-repository.ts"), "utf8");
  const pageComponentSource = readFileSync(resolve(__dirname, "components/accounting-page.tsx"), "utf8");

  assert.match(pageSource, /searchParams/);
  assert.match(pageSource, /parsePeriodQuery/);
  assert.match(pageSource, /period/);
  assert.match(pageSource, /year/);
  assert.match(pageSource, /quarter/);
  assert.match(pageSource, /month/);
  assert.match(serviceSource, /getAvailableAccountingMonths/);
  assert.match(serviceSource, /resolvePeriod/);
  assert.match(typeSource, /periodOptions/);
  assert.match(typeSource, /selectedPeriod/);
  assert.match(pageComponentSource, /PeriodFilter/);
  assert.match(repoSource, /\$2::int is null or .*entry_date >= \$2/s);
  assert.match(repoSource, /\$3::int is null or .*entry_date < \$3/s);
});

test("accounting charts use muted report palette and explanatory tooltips", () => {
  const chartSource = readFileSync(resolve(__dirname, "components/accounting-charts.tsx"), "utf8");

  assert.match(chartSource, /accountingPalette/);
  assert.doesNotMatch(chartSource, /var\(--green\)/);
  assert.match(chartSource, /수익 - 비용/);
  assert.match(chartSource, /순현금흐름 포함/);
  assert.match(chartSource, /내부이체라 순현금흐름 제외/);
  assert.match(chartSource, /자산 증가 - 자산 감소/);
  assert.match(chartSource, /사용 증가/);
  assert.match(chartSource, /상환 감소/);
  assert.match(chartSource, /TODO: account row drill-down/);
});
