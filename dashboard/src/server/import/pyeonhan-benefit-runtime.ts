import { insertCardBenefitEvent } from "../card-benefits/repository";
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

export function approveRuntimePyeonhanBenefitCandidate(input: { importRowId: number; ruleId: string }) {
  return approvePyeonhanBenefitCandidate(input, {
    getCandidate: getBenefitApprovalCandidate,
    createEvent: (event: ImportBenefitEventInsert) => insertCardBenefitEvent(event),
    updateBenefitStatus: updateImportBenefitStatus,
  });
}

export async function executeRuntimePyeonhanBenefitCandidate(input: { importRowId: number; ruleId: string }) {
  const operationKey = `pyeonhan-benefit:${input.importRowId}:${input.ruleId}`;
  const existing = await getImportActionOperation(operationKey);
  if (existing?.status === "created") {
    return { ok: true, status: "event_exists" as const, operationKey, message: "이미 처리된 카드혜택 승인입니다." };
  }
  const reserved = await reserveImportActionOperation({
    rowId: input.importRowId,
    operationType: "benefit",
    operationKey,
  });
  if (!reserved) {
    return { ok: false, status: "failed" as const, operationKey, message: "동일 카드혜택 처리가 진행 중입니다." };
  }
  const result = await approveRuntimePyeonhanBenefitCandidate(input);
  await finishImportOperationRecord({
    operationKey,
    status: result.ok ? "created" : "failed",
    errorMessage: result.ok ? null : result.message,
  });
  return { ...result, operationKey };
}
