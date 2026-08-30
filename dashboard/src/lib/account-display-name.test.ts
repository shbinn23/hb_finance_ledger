import assert from "node:assert/strict";
import test from "node:test";
import { getAccountDisplayKey, getAccountDisplayName } from "./account-display-name.ts";

test("account display name uses account type and id as stable key", () => {
  assert.equal(getAccountDisplayKey("assets", "x35"), "assets:x35");
});

test("account display name maps known asset accounts", () => {
  assert.equal(getAccountDisplayName("assets", "x35", "네이버CMA"), "네이버 CMA");
  assert.equal(getAccountDisplayName("assets", "x97", "신한참신한파킹"), "신한 참신한파킹");
});

test("account display name maps known liability accounts", () => {
  assert.equal(getAccountDisplayName("liabilities", "x45", "하나MGS"), "하나 MG+S");
});

test("account display name falls back to source title", () => {
  assert.equal(getAccountDisplayName("assets", "x3", "국민은행"), "국민은행");
});

test("account display name falls back for unknown account type", () => {
  assert.equal(getAccountDisplayName("expenses", "x1", "식비"), "식비");
});
