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

test("ML page uses shared right insight panel data for model interpretation", () => {
  const pageSource = readFileSync(resolve(__dirname, "components/ml-page.tsx"), "utf8");
  const typeSource = readFileSync(resolve(__dirname, "types.ts"), "utf8");
  const serviceSource = readFileSync(resolve(__dirname, "service.ts"), "utf8");

  assert.match(typeSource, /rightInsightPanels: RightInsightPanelCard\[\]/);
  assert.match(pageSource, /<RightInsightPanel model=\{model\} \/>/);
  assert.match(serviceSource, /buildMlRightInsightPanels/);
  assert.match(serviceSource, /모델 경계/);
  assert.match(serviceSource, /실제 vs ML/);
  assert.match(serviceSource, /위험 원인/);
  assert.match(serviceSource, /모델 입력/);
  assert.match(serviceSource, /다음 행동/);
  assert.match(serviceSource, /calculateSavingDefenseBalance/);
  assert.match(serviceSource, /calculateAvailableResource/);
  assert.match(serviceSource, /FINANCIAL_PLAN/);
  assert.match(serviceSource, /가용 리소스 \/ 남은 일수/);
  assert.doesNotMatch(serviceSource, /monthlyLimit - currentSpend/);
});
