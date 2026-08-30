import { insertCardBenefitEvent } from "../card-benefits/repository";
import {
  getBenefitApprovalCandidate,
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
