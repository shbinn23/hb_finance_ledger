import type {
  DashboardLedgerEntryRequest,
  DashboardLedgerEntryResult,
} from "../ledger/ledger-entry-service.ts";
import type { ReconciledImportRow } from "./pyeonhan-reconciliation.ts";
import type {
  ImportBatchStatus,
  PersistedImportBatchStatus,
} from "./pyeonhan-types.ts";

export type AutoImportRow = ReconciledImportRow;

export interface ImportWriteResult {
  sourceIdentityKey: string;
  operationKey: string;
  created: boolean;
  entryId: number | null;
  message: string;
}

export function resolveImportBatchStatus(input: {
  created: number;
  failed: number;
  reviewCount: number;
}): ImportBatchStatus {
  if (input.failed > 0) return input.created > 0 ? "partial" : "failed";
  if (input.created === 0 && input.reviewCount > 0) return "review";
  return "completed";
}

export function canRetryImportBatch(status: PersistedImportBatchStatus) {
  return status === "review" || status === "partial" || status === "failed";
}

function requestForRow(row: AutoImportRow): DashboardLedgerEntryRequest {
  const transaction = row.transaction;
  const common = {
    occurredDate: transaction.occurredDate,
    item: transaction.item,
    amount: transaction.postingAmount,
    memo: transaction.memo,
    operationKey: `pyeonhan:${transaction.sourceIdentityKey}`,
    source: "pyeonhan_excel",
  };
  if (transaction.entryType === "expense") {
    return {
      ...common,
      type: "expense",
      categoryAccountId: row.mapping.categoryAccount?.accountId,
      paymentAccountType: row.mapping.sourceAccount?.accountType,
      paymentAccountId: row.mapping.sourceAccount?.accountId,
      discountRuleId: null,
    };
  }
  if (transaction.entryType === "income") {
    return {
      ...common,
      type: "income",
      incomeAccountId: row.mapping.categoryAccount?.accountId,
      depositAccountId: row.mapping.sourceAccount?.accountId,
    };
  }
  if (transaction.entryType === "transfer") {
    return {
      ...common,
      type: "transfer",
      fromAccountId: row.mapping.sourceAccount?.accountId,
      toAccountId: row.mapping.counterpartyAccount?.accountId,
    };
  }
  throw new Error("unsupported_auto_import_type");
}

export async function applyAutoCreatableRows({
  rows,
  createEntry,
  onResult,
}: {
  rows: AutoImportRow[];
  createEntry: (request: DashboardLedgerEntryRequest) => Promise<DashboardLedgerEntryResult>;
  onResult?: (row: AutoImportRow, result: ImportWriteResult) => Promise<void>;
}) {
  const eligible = rows.filter((row) => row.status === "auto_creatable");
  const results: ImportWriteResult[] = [];
  for (const row of eligible) {
    const request = requestForRow(row);
    const ledgerResult = await createEntry(request);
    const result: ImportWriteResult = {
      sourceIdentityKey: row.transaction.sourceIdentityKey,
      operationKey: request.operationKey ?? "",
      created: ledgerResult.ok,
      entryId: ledgerResult.ok ? ledgerResult.entryId : null,
      message: ledgerResult.message,
    };
    results.push(result);
    await onResult?.(row, result);
  }
  return {
    created: results.filter((result) => result.created).length,
    failed: results.filter((result) => !result.created).length,
    skipped: rows.length - eligible.length,
    results,
  };
}
