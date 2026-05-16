import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("ML metrics include forecast confidence based on actual versus ML projection error", () => {
  const serviceSource = readFileSync(resolve(__dirname, "service.ts"), "utf8");

  assert.match(serviceSource, /forecastConfidence/);
  assert.match(serviceSource, /label: "예측 신뢰도"/);
  assert.match(serviceSource, /실제 누적과 ML 예상 오차/);
  assert.match(serviceSource, /actual - projected/);
  assert.match(serviceSource, /100 - errorRate/);
});
