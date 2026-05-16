import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, "../..");

test("accounting page supports read-only row drill-down for cash asset and liability sections", () => {
  const typeSource = readFileSync(resolve(__dirname, "types.ts"), "utf8");
  const serviceSource = readFileSync(resolve(__dirname, "service.ts"), "utf8");
  const repoSource = readFileSync(resolve(srcRoot, "server/whooing/accounting-repository.ts"), "utf8");
  const pageSource = readFileSync(resolve(__dirname, "components/accounting-page.tsx"), "utf8");

  assert.match(typeSource, /AccountingDrillDownEntry/);
  assert.match(typeSource, /drillDownEntries/);
  assert.match(serviceSource, /getAccountingDrillDownEntries/);
  assert.match(repoSource, /getAccountingDrillDownEntries/);
  assert.match(repoSource, /order by e\.entry_date desc/);
  assert.match(pageSource, /"use client"/);
  assert.match(pageSource, /useState/);
  assert.match(pageSource, /선택 항목 상세 거래/);
  assert.match(pageSource, /clearSelection/);
  assert.match(pageSource, /\.slice\(0, 50\)/);
  assert.match(pageSource, /flowKey === selection.key/);
  assert.match(pageSource, /entry\.lAccount === "assets"/);
  assert.match(pageSource, /entry\.rAccount === "liabilities"/);
});
