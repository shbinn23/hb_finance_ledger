import {
  buildExpensePostingFromCardBenefit,
  buildWhooingExpenseEntryPayload,
  calculateExpensePosting,
  ExpensePostingValidationError,
  type ExpenseModalSubmission,
  type WhooingEntryPayload,
} from "../../features/slack/ledger-entry.ts";
import { evaluateCardBenefit } from "../../lib/card-benefits/evaluator.ts";
import type { CardBenefitRule, CardBenefitEvaluationResult } from "../../lib/card-benefits/types.ts";
import { extractWhooingEntryId } from "../whooing/entry-id.ts";

export type DashboardLedgerEntryType = "expense" | "income" | "transfer" | "card_payment" | "balance_adjustment";
export type DashboardPaymentAccountType = "assets" | "liabilities";

export interface DashboardLedgerEntryRequest {
  type: DashboardLedgerEntryType | string;
  occurredDate: string;
  categoryAccountId: string;
  paymentAccountType: DashboardPaymentAccountType | string;
  paymentAccountId: string;
  item: string;
  amount: number;
  memo?: string;
  discountRuleId?: string | null;
}

export interface DashboardCardBenefitEventInsert {
  sectionId: string | null;
  whooingEntryId: number | null;
  entryDate: number;
  ruleId: string | null;
  cardAccountType: "liabilities";
  cardAccountId: string;
  expenseAccountId: string;
  merchant: string;
  paymentChannel: "general" | "simple_pay";
  approvalAmount: number;
  performanceAmount: number;
  eligibleDiscountAmount: number;
  appliedDiscountAmount: number;
  postingAmount: number;
  capUsedBefore: number;
  capUsedAfter: number;
  evaluationStatus: string;
  evaluationReason: string;
}

export interface DashboardLedgerEntryDependencies {
  assertExpenseCategory: (accountId: string) => Promise<boolean>;
  assertPaymentAccount: (accountType: string, accountId: string) => Promise<boolean>;
  getActiveCardBenefitRules: () => Promise<CardBenefitRule[]>;
  buildCardBenefitMonthlyContext: (
    benefitMonth: string,
    ruleId: string,
  ) => Promise<{
    benefitMonth: string;
    performanceAmount: number;
    capUsedByRule: Record<string, number>;
  }>;
  createEntry: (payload: WhooingEntryPayload) => Promise<unknown>;
  syncForDate: (occurredDate: string) => Promise<unknown>;
  insertCardBenefitEvent: (event: DashboardCardBenefitEventInsert) => Promise<unknown>;
}

export type DashboardLedgerEntryResult =
  | {
    ok: true;
    entryId: number | null;
    syncStatus: "synced" | "pending";
    message: string;
  }
  | {
    ok: false;
    reason: "unsupported_type" | "invalid_request" | "invalid_account" | "whooing_failed";
    message: string;
    fieldErrors: Record<string, string>;
  };

type DashboardLedgerEntryFailureReason =
  | "unsupported_type"
  | "invalid_request"
  | "invalid_account"
  | "whooing_failed";

function invalidResult(
  reason: DashboardLedgerEntryFailureReason,
  message: string,
  fieldErrors: Record<string, string> = {},
): DashboardLedgerEntryResult {
  return { ok: false, reason, message, fieldErrors };
}

function validateExpenseRequest(request: DashboardLedgerEntryRequest) {
  const fieldErrors: Record<string, string> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.occurredDate)) {
    fieldErrors.occurredDate = "날짜는 YYYY-MM-DD 형식이어야 합니다.";
  }
  if (!request.categoryAccountId) {
    fieldErrors.categoryAccountId = "지출 카테고리를 선택해야 합니다.";
  }
  if (request.paymentAccountType !== "assets" && request.paymentAccountType !== "liabilities") {
    fieldErrors.paymentAccountId = "결제수단은 자산 또는 부채 계정이어야 합니다.";
  }
  if (!request.paymentAccountId) {
    fieldErrors.paymentAccountId = "결제수단을 선택해야 합니다.";
  }
  if (!request.item?.trim()) {
    fieldErrors.item = "항목명을 입력해야 합니다.";
  }
  if (!Number.isInteger(request.amount) || request.amount <= 0) {
    fieldErrors.amount = "금액은 0보다 큰 정수여야 합니다.";
  }

  return fieldErrors;
}

function toExpenseSubmission(request: DashboardLedgerEntryRequest): ExpenseModalSubmission {
  return {
    approvalAmount: String(request.amount),
    occurredDate: request.occurredDate,
    merchant: request.item,
    categoryAccountType: "expenses",
    categoryAccountId: request.categoryAccountId,
    categoryAccountLabel: "",
    paymentAccountType: request.paymentAccountType as DashboardPaymentAccountType,
    paymentAccountId: request.paymentAccountId,
    paymentAccountLabel: "",
    discountRuleId: request.discountRuleId || "none",
    userMemo: request.memo ?? "",
  };
}

function benefitMonthFromDate(value: string) {
  return value.slice(0, 7);
}

function whooingDateValue(value: string) {
  return Number(value.replaceAll("-", ""));
}

function buildBenefitEventInsert({
  sectionId,
  whooingEntryId,
  submission,
  evaluation,
}: {
  sectionId: string | undefined;
  whooingEntryId: number | null;
  submission: ExpenseModalSubmission;
  evaluation: CardBenefitEvaluationResult;
}): DashboardCardBenefitEventInsert {
  return {
    sectionId: sectionId ?? null,
    whooingEntryId,
    entryDate: whooingDateValue(submission.occurredDate),
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

async function evaluateExpenseBenefit(
  submission: ExpenseModalSubmission,
  dependencies: DashboardLedgerEntryDependencies,
) {
  if (!submission.discountRuleId || submission.discountRuleId === "none") {
    return null;
  }
  if (submission.paymentAccountType !== "liabilities") {
    throw new ExpensePostingValidationError(
      "paymentAccountId",
      "카드 혜택은 카드/부채 결제수단을 선택해야 적용할 수 있습니다.",
    );
  }

  const rules = await dependencies.getActiveCardBenefitRules();
  const selectedRule = rules.find((rule) => rule.ruleId === submission.discountRuleId);
  const monthlyContext = await dependencies.buildCardBenefitMonthlyContext(
    benefitMonthFromDate(submission.occurredDate),
    submission.discountRuleId,
  );
  const evaluation = evaluateCardBenefit({
    occurredDate: submission.occurredDate,
    selectedRuleId: submission.discountRuleId,
    cardAccountType: "liabilities",
    cardAccountId: submission.paymentAccountId,
    expenseAccountId: submission.categoryAccountId,
    merchant: submission.merchant,
    approvalAmount: Number(submission.approvalAmount),
    rules,
    monthlyContext,
  });

  return {
    evaluation,
    ruleName: selectedRule?.name ?? "카드혜택",
  };
}

export async function createDashboardLedgerEntry({
  request,
  sectionId,
  dependencies,
}: {
  request: DashboardLedgerEntryRequest;
  sectionId: string | undefined;
  dependencies: DashboardLedgerEntryDependencies;
}): Promise<DashboardLedgerEntryResult> {
  if (request.type !== "expense") {
    return invalidResult("unsupported_type", "현재 대시보드 MVP에서는 지출 입력만 지원합니다.");
  }

  const fieldErrors = validateExpenseRequest(request);
  if (Object.keys(fieldErrors).length > 0 || !sectionId) {
    if (fieldErrors.paymentAccountId && request.paymentAccountType && request.paymentAccountType !== "assets" && request.paymentAccountType !== "liabilities") {
      return invalidResult("invalid_account", "결제수단 계정 타입이 올바르지 않습니다.", {
        paymentAccountId: "결제수단은 자산 또는 부채 계정이어야 합니다.",
      });
    }
    return invalidResult("invalid_request", "지출 입력값을 확인해 주세요.", fieldErrors);
  }

  const [isExpenseCategory, isPaymentAccount] = await Promise.all([
    dependencies.assertExpenseCategory(request.categoryAccountId),
    dependencies.assertPaymentAccount(request.paymentAccountType, request.paymentAccountId),
  ]);
  if (!isExpenseCategory) {
    return invalidResult("invalid_account", "지출 카테고리가 올바르지 않습니다.", {
      categoryAccountId: "지출 카테고리가 올바르지 않습니다.",
    });
  }
  if (!isPaymentAccount) {
    return invalidResult("invalid_account", "결제수단이 올바르지 않습니다.", {
      paymentAccountId: "결제수단이 올바르지 않습니다.",
    });
  }

  const submission = toExpenseSubmission(request);
  try {
    const benefit = await evaluateExpenseBenefit(submission, dependencies);
    const calculation = benefit
      ? buildExpensePostingFromCardBenefit(submission, benefit.evaluation, benefit.ruleName)
      : calculateExpensePosting(submission);
    const payload = buildWhooingExpenseEntryPayload({ sectionId, submission, calculation });
    const response = await dependencies.createEntry(payload);
    const entryId = extractWhooingEntryId(response);

    if (benefit) {
      await dependencies.insertCardBenefitEvent(buildBenefitEventInsert({
        sectionId,
        whooingEntryId: entryId,
        submission,
        evaluation: benefit.evaluation,
      }));
    }

    let syncStatus: "synced" | "pending" = "synced";
    try {
      await dependencies.syncForDate(request.occurredDate);
    } catch {
      syncStatus = "pending";
    }

    return {
      ok: true,
      entryId,
      syncStatus,
      message: syncStatus === "synced"
        ? "후잉 지출 등록 및 동기화 확인이 완료되었습니다."
        : "후잉 지출 등록은 완료되었습니다. 대시보드 반영은 잠시 후 확인해 주세요.",
    };
  } catch {
    return invalidResult("whooing_failed", "후잉 지출 등록에 실패했습니다.");
  }
}
