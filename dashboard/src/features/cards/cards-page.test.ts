import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const srcRoot = resolve(import.meta.dirname, "../..");

test("cards page owns card benefit and statement beta content", () => {
  const pageSource = readFileSync(resolve(srcRoot, "app/cards/page.tsx"), "utf8");
  const serviceSource = readFileSync(resolve(import.meta.dirname, "service.ts"), "utf8");
  const componentSource = readFileSync(resolve(import.meta.dirname, "components/cards-page.tsx"), "utf8");
  const sectionSource = readFileSync(resolve(import.meta.dirname, "../sections/components/section-page.tsx"), "utf8");

  assert.match(pageSource, /getCardsViewModel/);
  assert.match(serviceSource, /카드 관리/);
  assert.match(componentSource, /카드혜택 Beta/);
  assert.match(componentSource, /카드별 혜택 한도 상태/);
  assert.match(componentSource, /카드 실적 예상 Beta/);
  assert.match(componentSource, /카드 명세서 예측 Beta/);
  assert.match(componentSource, /자동 산정 한도/);
  assert.match(componentSource, /기록된 할인/);
  assert.match(componentSource, /자동 잔여 한도/);
  assert.match(componentSource, /백필 기준/);
  assert.match(componentSource, /승인금액/);
  assert.match(componentSource, /실적 예상/);
  assert.match(componentSource, /매입금액/);
  assert.match(serviceSource, /구조화\/백필 이벤트 기준/);
  assert.doesNotMatch(serviceSource, /MG\+S 한도/);
  assert.doesNotMatch(componentSource, /MG\+S 한도/);
  assert.doesNotMatch(componentSource, /사용 할인/);
  assert.doesNotMatch(serviceSource, /수동 등록/);
  assert.doesNotMatch(componentSource, /수동 등록/);
  assert.doesNotMatch(sectionSource, /카드혜택 Beta/);
  assert.doesNotMatch(sectionSource, /카드별 혜택 한도 상태/);
  assert.doesNotMatch(sectionSource, /카드 실적 예상 Beta/);
  assert.doesNotMatch(sectionSource, /카드 명세서 예측 Beta/);
});
