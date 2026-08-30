import { createRuntimeDashboardLedgerEntry } from "../ledger/ledger-entry-runtime";
import {
  executeApprovedImportCreates,
  executeApprovedImportUpdate,
  executeImportReviewAction,
} from "./import-action-service";
import {
  finishImportActionOperation,
  finishImportOperationRecord,
  getImportActionOperation,
  getImportActionRows,
  markImportRowsReviewed,
  reserveImportActionOperation,
} from "./import-repository";
import { syncWhooingEntriesForDate } from "../whooing/sync-client";
import { updateWhooingEntry } from "../whooing/write-client";

const dependencies = {
  getRows: getImportActionRows,
  getOperation: getImportActionOperation,
  reserveOperation: reserveImportActionOperation,
  finishOperation: finishImportActionOperation,
  finishOperationRecord: finishImportOperationRecord,
  markRowsReviewed: markImportRowsReviewed,
  createEntry: createRuntimeDashboardLedgerEntry,
};

export function executeRuntimeApprovedImportCreates(rowIds: number[]) {
  return executeApprovedImportCreates({ rowIds, dependencies });
}

export function executeRuntimeImportReviewAction(input: {
  rowIds: number[];
  action: "skip" | "review";
}) {
  return executeImportReviewAction({ ...input, dependencies });
}

export function executeRuntimeApprovedImportUpdate(rowId: number) {
  return executeApprovedImportUpdate({
    rowId,
    dependencies: {
      ...dependencies,
      updateEntry: updateWhooingEntry,
      syncForDate: syncWhooingEntriesForDate,
    },
  });
}
