import {
  insertCardBenefitEvent,
  updateCardBenefitEvent,
  validateCapLimitedImportDiscount,
} from "../card-benefits/repository";
import {
  finishImportOperationRecord,
  getBenefitApprovalCandidate,
  getImportActionOperation,
  reserveImportActionOperation,
  updateImportBenefitStatus,
} from "./import-repository";
import {
  approvePyeonhanBenefitCandidate,
  type ImportBenefitEventInsert,
} from "./pyeonhan-benefit-approval";
import { executePyeonhanBenefitOperation } from "./pyeonhan-benefit-operation";

export function approveRuntimePyeonhanBenefitCandidate(input: { importRowId: number; ruleId: string }) {
  return approvePyeonhanBenefitCandidate(input, {
    getCandidate: getBenefitApprovalCandidate,
    createEvent: (event: ImportBenefitEventInsert) => insertCardBenefitEvent(event),
    updateEvent: (eventId, event, expected) => updateCardBenefitEvent(eventId, event, expected),
    updateBenefitStatus: updateImportBenefitStatus,
    validateCapLimitedDiscount: (candidate) => validateCapLimitedImportDiscount({
      occurredDate: candidate.occurredDate,
      ruleId: candidate.rule.ruleId,
      approvalAmount: candidate.approvalAmount,
      discountAmount: candidate.discountAmount,
    }),
  });
}

export async function executeRuntimePyeonhanBenefitCandidate(input: { importRowId: number; ruleId: string }) {
  return executePyeonhanBenefitOperation(input, {
    getOperation: getImportActionOperation,
    reserveOperation: reserveImportActionOperation,
    approve: approveRuntimePyeonhanBenefitCandidate,
    finishOperation: finishImportOperationRecord,
  });
}
