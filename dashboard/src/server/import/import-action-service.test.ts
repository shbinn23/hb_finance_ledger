import assert from "node:assert/strict";
import test from "node:test";
import {
  executeApprovedImportCreates,
  executeApprovedImportDelete,
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
    sourceCategoryName: "선택",
    sourceSubcategoryName: "식비",
    item: "점심",
    memo: "",
    postingAmount: 9000,
    approvalAmount: 9000,
    discountAmount: 0,
    benefitRuleId: null,
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

function mirrorEntry(overrides: Partial<NonNullable<ImportActionRow["mirrorEntry"]>> = {}) {
  return {
    sectionId: "s1",
    entryId: 91,
    occurredDate: "2026-08-14",
    leftAccountType: "expenses",
    leftAccountId: "x-food",
    rightAccountType: "liabilities",
    rightAccountId: "x45",
    item: "점심",
    memo: "",
    amount: 9000,
    ...overrides,
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

test("failed create is retried only after an explicit retry approval", async () => {
  const fixture = dependencies([row({ status: "write_failed" })], {
    operationKey: `pyeonhan:${"a".repeat(64)}`,
    status: "failed",
    whooingEntryId: null,
    errorMessage: "temporary Whooing failure",
  });

  const automaticResult = await executeApprovedImportCreates({ rowIds: [1], dependencies: fixture.dependencies });
  assert.equal(automaticResult.skipped, 1);
  assert.equal(fixture.created.length, 0);

  const result = await executeApprovedImportCreates({
    rowIds: [1],
    allowFailedRetry: true,
    dependencies: fixture.dependencies,
  });

  assert.equal(result.created, 1);
  assert.equal(fixture.created.length, 1);
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

test("explicit review confirmation creates a mapped review income without weakening automatic creates", async () => {
  const reviewIncome = row({
    status: "review_required",
    entryType: "income",
    sourceAccountType: "assets",
    sourceAccountId: "x-bank",
    categoryAccountId: "x-cashback",
    sourceCategoryName: "환급",
    sourceSubcategoryName: "캐시백",
  });
  const automatic = dependencies([reviewIncome]);
  const automaticResult = await executeApprovedImportCreates({
    rowIds: [1],
    dependencies: automatic.dependencies,
  });
  assert.equal(automaticResult.skipped, 1);
  assert.equal(automatic.created.length, 0);

  const manual = dependencies([reviewIncome]);
  const manualResult = await executeApprovedImportCreates({
    rowIds: [1],
    allowReviewedIncome: true,
    dependencies: manual.dependencies,
  });
  assert.equal(manualResult.created, 1);
  assert.deepEqual(manual.created, [{
    type: "income",
    occurredDate: "2026-08-15",
    item: "점심",
    amount: 9000,
    memo: "",
    operationKey: `pyeonhan:${"a".repeat(64)}`,
    source: "pyeonhan_excel",
    incomeAccountId: "x-cashback",
    depositAccountId: "x-bank",
  }]);
});

test("explicit review confirmation can recover a skipped mapped income but not a reviewed expense", async () => {
  const fixture = dependencies([
    row({
      status: "skipped",
      entryType: "income",
      sourceAccountType: "assets",
      sourceAccountId: "x-bank",
      categoryAccountId: "x-cashback",
      sourceCategoryName: "환급",
      sourceSubcategoryName: "캐시백",
    }),
    row({ id: 2, status: "review_required", sourceIdentityKey: "c".repeat(64) }),
  ]);
  const result = await executeApprovedImportCreates({
    rowIds: [1, 2],
    allowReviewedIncome: true,
    dependencies: fixture.dependencies,
  });
  assert.equal(result.created, 1);
  assert.equal(result.skipped, 1);
  assert.equal(fixture.created.length, 1);
});

test("explicit review confirmation rejects unrelated or mirror-linked reviewed income", async () => {
  const fixture = dependencies([
    row({
      status: "reviewed",
      entryType: "income",
      sourceAccountType: "assets",
      sourceAccountId: "x-bank",
      categoryAccountId: "x-income",
      sourceCategoryName: "정산",
      sourceSubcategoryName: "기타",
    }),
    row({
      id: 2,
      status: "review_required",
      sourceIdentityKey: "c".repeat(64),
      entryType: "income",
      sourceAccountType: "assets",
      sourceAccountId: "x-bank",
      categoryAccountId: "x-cashback",
      sourceCategoryName: "환급",
      sourceSubcategoryName: "캐시백",
      matchedWhooingEntryId: 91,
    }),
  ]);
  const result = await executeApprovedImportCreates({
    rowIds: [1, 2],
    allowReviewedIncome: true,
    dependencies: fixture.dependencies,
  });
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
    mirrorEntry: mirrorEntry(),
  });
  const fixture = dependencies([updateRow]);
  const updated: unknown[] = [];
  const synced: string[] = [];
  const result = await executeApprovedImportUpdate({
    rowId: 1,
    dependencies: {
      ...fixture.dependencies,
      getCurrentEntry: async () => mirrorEntry(),
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

test("discounted update applies the exact stored benefit rule after mirror sync", async () => {
  const updateRow = row({
    status: "possible_update",
    sourceAccountType: "liabilities",
    sourceAccountId: "x50",
    postingAmount: 8550,
    matchedWhooingEntryId: 1468607,
    mirrorEntry: mirrorEntry({
      entryId: 1468607,
      occurredDate: "2026-08-30",
      rightAccountId: "x50",
    }),
    approvalAmount: 9000,
    discountAmount: 450,
    benefitRuleId: "shinhan_lady_lunch_5p",
  } as Partial<ImportActionRow>);
  const fixture = dependencies([updateRow]);
  const benefits: unknown[] = [];
  const result = await executeApprovedImportUpdate({
    rowId: 1,
    dependencies: {
      ...fixture.dependencies,
      getCurrentEntry: async () => updateRow.mirrorEntry!,
      updateEntry: async () => undefined,
      syncForDate: async () => undefined,
      approveBenefit: async (input: unknown) => {
        benefits.push(input);
        return { ok: true, status: "created" as const, eventId: "event-1" };
      },
    } as never,
  });

  assert.equal(result.status, "updated");
  assert.equal((result as { benefitStatus?: string }).benefitStatus, "created");
  assert.deepEqual(benefits, [{ importRowId: 1, ruleId: "shinhan_lady_lunch_5p" }]);
});

test("discounted update keeps benefit pending when sync is pending", async () => {
  const updateRow = row({
    status: "possible_update",
    sourceAccountType: "liabilities",
    sourceAccountId: "x50",
    postingAmount: 8550,
    matchedWhooingEntryId: 1468607,
    mirrorEntry: mirrorEntry({
      entryId: 1468607,
      occurredDate: "2026-08-30",
      rightAccountId: "x50",
    }),
    approvalAmount: 9000,
    discountAmount: 450,
    benefitRuleId: "shinhan_lady_lunch_5p",
  } as Partial<ImportActionRow>);
  const fixture = dependencies([updateRow]);
  let benefitCalls = 0;
  const result = await executeApprovedImportUpdate({
    rowId: 1,
    dependencies: {
      ...fixture.dependencies,
      getCurrentEntry: async () => updateRow.mirrorEntry!,
      updateEntry: async () => undefined,
      syncForDate: async () => { throw new Error("timeout"); },
      approveBenefit: async () => {
        benefitCalls += 1;
        return { ok: true, status: "created" as const, eventId: "event-1" };
      },
    } as never,
  });

  assert.equal(result.status, "updated");
  assert.equal(result.syncStatus, "pending");
  assert.equal((result as { benefitStatus?: string }).benefitStatus, "pending");
  assert.equal(benefitCalls, 0);
});

test("update requires one matched mirror entry and reuses a completed content revision", async () => {
  const operationKey = `pyeonhan-update:${"b".repeat(64)}`;
  const fixture = dependencies([row({
    status: "possible_update",
    matchedWhooingEntryId: 91,
    mirrorEntry: mirrorEntry(),
  })], {
    operationKey,
    status: "created",
    whooingEntryId: 91,
    errorMessage: null,
  });
  const reused = await executeApprovedImportUpdate({
    rowId: 1,
    dependencies: {
      ...fixture.dependencies,
      getCurrentEntry: async () => mirrorEntry(),
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
      getCurrentEntry: async () => null,
      updateEntry: async () => undefined,
      syncForDate: async () => undefined,
    },
  });
  assert.equal(rejected.status, "rejected");
});

test("update rejects a stale mirror before Whooing PUT", async () => {
  const updateRow = row({
    status: "possible_update",
    matchedWhooingEntryId: 91,
    mirrorEntry: mirrorEntry(),
  });
  const fixture = dependencies([updateRow]);
  let updates = 0;
  const result = await executeApprovedImportUpdate({
    rowId: 1,
    dependencies: {
      ...fixture.dependencies,
      getCurrentEntry: async () => mirrorEntry({ amount: 9100 }),
      updateEntry: async () => { updates += 1; },
      syncForDate: async () => undefined,
    },
  });

  assert.equal(result.status, "rejected");
  assert.equal(updates, 0);
});

test("approved delete revalidates the exact mirror snapshot before Whooing DELETE", async () => {
  const deleteRow = row({
    status: "possible_delete",
    matchedWhooingEntryId: 91,
    mirrorEntry: mirrorEntry(),
  });
  const fixture = dependencies([deleteRow]);
  const deleted: unknown[] = [];
  const synced: string[] = [];

  const result = await executeApprovedImportDelete({
    rowId: 1,
    dependencies: {
      ...fixture.dependencies,
      getCurrentEntry: async () => mirrorEntry(),
      deleteEntry: async (entryId, sectionId) => { deleted.push({ entryId, sectionId }); },
      syncForDate: async (date) => { synced.push(date); },
      hasBenefitEvent: async () => false,
    },
  });

  assert.equal(result.status, "deleted");
  assert.deepEqual(deleted, [{ entryId: 91, sectionId: "s1" }]);
  assert.deepEqual(synced, ["2026-08-14"]);
  assert.deepEqual(fixture.finished, [{
    rowId: 1,
    operationType: "delete",
    operationKey: result.operationKey,
    status: "created",
    whooingEntryId: 91,
    errorMessage: null,
    rowStatus: "deleted",
  }]);
});

test("approved delete rejects stale mirrors and linked card benefit events", async () => {
  const deleteRow = row({
    status: "possible_delete",
    matchedWhooingEntryId: 91,
    mirrorEntry: mirrorEntry(),
  });
  const fixture = dependencies([deleteRow]);
  let deletes = 0;
  const stale = await executeApprovedImportDelete({
    rowId: 1,
    dependencies: {
      ...fixture.dependencies,
      getCurrentEntry: async () => mirrorEntry({ amount: 9100 }),
      deleteEntry: async () => { deletes += 1; },
      syncForDate: async () => undefined,
      hasBenefitEvent: async () => false,
    },
  });
  const linked = await executeApprovedImportDelete({
    rowId: 1,
    dependencies: {
      ...fixture.dependencies,
      getCurrentEntry: async () => mirrorEntry(),
      deleteEntry: async () => { deletes += 1; },
      syncForDate: async () => undefined,
      hasBenefitEvent: async () => true,
    },
  });

  assert.equal(stale.status, "rejected");
  assert.equal(linked.status, "rejected");
  assert.match(linked.message, /카드혜택 event/);
  assert.equal(deletes, 0);
});

test("stale failed delete finalizes when the remote entry is already absent", async () => {
  const deleteRow = row({
    status: "write_failed",
    matchedWhooingEntryId: 91,
    mirrorEntry: mirrorEntry(),
  });
  const fixture = dependencies([deleteRow], {
    operationKey: `pyeonhan-delete:${"ignored"}`,
    status: "failed",
    whooingEntryId: 91,
    errorMessage: "interrupted",
  });
  let deleteCalls = 0;
  const result = await executeApprovedImportDelete({
    rowId: 1,
    dependencies: {
      ...fixture.dependencies,
      getCurrentEntry: async () => {
        throw Object.assign(new Error("not found"), { status: 404 });
      },
      deleteEntry: async () => { deleteCalls += 1; },
      syncForDate: async () => undefined,
      hasBenefitEvent: async () => false,
    },
  });

  assert.equal(result.status, "deleted");
  assert.equal(deleteCalls, 0);
  assert.equal((fixture.finished[0] as { rowStatus: string }).rowStatus, "deleted");
});

test("identical content revisions with different occurrences use distinct update operations", async () => {
  const sharedHash = "b".repeat(64);
  const rows = [
    row({ id: 1, status: "possible_update", sourceIdentityKey: "a".repeat(64), sourceContentHash: sharedHash, matchedWhooingEntryId: 91, mirrorEntry: mirrorEntry() }),
    row({ id: 2, status: "possible_update", sourceIdentityKey: "a".repeat(64), sourceContentHash: sharedHash, matchedWhooingEntryId: 92, mirrorEntry: mirrorEntry({ entryId: 92 }) }),
  ];
  const operations = new Map<string, ImportActionOperation>();
  let updates = 0;
  const fixture = dependencies(rows);
  const shared = {
    ...fixture.dependencies,
    getOperation: async (key: string) => operations.get(key) ?? null,
    reserveOperation: async ({ operationKey }: { operationKey: string }) => {
      if (operations.has(operationKey)) return false;
      operations.set(operationKey, { operationKey, status: "pending", whooingEntryId: null, errorMessage: null });
      return true;
    },
    finishOperation: async ({ operationKey, whooingEntryId }: { operationKey: string; whooingEntryId: number | null }) => {
      operations.set(operationKey, { operationKey, status: "created", whooingEntryId, errorMessage: null });
    },
    getCurrentEntry: async (entryId: number) => rows.find((candidate) => candidate.matchedWhooingEntryId === entryId)?.mirrorEntry ?? null,
    updateEntry: async () => { updates += 1; },
    syncForDate: async () => undefined,
  };

  const first = await executeApprovedImportUpdate({ rowId: 1, dependencies: shared });
  const second = await executeApprovedImportUpdate({ rowId: 2, dependencies: shared });

  assert.equal(first.status, "updated");
  assert.equal(second.status, "updated");
  assert.equal(updates, 2);
  assert.notEqual(first.operationKey, second.operationKey);
  assert.ok((first.operationKey?.length ?? 0) <= 128);
  assert.ok((second.operationKey?.length ?? 0) <= 128);
});

test("legacy content-only operation is reused only for the same Whooing entry", async () => {
  const updateRow = row({ status: "possible_update", matchedWhooingEntryId: 91, mirrorEntry: mirrorEntry() });
  const fixture = dependencies([updateRow]);
  const legacyKey = `pyeonhan-update:${updateRow.sourceContentHash}`;
  let updates = 0;
  const result = await executeApprovedImportUpdate({
    rowId: 1,
    dependencies: {
      ...fixture.dependencies,
      getOperation: async (key: string) => key === legacyKey
        ? { operationKey: key, status: "created", whooingEntryId: 92, errorMessage: null }
        : null,
      getCurrentEntry: async () => mirrorEntry(),
      updateEntry: async () => { updates += 1; },
      syncForDate: async () => undefined,
    },
  });

  assert.equal(result.status, "updated");
  assert.equal(updates, 1);
});

test("current update operation is never reused for a different Whooing entry", async () => {
  const updateRow = row({ status: "possible_update", matchedWhooingEntryId: 91, mirrorEntry: mirrorEntry() });
  const fixture = dependencies([updateRow]);
  let updates = 0;
  const result = await executeApprovedImportUpdate({
    rowId: 1,
    dependencies: {
      ...fixture.dependencies,
      getOperation: async (key: string) => key.startsWith("pyeonhan-update:")
        ? { operationKey: key, status: "created", whooingEntryId: 92, errorMessage: null }
        : null,
      getCurrentEntry: async () => mirrorEntry(),
      updateEntry: async () => { updates += 1; },
      syncForDate: async () => undefined,
    },
  });

  assert.equal(result.status, "rejected");
  assert.equal(updates, 0);
});

test("stale pending update finalizes when the remote entry already has the desired payload", async () => {
  const updateRow = row({
    status: "possible_update",
    postingAmount: 8550,
    matchedWhooingEntryId: 91,
    mirrorEntry: mirrorEntry(),
  });
  const fixture = dependencies([updateRow]);
  let updates = 0;
  let operationLookups = 0;
  const result = await executeApprovedImportUpdate({
    rowId: 1,
    dependencies: {
      ...fixture.dependencies,
      getOperation: async (key: string) => {
        operationLookups += 1;
        return operationLookups === 1 ? {
          operationKey: key,
          status: "pending",
          whooingEntryId: null,
          errorMessage: null,
        } : null;
      },
      getCurrentEntry: async () => mirrorEntry({
        occurredDate: updateRow.occurredDate,
        amount: 8550,
      }),
      updateEntry: async () => { updates += 1; },
      syncForDate: async () => undefined,
    },
  });

  assert.equal(result.status, "updated");
  assert.equal(updates, 0);
  assert.equal(fixture.finished.length, 1);
});

test("an incomplete legacy update operation cannot be hidden by another legacy key", async () => {
  const updateRow = row({ status: "possible_update", matchedWhooingEntryId: 91, mirrorEntry: mirrorEntry() });
  const fixture = dependencies([updateRow]);
  let lookups = 0;
  let updates = 0;
  const result = await executeApprovedImportUpdate({
    rowId: 1,
    dependencies: {
      ...fixture.dependencies,
      getOperation: async (key: string) => {
        lookups += 1;
        if (lookups === 2) return { operationKey: key, status: "created", whooingEntryId: 92, errorMessage: null };
        if (lookups === 3) return { operationKey: key, status: "pending", whooingEntryId: null, errorMessage: null };
        return null;
      },
      getCurrentEntry: async () => mirrorEntry(),
      updateEntry: async () => { updates += 1; },
      syncForDate: async () => undefined,
    },
  });

  assert.equal(result.status, "rejected");
  assert.equal(updates, 0);
});
