import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, "../..");

test("analysis and habits pages use the common period filter query shape", () => {
  const analysisPage = readFileSync(resolve(srcRoot, "app/analysis/page.tsx"), "utf8");
  const habitsPage = readFileSync(resolve(srcRoot, "app/habits/page.tsx"), "utf8");
  const sectionPage = readFileSync(resolve(__dirname, "components/section-page.tsx"), "utf8");
  const serviceSource = readFileSync(resolve(__dirname, "service.ts"), "utf8");
  const repoSource = readFileSync(resolve(srcRoot, "server/whooing/analytics-repository.ts"), "utf8");

  assert.match(analysisPage, /parsePeriodQuery/);
  assert.match(habitsPage, /parsePeriodQuery/);
  assert.match(analysisPage, /period\?: string \| string\[\]/);
  assert.match(habitsPage, /quarter\?: string \| string\[\]/);
  assert.match(sectionPage, /"analysis"/);
  assert.match(sectionPage, /"habits"/);
  assert.match(serviceSource, /periodFilterKeys.*analysis.*habits/s);
  assert.match(serviceSource, /getMerchantHabits\([^)]*selectedPeriod/s);
  assert.match(repoSource, /export async function getMerchantHabits\([^)]*period\?: ResolvedPeriod \| null/s);
  assert.match(repoSource, /\$2::int is null or .*entry_date >= \$2/s);
  assert.match(repoSource, /\$3::int is null or .*entry_date < \$3/s);
});

test("habits no-spend days are calculated from the selected period range", () => {
  const serviceSource = readFileSync(resolve(__dirname, "service.ts"), "utf8");

  assert.match(serviceSource, /periodDayCount/);
  assert.match(serviceSource, /dateRangeDayCount/);
  assert.match(serviceSource, /row\.kind === "expense"/);
  assert.match(serviceSource, /model\.selectedPeriod\?\.mode === "all"/);
  assert.match(serviceSource, /무지출일.*선택 기간 기준/s);
});
