import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, "../..");

test("ledger uses the common period filter and period-scoped ledger rows", () => {
  const pageSource = readFileSync(resolve(srcRoot, "app/ledger/page.tsx"), "utf8");
  const serviceSource = readFileSync(resolve(__dirname, "service.ts"), "utf8");
  const typeSource = readFileSync(resolve(__dirname, "types.ts"), "utf8");
  const pageComponentSource = readFileSync(resolve(__dirname, "components/section-page.tsx"), "utf8");
  const workbenchSource = readFileSync(resolve(__dirname, "components/ledger-workbench.tsx"), "utf8");
  const repoSource = readFileSync(resolve(srcRoot, "server/whooing/analytics-repository.ts"), "utf8");

  assert.match(pageSource, /parsePeriodQuery/);
  assert.match(pageSource, /period/);
  assert.match(pageSource, /year/);
  assert.match(pageSource, /quarter/);
  assert.match(serviceSource, /periodQuery/);
  assert.match(serviceSource, /resolvePeriod/);
  assert.match(typeSource, /periodOptions/);
  assert.match(typeSource, /selectedPeriod/);
  assert.match(pageComponentSource, /PeriodFilter/);
  assert.doesNotMatch(workbenchSource, /useQueryState\("month"/);
  assert.match(repoSource, /period\?: ResolvedPeriod/);
  assert.match(repoSource, /\$2::int is null or .*entry_date >= \$2/s);
  assert.match(repoSource, /\$3::int is null or .*entry_date < \$3/s);
});
