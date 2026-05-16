import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("accounting page exposes five summary cards and professional cash/liability columns", () => {
  const modelSource = readFileSync(resolve(__dirname, "model.ts"), "utf8");
  const typeSource = readFileSync(resolve(__dirname, "types.ts"), "utf8");
  const pageSource = readFileSync(resolve(__dirname, "components/accounting-page.tsx"), "utf8");

  assert.match(modelSource, /label: "검산 상태"/);
  assert.match(modelSource, /모든 거래 조합 분류 완료/);
  assert.match(modelSource, /미분류 .*건 확인 필요/);
  assert.match(typeSource, /includedInNetCashFlow: boolean/);
  assert.match(typeSource, /activity: string/);
  assert.match(typeSource, /status: string/);
  assert.match(pageSource, /현금흐름 반영/);
  assert.match(pageSource, /포함/);
  assert.match(pageSource, /제외/);
  assert.match(pageSource, /사용 증가/);
  assert.match(pageSource, /상환 감소/);
  assert.match(pageSource, /부채 증가/);
  assert.match(pageSource, /상환 우위/);
  assert.match(pageSource, /변동 없음/);
});
