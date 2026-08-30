import assert from "node:assert/strict";
import test from "node:test";
import {
  executeApprovedImportCreates,
  executeApprovedImportUpdate,
  executeImportReviewAction,
  type ImportActionRow,
  type ImportActionOperation,
} from "./import-action-service.ts";

function row(overrides: Partial<ImportActionRow> = {}): ImportActionRow {
  return {
    id: 1,
    status: "auto_creatable",
    sourceIdentityKey: "a".repeat(64),
    sourceContentHash: "b".repeat(64),
    occurredDate: "2026-08-15",
    entryType: "expense",
    item: "점심",
    memo: "",
    postingAmount: 9000,
    sourceAccountType: "liabilities",
    sourceAccountId: "x45",
    categoryAccountId: "x-food",
    counterpartyAccountType: null,
    counterpartyAccountId: null,
    matchedWhooingEntryId: null,
    ...overrides,
  };
}

function dependencies(rows: ImportActionRow[], operation?: ImportActionOperation) {
  const created: unknown[] = [];
  const finished: unknown[] = [];
  const finishedRecords: unknown[] = [];
  const marked: unknown[] = [];
  return {
    created,
    finished,
    finishedRecords,
    marked,
    dependencies: {
      getRows: async (ids: number[]) => rows.filter((candidate) => ids.includes(candidate.id)),
      getOperation: async () => operation ?? null,
      reserveOperation: async () => true,
      finishOperation: async (value: unknown) => { finished.push(value); },
      finishOperationRecord: async (value: unknown) => { finishedRecords.push(value); },
      markRowsReviewed: async (value: unknown) => { marked.push(value); },
      createEntry: async (request: unknown) => {
        created.push(request);
        return {
          ok: true as const,
          entryStatus: "created" as const,
          entryId: 77,
          syncStatus: "synced" as const,
          syncReason: null,
          benefitStatus: "skipped" as const,
          message: "created",
        };
      },
    },
  };
}

test("approved expense, income, and transfer use persisted row mappings", async () => {
  const fixture = dependencies([
    row(),
    row({ id: 2, sourceIdentityKey: "c".repeat(64), entryType: "income", sourceAccountType: "assets", sourceAccountId: "x-bank", categoryAccountId: "x-income" }),
    row({ id: 3, sourceIdentityKey: "d".repeat(64), entryType: "transfer", sourceAccountType: "assets", sourceAccountId: "x-from", categoryAccountId: null, counterpartyAccountType: "assets", counterpartyAccountId: "x-to" }),
  ]);

  const result = await executeApprovedImportCreates({ rowIds: [1, 2, 3], dependencies: fixture.dependencies });

  assert.equal(result.created, 3);
  assert.deepEqual(fixture.created, [
    { type: "expense", occurredDate: "2026-08-15", item: "점심", amount: 9000, memo: "", operationKey: `pyeonhan:${"a".repeat(64)}`, source: "pyeonhan_excel", categoryAccountId: "x-food", paymentAccountType: "liabilities", paymentAccountId: "x45", discountRuleId: null },
    { type: "income", occurredDate: "2026-08-15", item: "점심", amount: 9000, memo: "", operationKey: `pyeonhan:${"c".repeat(64)}`, source: "pyeonhan_excel", incomeAccountId: "x-income", depositAccountId: "x-bank" },
    { type: "transfer", occurredDate: "2026-08-15", item: "점심", amount: 9000, memo: "", operationKey: `pyeonhan:${"d".repeat(64)}`, source: "pyeonhan_excel", fromAccountId: "x-from", toAccountId: "x-to" },
  ]);
});

test("successful prior operation is reused without another Whooing create", async () => {
  const fixture = dependencies([row()], {
    operationKey: `pyeonhan:${"a".repeat(64)}`,
    status: "created",
    whooingEntryId: 55,
    errorMessage: null,
  });
  const result = await executeApprovedImportCreates({ rowIds: [1], dependencies: fixture.dependencies });
  assert.equal(result.reused, 1);
  assert.equal(fixture.created.length, 0);
});

test("review-only and dangerous statuses are never created", async () => {
  const fixture = dependencies([
    row({ id: 1, status: "possible_delete" }),
    row({ id: 2, status: "conflict", sourceIdentityKey: "c".repeat(64) }),
  ]);
  const result = await executeApprovedImportCreates({ rowIds: [1, 2], dependencies: fixture.dependencies });
  assert.equal(result.skipped, 2);
  assert.equal(fixture.created.length, 0);
});

test("transfer approval rejects a non-asset source mapping before Whooing create", async () => {
  const fixture = dependencies([
    row({
      entryType: "transfer",
      sourceAccountType: "liabilities",
      sourceAccountId: "x-card",
      categoryAccountId: null,
      counterpartyAccountId: "x-bank",
    }),
  ]);

  const result = await executeApprovedImportCreates({ rowIds: [1], dependencies: fixture.dependencies });

  assert.equal(result.skipped, 1);
  assert.equal(fixture.created.length, 0);
});

test("transfer approval rejects a non-asset counterparty mapping before Whooing create", async () => {
  const fixture = dependencies([
    row({
      entryType: "transfer",
      sourceAccountType: "assets",
      sourceAccountId: "x-bank",
      categoryAccountId: null,
      counterpartyAccountId: "x-card",
      counterpartyAccountType: "liabilities",
    }),
  ]);

  const result = await executeApprovedImportCreates({ rowIds: [1], dependencies: fixture.dependencies });

  assert.equal(result.skipped, 1);
  assert.equal(fixture.created.length, 0);
});

test("successful Whooing create with pending sync remains a created partial result", async () => {
  const fixture = dependencies([row()]);
  fixture.dependencies.createEntry = async () => ({
    ok: true as const,
    entryStatus: "created" as const,
    entryId: 77,
    syncStatus: "pending" as const,
    syncReason: "timeout" as const,
    benefitStatus: "skipped" as const,
    message: "pending",
  });
  const result = await executeApprovedImportCreates({ rowIds: [1], dependencies: fixture.dependencies });
  assert.equal(result.created, 1);
  assert.equal(result.syncPending, 1);
});

test("skip and review actions update local metadata only", async () => {
  const fixture = dependencies([row({ status: "review_required" })]);
  const result = await executeImportReviewAction({ rowIds: [1], action: "skip", dependencies: fixture.dependencies });
  assert.equal(result.updated, 1);
  assert.deepEqual(fixture.marked, [{ rowIds: [1], action: "skip" }]);
  assert.deepEqual(fixture.finishedRecords, [{
    operationKey: "pyeonhan-skip:1",
    status: "created",
    whooingEntryId: null,
    errorMessage: null,
  }]);
  assert.equal(fixture.created.length, 0);
});

test("approved update rebuilds the full Whooing payload from persisted evidence", async () => {
  const updateRow = row({
    status: "possible_update",
    sourceAccountType: "liabilities",
    matchedWhooingEntryId: 91,
    mirrorEntry: {
      sectionId: "s1",
      entryId: 91,
      occurredDate: "2026-08-14",
    },
  });
  const fixture = dependencies([updateRow]);
  const updated: unknown[] = [];
  const synced: string[] = [];
  const result = await executeApprovedImportUpdate({
    rowId: 1,
    dependencies: {
      ...fixture.dependencies,
      updateEntry: async (entryId, payload) => { updated.push({ entryId, payload }); },
      syncForDate: async (date) => { synced.push(date); },
    },
  });

  assert.equal(result.status, "updated");
  assert.deepEqual(updated, [{
    entryId: 91,
    payload: {
      section_id: "s1",
      entry_date: "20260815",
      l_account: "expenses",
      l_account_id: "x-food",
      r_account: "liabilities",
      r_account_id: "x45",
      item: "점심",
      money: 9000,
      memo: "",
    },
  }]);
  assert.deepEqual(synced, ["2026-08-14", "2026-08-15"]);
});

test("update requires one matched mirror entry and reuses a completed content revision", async () => {
  const operationKey = `pyeonhan-update:${"b".repeat(64)}`;
  const fixture = dependencies([row({ status: "possible_update" })], {
    operationKey,
    status: "created",
    whooingEntryId: 91,
    errorMessage: null,
  });
  const reused = await executeApprovedImportUpdate({
    rowId: 1,
    dependencies: {
      ...fixture.dependencies,
      updateEntry: async () => { throw new Error("must not update"); },
      syncForDate: async () => undefined,
    },
  });
  assert.equal(reused.status, "reused");

  const missingMirror = dependencies([row({ status: "possible_update" })]);
  const rejected = await executeApprovedImportUpdate({
    rowId: 1,
    dependencies: {
      ...missingMirror.dependencies,
      updateEntry: async () => undefined,
      syncForDate: async () => undefined,
    },
  });
  assert.equal(rejected.status, "rejected");
});
