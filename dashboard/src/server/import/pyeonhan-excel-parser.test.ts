import assert from "node:assert/strict";
import test from "node:test";
import {
  PyeonhanExcelFormatError,
  parsePyeonhanRows,
} from "./pyeonhan-excel-parser.ts";

const header = [
  "기간", "자산", "분류", "소분류", "내용", "KRW",
  "수입/지출", "추가입력", "금액", "화폐", "자산",
];

test("parsePyeonhanRows validates the positional 11-column contract", () => {
  assert.throws(
    () => parsePyeonhanRows([[...header.slice(0, 10), "잔액"]]),
    PyeonhanExcelFormatError,
  );
});

test("parsePyeonhanRows parses Excel serial dates and duplicate asset headers by position", () => {
  const result = parsePyeonhanRows([
    header,
    [46264.75, "국민 나사카", "선택", "카페·간식", "편의점", 3600, "지출", null, 4000, "KRW", 3600],
  ]);

  assert.equal(result.transactions[0].occurredDate, "2026-08-30");
  assert.equal(result.transactions[0].sourceAssetName, "국민 나사카");
  assert.equal(result.transactions[0].postingAmount, 3600);
  assert.equal(result.transactions[0].approvalAmount, 4000);
  assert.equal(result.transactions[0].discountAmount, 400);
});

test("parsePyeonhanRows supports expense, income, and difference-income rows", () => {
  const result = parsePyeonhanRows([
    header,
    [46264, "국민은행", "필수", "식비", "점심", 9000, "지출", "회사", 9000, "KRW", 9000],
    [46264, "국민은행", "근로소득", null, "급여", 3000000, "수입", null, 3000000, "KRW", 3000000],
    [46264, "현금", "잔고조정", null, "차액", 1000, "차액수입", null, 1000, "KRW", 1000],
  ]);

  assert.deepEqual(result.transactions.map((row) => row.entryType), [
    "expense",
    "income",
    "difference_income",
  ]);
  assert.equal(result.transactions[0].memo, "회사");
});

test("parsePyeonhanRows merges reciprocal transfer rows into one transfer", () => {
  const result = parsePyeonhanRows([
    header,
    [46256, "우체국", "국민은행", null, null, 100000, "이체입금", null, 100000, "KRW", 100000],
    [46256, "국민은행", "우체국", null, null, 100000, "이체출금", null, 100000, "KRW", 100000],
  ]);

  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].entryType, "transfer");
  assert.equal(result.transactions[0].sourceAssetName, "국민은행");
  assert.equal(result.transactions[0].counterpartyAssetName, "우체국");
  assert.deepEqual(result.transactions[0].sourceRowIndexes, [2, 3]);
});

test("parsePyeonhanRows keeps identical real transactions distinct with occurrence indexes", () => {
  const duplicate = [46249, "하나 MG+S", "선택", "식비", "배달", 10400, "지출", null, 10400, "KRW", 10400];
  const result = parsePyeonhanRows([header, duplicate, duplicate]);

  assert.equal(result.transactions.length, 2);
  assert.deepEqual(result.transactions.map((row) => row.occurrenceIndex), [1, 2]);
  assert.notEqual(result.transactions[0].sourceIdentityKey, result.transactions[1].sourceIdentityKey);
  assert.equal(result.transactions[0].sourceContentHash, result.transactions[1].sourceContentHash);
});

test("parsePyeonhanRows keeps identity stable while content changes are detectable", () => {
  const original = parsePyeonhanRows([
    header,
    [46249, "국민은행", "선택", "식비", "점심", 9000, "지출", null, 9000, "KRW", 9000],
  ]).transactions[0];
  const changed = parsePyeonhanRows([
    header,
    [46249, "국민은행", "필수", "식비", "점심 수정", 9000, "지출", "수정", 9000, "KRW", 9000],
  ]).transactions[0];

  assert.equal(original.sourceIdentityKey, changed.sourceIdentityKey);
  assert.notEqual(original.sourceContentHash, changed.sourceContentHash);
});
