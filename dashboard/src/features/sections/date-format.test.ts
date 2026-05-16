import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("dashboard repositories do not emit mixed full-date display formats", () => {
  const overviewRepository = readFileSync(resolve(__dirname, "../../server/whooing/repository.ts"), "utf8");
  const analyticsRepository = readFileSync(resolve(__dirname, "../../server/whooing/analytics-repository.ts"), "utf8");
  const sectionPage = readFileSync(resolve(__dirname, "components/section-page.tsx"), "utf8");
  const mlService = readFileSync(resolve(__dirname, "../ml/service.ts"), "utf8");

  assert.doesNotMatch(overviewRepository, /'MM\.DD'/);
  assert.match(overviewRepository, /formatDisplayDateTime/);
  assert.match(analyticsRepository, /formatDisplayDateTime/);
  assert.match(analyticsRepository, /`\$\{yyyymm\.slice\(0, 4\)\}\.\$\{yyyymm\.slice\(4, 6\)\}`/);
  assert.match(sectionPage, /<td>\{row\.label\}<\/td>/);
  assert.doesNotMatch(sectionPage, /<td>\{row\.ym\}<\/td>/);
  assert.match(mlService, /formatDisplayDate/);
  assert.doesNotMatch(mlService, /value: forecastTask\.today/);
});
