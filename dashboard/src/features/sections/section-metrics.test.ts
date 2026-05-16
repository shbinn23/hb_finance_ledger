import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("section metrics include one page-specific summary card per section", () => {
  const serviceSource = readFileSync(resolve(__dirname, "service.ts"), "utf8");
  const cssSource = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");

  assert.match(serviceSource, /label: "최근 입력"/);
  assert.match(serviceSource, /최근 7일 원장 기준/);
  assert.match(serviceSource, /label: "실지출 예상"/);
  assert.match(serviceSource, /현재 지출 \+ ML 잔여 예측/);
  assert.match(serviceSource, /label: "가용 리소스"/);
  assert.match(serviceSource, /월말까지 변동지출 여유/);
  assert.match(serviceSource, /저축 목표 방어에 .* 부족/);
  assert.match(serviceSource, /label: "부채 비중"/);
  assert.match(serviceSource, /총 자산 대비 부채/);
  assert.match(serviceSource, /label: "관찰 신호"/);
  assert.match(serviceSource, /평균 대비 관찰 대상/);
  assert.match(serviceSource, /label: "무지출일"/);
  assert.match(serviceSource, /선택 기간 기준/);
  assert.match(cssSource, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
});
