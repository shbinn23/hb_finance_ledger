import { createRuntimeDashboardLedgerEntry } from "../ledger/ledger-entry-runtime";
import {
  executeApprovedImportCreates,
  executeApprovedImportDelete,
  executeApprovedImportUpdate,
  executeImportReviewAction,
} from "./import-action-service";
import {
  finishImportActionOperation,
  finishImportOperationRecord,
  getImportActionOperation,
  getImportActionRows,
  hasCardBenefitEventForWhooingEntry,
  markImportRowsReviewed,
  reserveImportActionOperation,
} from "./import-repository";
import { syncWhooingEntriesForDate } from "../whooing/sync-client";
import { deleteWhooingEntry, getWhooingEntry, updateWhooingEntry } from "../whooing/write-client";
import { executeRuntimePyeonhanBenefitCandidate } from "./pyeonhan-benefit-runtime";

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
      getCurrentEntry: getWhooingEntry,
      updateEntry: updateWhooingEntry,
      syncForDate: syncWhooingEntriesForDate,
      approveBenefit: executeRuntimePyeonhanBenefitCandidate,
    },
  });
}

export function executeRuntimeApprovedImportDelete(rowId: number) {
  return executeApprovedImportDelete({
    rowId,
    dependencies: {
      ...dependencies,
      getCurrentEntry: getWhooingEntry,
      deleteEntry: deleteWhooingEntry,
      syncForDate: syncWhooingEntriesForDate,
      hasBenefitEvent: hasCardBenefitEventForWhooingEntry,
    },
  });
}
