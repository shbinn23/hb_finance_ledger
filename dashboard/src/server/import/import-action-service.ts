import { createHash } from "node:crypto";
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
  sourceCategoryName: string | null;
  sourceSubcategoryName: string | null;
  item: string;
  memo: string;
  postingAmount: number;
  approvalAmount: number;
  discountAmount: number;
  benefitRuleId: string | null;
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
    leftAccountType: string;
    leftAccountId: string;
    rightAccountType: string;
    rightAccountId: string;
    item: string;
    memo: string;
    amount: number;
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
    operationType: "create" | "update" | "delete" | "skip" | "review";
    operationKey: string;
  }) => Promise<boolean>;
  finishOperation: (input: {
    rowId: number;
    operationType: "create" | "update" | "delete";
    operationKey: string;
    status: "created" | "failed";
    whooingEntryId: number | null;
    errorMessage: string | null;
    rowStatus: "created" | "updated" | "deleted" | "write_failed";
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
  allowReviewedIncome?: boolean;
  allowFailedRetry?: boolean;
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
    const reviewCategory = `${row?.sourceCategoryName ?? ""} ${row?.sourceSubcategoryName ?? ""}`;
    const reviewIncomeApproved = Boolean(
      input.allowReviewedIncome
      && row?.entryType === "income"
      && ["review_required", "reviewed", "skipped"].includes(row.status)
      && row.matchedWhooingEntryId === null
      && /(환급|캐시백)/.test(reviewCategory)
    );
    const failedCreateRetry = Boolean(
      input.allowFailedRetry
      && row?.status === "write_failed"
      && row.matchedWhooingEntryId === null
    );
    const request = row && (row.status === "auto_creatable" || reviewIncomeApproved || failedCreateRetry)
      ? requestForRow(row)
      : null;
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
    .filter((row) => !["created", "updated", "deleted", "duplicate"].includes(row.status));
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
  getCurrentEntry: (entryId: number, sectionId: string) => Promise<NonNullable<ImportActionRow["mirrorEntry"]> | null>;
  updateEntry: (entryId: number, payload: WhooingEntryPayload) => Promise<unknown>;
  syncForDate: (occurredDate: string) => Promise<unknown>;
  approveBenefit?: (input: { importRowId: number; ruleId: string }) => Promise<{
    ok: boolean;
    status: string;
    eventId?: string | null;
  }>;
}

export interface ImportDeleteDependencies extends ImportActionDependencies {
  getCurrentEntry: (entryId: number, sectionId: string) => Promise<NonNullable<ImportActionRow["mirrorEntry"]> | null>;
  deleteEntry: (entryId: number, sectionId: string) => Promise<unknown>;
  syncForDate: (occurredDate: string) => Promise<unknown>;
  hasBenefitEvent: (entryId: number) => Promise<boolean>;
}

function sameMirrorSnapshot(
  expected: NonNullable<ImportActionRow["mirrorEntry"]>,
  current: NonNullable<ImportActionRow["mirrorEntry"]>,
) {
  return expected.sectionId === current.sectionId
    && expected.entryId === current.entryId
    && expected.occurredDate === current.occurredDate
    && expected.leftAccountType === current.leftAccountType
    && expected.leftAccountId === current.leftAccountId
    && expected.rightAccountType === current.rightAccountType
    && expected.rightAccountId === current.rightAccountId
    && expected.item === current.item
    && expected.memo === current.memo
    && expected.amount === current.amount;
}

function sameEntryAsPayload(
  current: NonNullable<ImportActionRow["mirrorEntry"]>,
  payload: WhooingEntryPayload,
) {
  const occurredDate = payload.entry_date.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
  return current.sectionId === payload.section_id
    && current.occurredDate === occurredDate
    && current.leftAccountType === payload.l_account
    && current.leftAccountId === payload.l_account_id
    && current.rightAccountType === payload.r_account
    && current.rightAccountId === payload.r_account_id
    && current.item === payload.item
    && current.memo === (payload.memo ?? "")
    && current.amount === Number(payload.money);
}

function updateOperationKey(row: Pick<ImportActionRow, "sourceIdentityKey" | "sourceContentHash" | "matchedWhooingEntryId">) {
  const digest = createHash("sha256")
    .update(`${row.sourceIdentityKey}:${row.sourceContentHash}:${row.matchedWhooingEntryId ?? "unmatched"}`)
    .digest("hex");
  return `pyeonhan-update:${digest}`;
}

function previousUpdateOperationKey(row: Pick<ImportActionRow, "sourceIdentityKey" | "sourceContentHash">) {
  const digest = createHash("sha256")
    .update(`${row.sourceIdentityKey}:${row.sourceContentHash}`)
    .digest("hex");
  return `pyeonhan-update:${digest}`;
}

function deleteOperationKey(row: Pick<ImportActionRow, "sourceIdentityKey" | "sourceContentHash" | "matchedWhooingEntryId">) {
  const digest = createHash("sha256")
    .update(`${row.sourceIdentityKey}:${row.sourceContentHash}:${row.matchedWhooingEntryId ?? "unmatched"}`)
    .digest("hex");
  return `pyeonhan-delete:${digest}`;
}

function isNotFoundError(error: unknown) {
  return typeof error === "object" && error !== null
    && "status" in error && (error as { status?: unknown }).status === 404;
}

async function applyUpdatedBenefit(
  row: ImportActionRow,
  syncStatus: "synced" | "pending" | "skipped",
  dependencies: ImportUpdateDependencies,
) {
  if (row.discountAmount <= 0) return "not_applicable" as const;
  if (!row.benefitRuleId || syncStatus === "pending" || !dependencies.approveBenefit) {
    return "pending" as const;
  }
  const result = await dependencies.approveBenefit({
    importRowId: row.id,
    ruleId: row.benefitRuleId,
  });
  return result.ok ? result.status : "pending";
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
  if (!row) {
    return { ok: false, status: "rejected" as const, syncStatus: "skipped" as const, message: "승인 가능한 수정 후보가 아닙니다." };
  }
  const operationKey = updateOperationKey(row);
  const previousOperationKey = previousUpdateOperationKey(row);
  const legacyOperationKey = `pyeonhan-update:${row.sourceContentHash}`;
  const currentOperation = await input.dependencies.getOperation(operationKey);
  const previousOperation = await input.dependencies.getOperation(previousOperationKey);
  const legacyOperation = await input.dependencies.getOperation(legacyOperationKey);
  if (
    currentOperation
    && currentOperation.whooingEntryId !== null
    && currentOperation.whooingEntryId !== row.matchedWhooingEntryId
  ) {
    return { ok: false, status: "rejected" as const, syncStatus: "skipped" as const, message: "수정 이력의 Whooing 거래가 현재 후보와 다릅니다." };
  }
  const compatiblePrevious = [previousOperation, legacyOperation].find((operation) => (
    operation?.status === "created" && operation.whooingEntryId === row.matchedWhooingEntryId
  )) ?? null;
  const incompletePrevious = [previousOperation, legacyOperation].find((operation) => (
    operation && operation.status !== "created"
  ));
  if (incompletePrevious) {
    return { ok: false, status: "rejected" as const, syncStatus: "skipped" as const, message: "이전 형식의 미완료 수정 이력이 있어 수동 확인이 필요합니다." };
  }
  const existing = currentOperation ?? compatiblePrevious;
  if (existing?.status === "created") {
    const benefitStatus = await applyUpdatedBenefit(row, "skipped", input.dependencies);
    return { ok: true, status: "reused" as const, syncStatus: "skipped" as const, benefitStatus, entryId: existing.whooingEntryId, operationKey: existing.operationKey, message: "이미 반영된 수정입니다." };
  }
  if (row.status !== "possible_update") {
    return { ok: false, status: "rejected" as const, syncStatus: "skipped" as const, message: "승인 가능한 수정 후보가 아닙니다." };
  }
  const payload = updatePayloadForRow(row);
  const previousDate = row.mirrorEntry?.occurredDate;
  if (!payload || !row.matchedWhooingEntryId || !previousDate) {
    return { ok: false, status: "rejected" as const, syncStatus: "skipped" as const, message: "매칭된 Whooing 거래 또는 mapping을 확인할 수 없습니다." };
  }
  let currentEntry: NonNullable<ImportActionRow["mirrorEntry"]> | null = null;
  try {
    currentEntry = await input.dependencies.getCurrentEntry(
      row.matchedWhooingEntryId,
      row.mirrorEntry!.sectionId,
    );
  } catch {
    return { ok: false, status: "rejected" as const, syncStatus: "skipped" as const, message: "Whooing 원본 거래의 최신 상태를 확인할 수 없습니다." };
  }
  const remoteAlreadyUpdated = Boolean(
    currentEntry
    && currentOperation
    && (currentOperation.status === "pending" || currentOperation.status === "failed")
    && (currentOperation.whooingEntryId === null || currentOperation.whooingEntryId === row.matchedWhooingEntryId)
    && sameEntryAsPayload(currentEntry, payload),
  );
  if (!currentEntry || (!sameMirrorSnapshot(row.mirrorEntry!, currentEntry) && !remoteAlreadyUpdated)) {
    return { ok: false, status: "rejected" as const, syncStatus: "skipped" as const, message: "Whooing 원본 거래가 import 검토 이후 변경되어 수정을 중단했습니다." };
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
    if (!remoteAlreadyUpdated) {
      await input.dependencies.updateEntry(row.matchedWhooingEntryId, payload);
    }
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
  const benefitStatus = await applyUpdatedBenefit(row, syncStatus, input.dependencies);
  return {
    ok: true,
    status: "updated" as const,
    syncStatus,
    entryId: row.matchedWhooingEntryId,
    operationKey,
    benefitStatus,
    message: syncStatus === "pending"
      ? "Whooing 수정은 완료됐지만 대시보드 반영은 지연될 수 있습니다."
      : "Whooing 거래 수정과 대시보드 동기화를 완료했습니다.",
  };
}

export async function executeApprovedImportDelete(input: {
  rowId: number;
  dependencies: ImportDeleteDependencies;
}) {
  const row = (await input.dependencies.getRows([input.rowId]))[0];
  if (!row || !row.matchedWhooingEntryId || !row.mirrorEntry) {
    return { ok: false, status: "rejected" as const, syncStatus: "skipped" as const, message: "승인 가능한 삭제 후보가 아닙니다." };
  }
  const operationKey = deleteOperationKey(row);
  const existing = await input.dependencies.getOperation(operationKey);
  if (existing?.status === "created") {
    return {
      ok: true,
      status: "reused" as const,
      syncStatus: "skipped" as const,
      entryId: existing.whooingEntryId,
      operationKey,
      message: "이미 삭제된 거래입니다.",
    };
  }
  const retryableFailure = row.status === "write_failed"
    && (existing?.status === "pending" || existing?.status === "failed")
    && existing.whooingEntryId === row.matchedWhooingEntryId;
  if (row.status !== "possible_delete" && !retryableFailure) {
    return { ok: false, status: "rejected" as const, syncStatus: "skipped" as const, message: "승인 가능한 삭제 후보가 아닙니다." };
  }
  if (await input.dependencies.hasBenefitEvent(row.matchedWhooingEntryId)) {
    return {
      ok: false,
      status: "rejected" as const,
      syncStatus: "skipped" as const,
      message: "연결된 카드혜택 event가 있어 원장만 삭제할 수 없습니다. 카드혜택 정합성을 먼저 확인해 주세요.",
    };
  }
  let currentEntry: NonNullable<ImportActionRow["mirrorEntry"]> | null = null;
  let remoteAlreadyDeleted = false;
  try {
    currentEntry = await input.dependencies.getCurrentEntry(
      row.matchedWhooingEntryId,
      row.mirrorEntry.sectionId,
    );
  } catch (error) {
    remoteAlreadyDeleted = Boolean(
      existing
      && (existing.status === "pending" || existing.status === "failed")
      && existing.whooingEntryId === row.matchedWhooingEntryId
      && isNotFoundError(error),
    );
    if (!remoteAlreadyDeleted) {
      return { ok: false, status: "rejected" as const, syncStatus: "skipped" as const, message: "Whooing 원본 거래의 최신 상태를 확인할 수 없습니다." };
    }
  }
  if (!remoteAlreadyDeleted && (!currentEntry || !sameMirrorSnapshot(row.mirrorEntry, currentEntry))) {
    return { ok: false, status: "rejected" as const, syncStatus: "skipped" as const, message: "Whooing 원본 거래가 import 검토 이후 변경되어 삭제를 중단했습니다." };
  }
  const reserved = await input.dependencies.reserveOperation({
    rowId: row.id,
    operationType: "delete",
    operationKey,
  });
  if (!reserved) {
    return { ok: false, status: "rejected" as const, syncStatus: "skipped" as const, message: "동일 삭제가 처리 중입니다." };
  }
  if (!remoteAlreadyDeleted && await input.dependencies.hasBenefitEvent(row.matchedWhooingEntryId)) {
    await input.dependencies.finishOperation({
      rowId: row.id,
      operationType: "delete",
      operationKey,
      status: "failed",
      whooingEntryId: row.matchedWhooingEntryId,
      errorMessage: "연결된 카드혜택 event가 삭제 승인 중 생성됨",
      rowStatus: "write_failed",
    });
    return {
      ok: false,
      status: "rejected" as const,
      syncStatus: "skipped" as const,
      message: "연결된 카드혜택 event가 있어 삭제를 중단했습니다.",
    };
  }
  try {
    if (!remoteAlreadyDeleted) {
      await input.dependencies.deleteEntry(row.matchedWhooingEntryId, row.mirrorEntry.sectionId);
    }
  } catch {
    await input.dependencies.finishOperation({
      rowId: row.id,
      operationType: "delete",
      operationKey,
      status: "failed",
      whooingEntryId: row.matchedWhooingEntryId,
      errorMessage: "Whooing 거래 삭제 실패",
      rowStatus: "write_failed",
    });
    return { ok: false, status: "failed" as const, syncStatus: "skipped" as const, message: "Whooing 거래 삭제에 실패했습니다." };
  }
  let syncStatus: "synced" | "pending" = "synced";
  try {
    await input.dependencies.syncForDate(row.mirrorEntry.occurredDate);
  } catch {
    syncStatus = "pending";
  }
  await input.dependencies.finishOperation({
    rowId: row.id,
    operationType: "delete",
    operationKey,
    status: "created",
    whooingEntryId: row.matchedWhooingEntryId,
    errorMessage: syncStatus === "pending" ? "Whooing 삭제 완료, local sync pending" : null,
    rowStatus: "deleted",
  });
  return {
    ok: true,
    status: "deleted" as const,
    syncStatus,
    entryId: row.matchedWhooingEntryId,
    operationKey,
    message: syncStatus === "pending"
      ? "Whooing 거래는 삭제됐지만 대시보드 반영은 지연될 수 있습니다."
      : "Whooing 거래 삭제와 대시보드 동기화를 완료했습니다.",
  };
}
