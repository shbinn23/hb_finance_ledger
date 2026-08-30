import type {
  DashboardLedgerEntryRequest,
  DashboardLedgerEntryResult,
} from "../ledger/ledger-entry-service.ts";
import type { WhooingEntryPayload } from "../ledger/ledger-entry-payload.ts";

export interface ImportActionRow {
  id: number;
  status: string;
  sourceIdentityKey: string;
  sourceContentHash: string;
  occurredDate: string;
  entryType: string;
  item: string;
  memo: string;
  postingAmount: number;
  sourceAccountType: string | null;
  sourceAccountId: string | null;
  categoryAccountId: string | null;
  counterpartyAccountType: string | null;
  counterpartyAccountId: string | null;
  matchedWhooingEntryId: number | null;
  mirrorEntry?: {
    sectionId: string;
    entryId: number;
    occurredDate: string;
  } | null;
}

export interface ImportActionOperation {
  operationKey: string;
  status: "pending" | "created" | "failed";
  whooingEntryId: number | null;
  errorMessage: string | null;
  whooingAccountId?: string | null;
}

export interface ImportActionDependencies {
  getRows: (rowIds: number[]) => Promise<ImportActionRow[]>;
  getOperation: (operationKey: string) => Promise<ImportActionOperation | null>;
  reserveOperation: (input: {
    rowId: number;
    operationType: "create" | "update" | "skip" | "review";
    operationKey: string;
  }) => Promise<boolean>;
  finishOperation: (input: {
    rowId: number;
    operationType: "create" | "update";
    operationKey: string;
    status: "created" | "failed";
    whooingEntryId: number | null;
    errorMessage: string | null;
    rowStatus: "created" | "updated" | "write_failed";
  }) => Promise<void>;
  finishOperationRecord: (input: {
    operationKey: string;
    status: "created" | "failed";
    whooingEntryId: number | null;
    errorMessage: string | null;
  }) => Promise<void>;
  markRowsReviewed: (input: { rowIds: number[]; action: "skip" | "review" }) => Promise<void>;
  createEntry: (request: DashboardLedgerEntryRequest) => Promise<DashboardLedgerEntryResult>;
}

function requestForRow(row: ImportActionRow): DashboardLedgerEntryRequest | null {
  const common = {
    occurredDate: row.occurredDate,
    item: row.item,
    amount: row.postingAmount,
    memo: row.memo,
    operationKey: `pyeonhan:${row.sourceIdentityKey}`,
    source: "pyeonhan_excel",
  };
  if (row.entryType === "expense" && row.categoryAccountId && row.sourceAccountId) {
    if (row.sourceAccountType !== "assets" && row.sourceAccountType !== "liabilities") return null;
    return {
      ...common,
      type: "expense",
      categoryAccountId: row.categoryAccountId,
      paymentAccountType: row.sourceAccountType,
      paymentAccountId: row.sourceAccountId,
      discountRuleId: null,
    };
  }
  if (row.entryType === "income" && row.categoryAccountId && row.sourceAccountId) {
    return {
      ...common,
      type: "income",
      incomeAccountId: row.categoryAccountId,
      depositAccountId: row.sourceAccountId,
    };
  }
  if (
    row.entryType === "transfer"
    && row.sourceAccountType === "assets"
    && row.counterpartyAccountType === "assets"
    && row.sourceAccountId
    && row.counterpartyAccountId
  ) {
    return {
      ...common,
      type: "transfer",
      fromAccountId: row.sourceAccountId,
      toAccountId: row.counterpartyAccountId,
    };
  }
  return null;
}

export async function executeApprovedImportCreates(input: {
  rowIds: number[];
  dependencies: ImportActionDependencies;
}) {
  const rows = await input.dependencies.getRows(input.rowIds);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const results: Array<{
    rowId: number;
    status: "created" | "reused" | "skipped" | "failed";
    entryId: number | null;
    syncStatus: "synced" | "pending" | "skipped";
    operationKey: string | null;
    message: string;
  }> = [];

  for (const rowId of input.rowIds) {
    const row = byId.get(rowId);
    const request = row?.status === "auto_creatable" ? requestForRow(row) : null;
    if (!row || !request) {
      results.push({ rowId, status: "skipped", entryId: null, syncStatus: "skipped", operationKey: null, message: "승인 가능한 신규 거래가 아닙니다." });
      continue;
    }
    const operationKey = request.operationKey ?? "";
    const existing = await input.dependencies.getOperation(operationKey);
    if (existing?.status === "created") {
      results.push({ rowId, status: "reused", entryId: existing.whooingEntryId, syncStatus: "skipped", operationKey, message: "이미 처리된 승인입니다." });
      continue;
    }
    const reserved = await input.dependencies.reserveOperation({ rowId, operationType: "create", operationKey });
    if (!reserved) {
      results.push({ rowId, status: "skipped", entryId: null, syncStatus: "skipped", operationKey, message: "동일 승인이 처리 중입니다." });
      continue;
    }
    const ledgerResult = await input.dependencies.createEntry(request);
    if (!ledgerResult.ok) {
      await input.dependencies.finishOperation({
        rowId,
        operationType: "create",
        operationKey,
        status: "failed",
        whooingEntryId: null,
        errorMessage: ledgerResult.message,
        rowStatus: "write_failed",
      });
      results.push({ rowId, status: "failed", entryId: null, syncStatus: "skipped", operationKey, message: ledgerResult.message });
      continue;
    }
    await input.dependencies.finishOperation({
      rowId,
      operationType: "create",
      operationKey,
      status: "created",
      whooingEntryId: ledgerResult.entryId,
      errorMessage: ledgerResult.syncStatus === "pending" ? ledgerResult.message : null,
      rowStatus: "created",
    });
    results.push({
      rowId,
      status: "created",
      entryId: ledgerResult.entryId,
      syncStatus: ledgerResult.syncStatus,
      operationKey,
      message: ledgerResult.message,
    });
  }

  return {
    ok: results.every((result) => result.status !== "failed"),
    created: results.filter((result) => result.status === "created").length,
    reused: results.filter((result) => result.status === "reused").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    syncPending: results.filter((result) => result.syncStatus === "pending").length,
    results,
  };
}

export async function executeImportReviewAction(input: {
  rowIds: number[];
  action: "skip" | "review";
  dependencies: ImportActionDependencies;
}) {
  const rows = await input.dependencies.getRows(input.rowIds);
  const eligibleRows = rows
    .filter((row) => !["created", "updated", "duplicate"].includes(row.status))
  const reservedRows: Array<{ id: number; operationKey: string }> = [];
  for (const row of eligibleRows) {
    const operationKey = `pyeonhan-${input.action}:${row.id}`;
    if (await input.dependencies.reserveOperation({
      rowId: row.id,
      operationType: input.action,
      operationKey,
    })) {
      reservedRows.push({ id: row.id, operationKey });
    }
  }
  if (reservedRows.length > 0) {
    await input.dependencies.markRowsReviewed({ rowIds: reservedRows.map((row) => row.id), action: input.action });
    for (const row of reservedRows) {
      await input.dependencies.finishOperationRecord({
        operationKey: row.operationKey,
        status: "created",
        whooingEntryId: null,
        errorMessage: null,
      });
    }
  }
  return { ok: true, updated: reservedRows.length, skipped: input.rowIds.length - reservedRows.length };
}

export interface ImportUpdateDependencies extends ImportActionDependencies {
  updateEntry: (entryId: number, payload: WhooingEntryPayload) => Promise<unknown>;
  syncForDate: (occurredDate: string) => Promise<unknown>;
}

function updatePayloadForRow(row: ImportActionRow): WhooingEntryPayload | null {
  if (!row.mirrorEntry || row.matchedWhooingEntryId !== row.mirrorEntry.entryId) return null;
  const common = {
    section_id: row.mirrorEntry.sectionId,
    entry_date: row.occurredDate.replaceAll("-", ""),
    item: row.item,
    money: row.postingAmount,
    memo: row.memo,
  };
  if (row.entryType === "expense" && row.categoryAccountId && row.sourceAccountId) {
    if (row.sourceAccountType !== "assets" && row.sourceAccountType !== "liabilities") return null;
    return {
      ...common,
      l_account: "expenses",
      l_account_id: row.categoryAccountId,
      r_account: row.sourceAccountType,
      r_account_id: row.sourceAccountId,
    };
  }
  if (row.entryType === "income" && row.categoryAccountId && row.sourceAccountId) {
    return {
      ...common,
      l_account: "assets",
      l_account_id: row.sourceAccountId,
      r_account: "income",
      r_account_id: row.categoryAccountId,
    };
  }
  if (
    row.entryType === "transfer"
    && row.sourceAccountType === "assets"
    && row.counterpartyAccountType === "assets"
    && row.sourceAccountId
    && row.counterpartyAccountId
  ) {
    return {
      ...common,
      l_account: "assets",
      l_account_id: row.counterpartyAccountId,
      r_account: "assets",
      r_account_id: row.sourceAccountId,
    };
  }
  return null;
}

export async function executeApprovedImportUpdate(input: {
  rowId: number;
  dependencies: ImportUpdateDependencies;
}) {
  const row = (await input.dependencies.getRows([input.rowId]))[0];
  if (!row || row.status !== "possible_update") {
    return { ok: false, status: "rejected" as const, syncStatus: "skipped" as const, message: "승인 가능한 수정 후보가 아닙니다." };
  }
  const operationKey = `pyeonhan-update:${row.sourceContentHash}`;
  const existing = await input.dependencies.getOperation(operationKey);
  if (existing?.status === "created") {
    return { ok: true, status: "reused" as const, syncStatus: "skipped" as const, entryId: existing.whooingEntryId, operationKey, message: "이미 반영된 수정입니다." };
  }
  const payload = updatePayloadForRow(row);
  const previousDate = row.mirrorEntry?.occurredDate;
  if (!payload || !row.matchedWhooingEntryId || !previousDate) {
    return { ok: false, status: "rejected" as const, syncStatus: "skipped" as const, message: "매칭된 Whooing 거래 또는 mapping을 확인할 수 없습니다." };
  }
  const reserved = await input.dependencies.reserveOperation({
    rowId: row.id,
    operationType: "update",
    operationKey,
  });
  if (!reserved) {
    return { ok: false, status: "rejected" as const, syncStatus: "skipped" as const, message: "동일 수정이 처리 중입니다." };
  }
  try {
    await input.dependencies.updateEntry(row.matchedWhooingEntryId, payload);
  } catch {
    await input.dependencies.finishOperation({
      rowId: row.id,
      operationType: "update",
      operationKey,
      status: "failed",
      whooingEntryId: row.matchedWhooingEntryId,
      errorMessage: "Whooing 거래 수정 실패",
      rowStatus: "write_failed",
    });
    return { ok: false, status: "failed" as const, syncStatus: "skipped" as const, message: "Whooing 거래 수정에 실패했습니다." };
  }
  let syncStatus: "synced" | "pending" = "synced";
  const dates = [...new Set([previousDate, row.occurredDate])];
  for (const date of dates) {
    try {
      await input.dependencies.syncForDate(date);
    } catch {
      syncStatus = "pending";
    }
  }
  await input.dependencies.finishOperation({
    rowId: row.id,
    operationType: "update",
    operationKey,
    status: "created",
    whooingEntryId: row.matchedWhooingEntryId,
    errorMessage: syncStatus === "pending" ? "Whooing 수정 완료, local sync pending" : null,
    rowStatus: "updated",
  });
  return {
    ok: true,
    status: "updated" as const,
    syncStatus,
    entryId: row.matchedWhooingEntryId,
    operationKey,
    message: syncStatus === "pending"
      ? "Whooing 수정은 완료됐지만 대시보드 반영은 지연될 수 있습니다."
      : "Whooing 거래 수정과 대시보드 동기화를 완료했습니다.",
  };
}
