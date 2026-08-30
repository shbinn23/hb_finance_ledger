import type { CardBenefitEvaluationResult } from "@/lib/card-benefits/types";
import type { ExpenseEntrySubmission } from "@/server/ledger/ledger-entry-payload";
import type { CardBenefitEventInsert } from "./repository";

export function buildExpenseCardBenefitEventInsert({
  sectionId,
  whooingEntryId,
  entryDate,
  submission,
  evaluation,
}: {
  sectionId: string | null;
  whooingEntryId: number | null;
  entryDate: number;
  submission: ExpenseEntrySubmission;
  evaluation: CardBenefitEvaluationResult;
}): CardBenefitEventInsert {
  return {
    sectionId,
    whooingEntryId,
    entryDate,
    ruleId: evaluation.ruleId,
    cardAccountType: "liabilities",
    cardAccountId: submission.paymentAccountId,
    expenseAccountId: submission.categoryAccountId,
    merchant: submission.merchant.trim(),
    paymentChannel: evaluation.paymentChannel ?? "general",
    approvalAmount: evaluation.approvalAmount,
    performanceAmount: evaluation.performanceAmount,
    eligibleDiscountAmount: evaluation.eligibleDiscountAmount,
    appliedDiscountAmount: evaluation.appliedDiscountAmount,
    postingAmount: evaluation.postingAmount,
    capUsedBefore: evaluation.capUsedBefore,
    capUsedAfter: evaluation.capUsedAfter,
    evaluationStatus: evaluation.eligible ? "applied" : "not_applied",
    evaluationReason: evaluation.reason,
  };
}
