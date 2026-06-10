import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/components/layout/shell.tsx"), "utf8");

test("topbar operation buttons use explicit request and refresh labels", () => {
  assert.match(source, /동기화 요청/);
  assert.match(source, /요청 완료/);
  assert.match(source, /화면 갱신/);
  assert.doesNotMatch(source, /후잉 동기화/);
  assert.doesNotMatch(source, />\s*갱신\s*</);
});

test("sync request asks for confirmation before workflow dispatch", () => {
  assert.match(source, /window\.confirm/);
  assert.match(source, /후잉 데이터를 다시 동기화 요청합니다/);
  assert.match(source, /후잉 원장을 수정하지 않지만/);
  assert.match(source, /로컬 DB의 whooing 데이터를 갱신할 수 있습니다/);
});
