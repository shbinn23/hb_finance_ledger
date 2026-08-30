import assert from "node:assert/strict";
import test from "node:test";
import type { DashboardLedgerEntryRequest, DashboardLedgerEntryResult } from "../ledger/ledger-entry-service.ts";
import type { NormalizedPyeonhanTransaction } from "./pyeonhan-types.ts";
import {
  applyAutoCreatableRows,
  type AutoImportRow,
} from "./pyeonhan-import-service.ts";

function transaction(overrides: Partial<NormalizedPyeonhanTransaction> = {}): NormalizedPyeonhanTransaction {
  return {
    sourceRowIndexes: [2],
    occurredDate: "2026-08-30",
    entryType: "expense",
    sourceAssetName: "국민은행",
    counterpartyAssetName: null,
    sourceCategoryName: "선택",
    sourceSubcategoryName: "식비",
    item: "점심",
    memo: "",
    postingAmount: 9000,
    approvalAmount: 9000,
    discountAmount: 0,
    currency: "KRW",
    occurrenceIndex: 1,
    sourceIdentityKey: "a".repeat(64),
    sourceContentHash: "b".repeat(64),
    transferPairComplete: true,
    ...overrides,
  };
}

function row(overrides: Partial<AutoImportRow> = {}): AutoImportRow {
  return {
    transaction: transaction(),
    status: "auto_creatable",
    reason: "new",
    matchedWhooingEntryId: null,
    mapping: {
      sourceAccount: { mappingType: "asset", sourceKey: "국민은행", accountType: "assets", accountId: "a1", confidence: 1 },
      counterpartyAccount: null,
      categoryAccount: { mappingType: "expense_category", sourceKey: "선택 / 식비", accountType: "expenses", accountId: "e1", confidence: 1 },
    },
    ...overrides,
  };
}

const success: DashboardLedgerEntryResult = {
  ok: true,
  entryStatus: "created",
  entryId: 1429000,
  syncStatus: "synced",
  syncReason: null,
  benefitStatus: "skipped",
  message: "created",
};

test("auto import creates only auto-creatable rows with deterministic operation keys", async () => {
  const requests: DashboardLedgerEntryRequest[] = [];
  const result = await applyAutoCreatableRows({
    rows: [
      row(),
      row({ status: "possible_update", transaction: transaction({ sourceIdentityKey: "c".repeat(64) }) }),
      row({ status: "conflict", transaction: transaction({ sourceIdentityKey: "d".repeat(64) }) }),
    ],
    createEntry: async (request) => {
      requests.push(request);
      return success;
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].operationKey, `pyeonhan:${"a".repeat(64)}`);
  assert.equal(requests[0].source, "pyeonhan_excel");
  assert.equal(requests[0].type, "expense");
  assert.equal(result.created, 1);
  assert.equal(result.skipped, 2);
});

test("auto import maps income and transfer directions to dashboard ledger requests", async () => {
  const requests: DashboardLedgerEntryRequest[] = [];
  const income = row({
    transaction: transaction({ entryType: "income", sourceIdentityKey: "e".repeat(64) }),
    mapping: {
      sourceAccount: { mappingType: "asset", sourceKey: "국민은행", accountType: "assets", accountId: "a1", confidence: 1 },
      counterpartyAccount: null,
      categoryAccount: { mappingType: "income_category", sourceKey: "급여", accountType: "income", accountId: "i1", confidence: 1 },
    },
  });
  const transfer = row({
    transaction: transaction({
      entryType: "transfer",
      counterpartyAssetName: "우체국",
      sourceIdentityKey: "f".repeat(64),
    }),
    mapping: {
      sourceAccount: { mappingType: "asset", sourceKey: "국민은행", accountType: "assets", accountId: "a1", confidence: 1 },
      counterpartyAccount: { mappingType: "asset", sourceKey: "우체국", accountType: "assets", accountId: "a2", confidence: 1 },
      categoryAccount: null,
    },
  });

  await applyAutoCreatableRows({
    rows: [income, transfer],
    createEntry: async (request) => {
      requests.push(request);
      return success;
    },
  });

  assert.equal(requests[0].type, "income");
  assert.equal(requests[0].depositAccountId, "a1");
  assert.equal(requests[0].incomeAccountId, "i1");
  assert.equal(requests[1].type, "transfer");
  assert.equal(requests[1].fromAccountId, "a1");
  assert.equal(requests[1].toAccountId, "a2");
});

test("auto import reports ledger failures without retrying review rows", async () => {
  const failed: DashboardLedgerEntryResult = {
    ok: false,
    reason: "operation_pending",
    message: "duplicate blocked",
    fieldErrors: {},
  };
  const result = await applyAutoCreatableRows({
    rows: [row()],
    createEntry: async () => failed,
  });

  assert.equal(result.created, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.results[0].message, "duplicate blocked");
});
