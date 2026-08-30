import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(import.meta.dirname, "imports-page.tsx"), "utf8");

test("imports page exposes review-first Excel dry-run and guarded automatic creation", () => {
  assert.match(source, /편한가계부 가져오기/);
  assert.match(source, /dry-run 비교/);
  assert.match(source, /자동등록 가능/);
  assert.match(source, /매핑 필요/);
  assert.match(source, /수정 후보/);
  assert.match(source, /삭제 후보/);
  assert.match(source, /충돌/);
  assert.match(source, /신규 확정 거래 자동 등록/);
  assert.match(source, /수정·삭제 후보는 표시만 하며 자동 반영하지 않습니다/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /migration 미적용 상태/);
  assert.match(source, /현재 Gmail 자동 감지는 설정 전입니다/);
  assert.match(source, /매핑 상태/);
  assert.match(source, /승인금액/);
  assert.match(source, /할인액/);
  assert.match(source, /카드혜택 후보/);
});
