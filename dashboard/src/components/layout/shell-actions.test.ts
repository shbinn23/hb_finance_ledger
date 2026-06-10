import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/components/layout/shell.tsx"), "utf8");
const dialogSource = fs.readFileSync(path.join(process.cwd(), "src/components/layout/dashboard-ledger-entry-dialog.tsx"), "utf8");
const nextConfigSource = fs.readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
const globalCssSource = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

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

test("dashboard expense entry dialog exposes the expense form and pending entry types", () => {
  for (const label of ["지출", "날짜", "지출 카테고리", "결제수단", "항목명", "금액", "메모", "카드혜택"]) {
    assert.match(dialogSource, new RegExp(label));
  }
  for (const label of ["수입", "이체", "카드상환", "잔고조정", "수입 등록", "이체 등록", "카드상환 등록", "잔고조정 등록"]) {
    assert.match(dialogSource, new RegExp(label));
  }
  assert.doesNotMatch(dialogSource, /ledger-entry-tab" disabled/);
});

test("dashboard expense entry dialog is portaled outside the filtered topbar", () => {
  assert.match(dialogSource, /createPortal/);
  assert.match(dialogSource, /document\.body/);
});

test("dashboard expense entry dialog shows loading and empty option states", () => {
  assert.match(dialogSource, /거래 입력 옵션을 불러오는 중입니다/);
  assert.match(dialogSource, /지출 카테고리가 없습니다/);
  assert.match(dialogSource, /결제수단이 없습니다/);
});

test("Next dev allows the 127.0.0.1 origin used by local dashboard smoke checks", () => {
  assert.match(nextConfigSource, /allowedDevOrigins/);
  assert.match(nextConfigSource, /127\.0\.0\.1/);
});

test("dashboard expense entry dialog stays inside the viewport safe area", () => {
  assert.match(globalCssSource, /\.ledger-entry-modal-backdrop\s*{[^}]*display:\s*flex/s);
  assert.match(globalCssSource, /\.ledger-entry-modal-backdrop\s*{[^}]*align-items:\s*center/s);
  assert.match(globalCssSource, /\.ledger-entry-modal-backdrop\s*{[^}]*justify-content:\s*center/s);
  assert.match(globalCssSource, /\.ledger-entry-modal\s*{[^}]*width:\s*min\(720px,\s*calc\(100vw - 32px\)\)/s);
  assert.match(globalCssSource, /\.ledger-entry-modal\s*{[^}]*max-height:\s*calc\(100vh - 48px\)/s);
  assert.match(globalCssSource, /\.ledger-entry-modal\s*{[^}]*overflow-y:\s*auto/s);
  assert.doesNotMatch(globalCssSource, /\.ledger-entry-modal-backdrop\s*{[^}]*align-items:\s*end/s);
});
