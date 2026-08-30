import {
  buildExpensePostingFromCardBenefit,
  buildWhooingBalanceAdjustmentEntryPayload,
  buildWhooingCardPaymentEntryPayload,
  buildWhooingExpenseEntryPayload,
  buildWhooingIncomeEntryPayload,
  buildWhooingTransferEntryPayload,
  calculateExpensePosting,
  type BalanceAdjustmentModalSubmission,
  type CardPaymentModalSubmission,
  ExpensePostingValidationError,
  type ExpenseModalSubmission,
  type IncomeModalSubmission,
  type TransferModalSubmission,
  type WhooingEntryPayload,
} from "../../features/slack/ledger-entry.ts";
import { evaluateCardBenefit } from "../../lib/card-benefits/evaluator.ts";
import type { CardBenefitRule, CardBenefitEvaluationResult } from "../../lib/card-benefits/types.ts";
import { extractWhooingEntryId } from "../whooing/entry-id.ts";

export type DashboardLedgerEntryType = "expense" | "income" | "transfer" | "card_payment" | "balance_adjustment";
export type DashboardPaymentAccountType = "assets" | "liabilities";
export type DashboardBalanceAdjustmentTargetType = "assets" | "liabilities";
export type DashboardBalanceAdjustmentDirection = "increase" | "decrease";

export interface DashboardLedgerEntryRequest {
  type: DashboardLedgerEntryType | string;
  occurredDate: string;
  categoryAccountId?: string;
  paymentAccountType?: DashboardPaymentAccountType | string;
  paymentAccountId?: string;
  incomeAccountId?: string;
  depositAccountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  cardAccountId?: string;
  assetAccountId?: string;
  targetAccountType?: DashboardBalanceAdjustmentTargetType | string;
  targetAccountId?: string;
  adjustmentDirection?: DashboardBalanceAdjustmentDirection | string;
  capitalAccountId?: string;
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
  assertIncomeCategory: (accountId: string) => Promise<boolean>;
  assertAssetAccount: (accountId: string) => Promise<boolean>;
  assertLiabilityAccount: (accountId: string) => Promise<boolean>;
  assertCreditCardAccount: (accountId: string) => Promise<boolean>;
  assertCapitalAccount: (accountId: string) => Promise<boolean>;
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
    entryStatus: "created";
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

function validateCommonRequest(request: DashboardLedgerEntryRequest) {
  const fieldErrors: Record<string, string> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.occurredDate)) {
    fieldErrors.occurredDate = "날짜는 YYYY-MM-DD 형식이어야 합니다.";
  }
  if (!Number.isInteger(request.amount) || request.amount <= 0) {
    fieldErrors.amount = "금액은 0보다 큰 정수여야 합니다.";
  }

  return fieldErrors;
}

function validateExpenseRequest(request: DashboardLedgerEntryRequest) {
  const fieldErrors = validateCommonRequest(request);
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

  return fieldErrors;
}

function validateIncomeRequest(request: DashboardLedgerEntryRequest) {
  const fieldErrors = validateCommonRequest(request);
  if (!request.incomeAccountId) {
    fieldErrors.incomeAccountId = "수입 카테고리를 선택해야 합니다.";
  }
  if (!request.depositAccountId) {
    fieldErrors.depositAccountId = "입금계좌를 선택해야 합니다.";
  }
  if (!request.item?.trim()) {
    fieldErrors.item = "내용/출처를 입력해야 합니다.";
  }

  return fieldErrors;
}

function validateTransferRequest(request: DashboardLedgerEntryRequest) {
  const fieldErrors = validateCommonRequest(request);
  if (!request.fromAccountId) {
    fieldErrors.fromAccountId = "출금계좌를 선택해야 합니다.";
  }
  if (!request.toAccountId) {
    fieldErrors.toAccountId = "입금계좌를 선택해야 합니다.";
  }
  if (request.fromAccountId && request.toAccountId && request.fromAccountId === request.toAccountId) {
    fieldErrors.toAccountId = "출금 계정과 입금 계정은 달라야 합니다.";
  }
  if (!request.item?.trim()) {
    fieldErrors.item = "내용을 입력해야 합니다.";
  }

  return fieldErrors;
}

function validateCardPaymentRequest(request: DashboardLedgerEntryRequest) {
  const fieldErrors = validateCommonRequest(request);
  if (!request.cardAccountId) {
    fieldErrors.cardAccountId = "카드를 선택해야 합니다.";
  }
  if (!request.assetAccountId) {
    fieldErrors.assetAccountId = "출금계좌를 선택해야 합니다.";
  }

  return fieldErrors;
}

function validateBalanceAdjustmentRequest(request: DashboardLedgerEntryRequest) {
  const fieldErrors = validateCommonRequest(request);
  if (request.targetAccountType !== "assets" && request.targetAccountType !== "liabilities") {
    fieldErrors.targetAccountType = "조정 대상 타입을 선택해야 합니다.";
  }
  if (!request.targetAccountId) {
    fieldErrors.targetAccountId = "조정계좌를 선택해야 합니다.";
  }
  if (request.adjustmentDirection !== "increase" && request.adjustmentDirection !== "decrease") {
    fieldErrors.adjustmentDirection = "조정 방향을 선택해야 합니다.";
  }
  if (!request.capitalAccountId) {
    fieldErrors.capitalAccountId = "조정 상대 capital 계정을 선택해야 합니다.";
  }
  if (!request.item?.trim()) {
    fieldErrors.item = "조정 사유를 입력해야 합니다.";
  }

  return fieldErrors;
}

function toExpenseSubmission(request: DashboardLedgerEntryRequest): ExpenseModalSubmission {
  return {
    approvalAmount: String(request.amount),
    occurredDate: request.occurredDate,
    merchant: request.item,
    categoryAccountType: "expenses",
    categoryAccountId: request.categoryAccountId ?? "",
    categoryAccountLabel: "",
    paymentAccountType: request.paymentAccountType as DashboardPaymentAccountType,
    paymentAccountId: request.paymentAccountId ?? "",
    paymentAccountLabel: "",
    discountRuleId: request.discountRuleId || "none",
    userMemo: request.memo ?? "",
  };
}

function toIncomeSubmission(request: DashboardLedgerEntryRequest): IncomeModalSubmission {
  return {
    amount: String(request.amount),
    occurredDate: request.occurredDate,
    source: request.item,
    depositAccountType: "assets",
    depositAccountId: request.depositAccountId ?? "",
    depositAccountLabel: "",
    incomeAccountType: "income",
    incomeAccountId: request.incomeAccountId ?? "",
    incomeAccountLabel: "",
    userMemo: request.memo ?? "",
  };
}

function toTransferSubmission(request: DashboardLedgerEntryRequest): TransferModalSubmission {
  return {
    amount: String(request.amount),
    occurredDate: request.occurredDate,
    fromAccountType: "assets",
    fromAccountId: request.fromAccountId ?? "",
    fromAccountLabel: "",
    toAccountType: "assets",
    toAccountId: request.toAccountId ?? "",
    toAccountLabel: "",
    item: request.item,
    userMemo: request.memo ?? "",
  };
}

function toCardPaymentSubmission(request: DashboardLedgerEntryRequest): CardPaymentModalSubmission {
  return {
    amount: String(request.amount),
    occurredDate: request.occurredDate,
    liabilityAccountType: "liabilities",
    liabilityAccountId: request.cardAccountId ?? "",
    liabilityAccountLabel: "",
    assetAccountType: "assets",
    assetAccountId: request.assetAccountId ?? "",
    assetAccountLabel: "",
    item: request.item.trim() || "카드대금 상환",
    userMemo: request.memo ?? "",
  };
}

function toBalanceAdjustmentSubmission(request: DashboardLedgerEntryRequest): BalanceAdjustmentModalSubmission {
  const targetAccountType = request.targetAccountType === "assets" || request.targetAccountType === "liabilities"
    ? request.targetAccountType
    : "";
  return {
    occurredDate: request.occurredDate,
    targetAccountType,
    targetAccountIdType: targetAccountType,
    targetAccountId: request.targetAccountId ?? "",
    targetAccountLabel: "",
    direction: request.adjustmentDirection === "increase" || request.adjustmentDirection === "decrease"
      ? request.adjustmentDirection
      : "",
    amount: String(request.amount),
    reason: request.item,
    capitalAccountType: "capital",
    capitalAccountId: request.capitalAccountId ?? "",
    capitalAccountLabel: "",
    userMemo: request.memo ?? "",
  };
}

function benefitMonthFromDate(value: string) {
  return value.slice(0, 7);
}

function whooingDateValue(value: string) {
  return Number(value.replaceAll("-", ""));
}

function syncPendingLogContext(request: DashboardLedgerEntryRequest, error: unknown) {
  const errorName = error instanceof Error ? error.name : typeof error;
  const errorMessage = error instanceof Error ? error.message : String(error);

  return {
    entryType: request.type,
    occurredDate: request.occurredDate,
    errorName,
    errorMessage,
    isTimeout: /timeout|timed out|abort/i.test(`${errorName} ${errorMessage}`),
  };
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
  if (!sectionId) {
    return invalidResult("invalid_request", "후잉 섹션 설정이 없습니다.");
  }

  let payload: WhooingEntryPayload;
  let successLabel = "거래";
  let benefitEvent: DashboardCardBenefitEventInsert | null = null;

  try {
    if (request.type === "expense") {
      const fieldErrors = validateExpenseRequest(request);
      if (Object.keys(fieldErrors).length > 0) {
        if (fieldErrors.paymentAccountId && request.paymentAccountType && request.paymentAccountType !== "assets" && request.paymentAccountType !== "liabilities") {
          return invalidResult("invalid_account", "결제수단 계정 타입이 올바르지 않습니다.", {
            paymentAccountId: "결제수단은 자산 또는 부채 계정이어야 합니다.",
          });
        }
        return invalidResult("invalid_request", "지출 입력값을 확인해 주세요.", fieldErrors);
      }

      const [isExpenseCategory, isPaymentAccount] = await Promise.all([
        dependencies.assertExpenseCategory(request.categoryAccountId ?? ""),
        dependencies.assertPaymentAccount(request.paymentAccountType ?? "", request.paymentAccountId ?? ""),
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
      const benefit = await evaluateExpenseBenefit(submission, dependencies);
      const calculation = benefit
        ? buildExpensePostingFromCardBenefit(submission, benefit.evaluation, benefit.ruleName)
        : calculateExpensePosting(submission);
      payload = buildWhooingExpenseEntryPayload({ sectionId, submission, calculation });
      successLabel = "지출";
      if (benefit) {
        benefitEvent = buildBenefitEventInsert({
          sectionId,
          whooingEntryId: null,
          submission,
          evaluation: benefit.evaluation,
        });
      }
    } else if (request.type === "income") {
      const fieldErrors = validateIncomeRequest(request);
      if (Object.keys(fieldErrors).length > 0) {
        return invalidResult("invalid_request", "수입 입력값을 확인해 주세요.", fieldErrors);
      }
      const [isIncomeCategory, isDepositAccount] = await Promise.all([
        dependencies.assertIncomeCategory(request.incomeAccountId ?? ""),
        dependencies.assertAssetAccount(request.depositAccountId ?? ""),
      ]);
      if (!isIncomeCategory) {
        return invalidResult("invalid_account", "수입 카테고리가 올바르지 않습니다.", {
          incomeAccountId: "수입 카테고리가 올바르지 않습니다.",
        });
      }
      if (!isDepositAccount) {
        return invalidResult("invalid_account", "입금계좌가 올바르지 않습니다.", {
          depositAccountId: "입금계좌가 올바르지 않습니다.",
        });
      }
      payload = buildWhooingIncomeEntryPayload({ sectionId, submission: toIncomeSubmission(request) });
      successLabel = "수입";
    } else if (request.type === "transfer") {
      const fieldErrors = validateTransferRequest(request);
      if (Object.keys(fieldErrors).length > 0) {
        return invalidResult("invalid_request", "이체 입력값을 확인해 주세요.", fieldErrors);
      }
      const [isFromAccount, isToAccount] = await Promise.all([
        dependencies.assertAssetAccount(request.fromAccountId ?? ""),
        dependencies.assertAssetAccount(request.toAccountId ?? ""),
      ]);
      if (!isFromAccount) {
        return invalidResult("invalid_account", "출금계좌가 올바르지 않습니다.", {
          fromAccountId: "출금계좌가 올바르지 않습니다.",
        });
      }
      if (!isToAccount) {
        return invalidResult("invalid_account", "입금계좌가 올바르지 않습니다.", {
          toAccountId: "입금계좌가 올바르지 않습니다.",
        });
      }
      payload = buildWhooingTransferEntryPayload({ sectionId, submission: toTransferSubmission(request) });
      successLabel = "이체";
    } else if (request.type === "card_payment") {
      const fieldErrors = validateCardPaymentRequest(request);
      if (Object.keys(fieldErrors).length > 0) {
        return invalidResult("invalid_request", "카드상환 입력값을 확인해 주세요.", fieldErrors);
      }
      const [isCreditCard, isAssetAccount] = await Promise.all([
        dependencies.assertCreditCardAccount(request.cardAccountId ?? ""),
        dependencies.assertAssetAccount(request.assetAccountId ?? ""),
      ]);
      if (!isCreditCard) {
        return invalidResult("invalid_account", "카드 계정이 올바르지 않습니다.", {
          cardAccountId: "신용카드 계정을 선택해야 합니다.",
        });
      }
      if (!isAssetAccount) {
        return invalidResult("invalid_account", "출금계좌가 올바르지 않습니다.", {
          assetAccountId: "출금계좌가 올바르지 않습니다.",
        });
      }
      payload = buildWhooingCardPaymentEntryPayload({ sectionId, submission: toCardPaymentSubmission(request) });
      successLabel = "카드상환";
    } else if (request.type === "balance_adjustment") {
      const fieldErrors = validateBalanceAdjustmentRequest(request);
      if (Object.keys(fieldErrors).length > 0) {
        return invalidResult("invalid_request", "잔고조정 입력값을 확인해 주세요.", fieldErrors);
      }
      const isTargetAccount = request.targetAccountType === "assets"
        ? await dependencies.assertAssetAccount(request.targetAccountId ?? "")
        : await dependencies.assertLiabilityAccount(request.targetAccountId ?? "");
      const isCapitalAccount = await dependencies.assertCapitalAccount(request.capitalAccountId ?? "");
      if (!isTargetAccount) {
        return invalidResult("invalid_account", "조정계좌가 올바르지 않습니다.", {
          targetAccountId: "조정계좌가 올바르지 않습니다.",
        });
      }
      if (!isCapitalAccount) {
        return invalidResult("invalid_account", "조정 상대 capital 계정이 올바르지 않습니다.", {
          capitalAccountId: "조정 상대 capital 계정이 올바르지 않습니다.",
        });
      }
      payload = buildWhooingBalanceAdjustmentEntryPayload({ sectionId, submission: toBalanceAdjustmentSubmission(request) });
      successLabel = "잔고조정";
    } else {
      return invalidResult("unsupported_type", "지원하지 않는 거래 유형입니다.");
    }
  } catch (error) {
    if (error instanceof ExpensePostingValidationError) {
      return invalidResult("invalid_request", error.message, {
        [error.blockId]: error.message,
      });
    }
    return invalidResult("invalid_request", "입력값을 확인해 주세요.");
  }

  try {
    const response = await dependencies.createEntry(payload);
    const entryId = extractWhooingEntryId(response);

    if (benefitEvent) {
      await dependencies.insertCardBenefitEvent({
        ...benefitEvent,
        whooingEntryId: entryId,
      });
    }

    let syncStatus: "synced" | "pending" = "synced";
    try {
      await dependencies.syncForDate(request.occurredDate);
    } catch (error) {
      console.warn(
        "[ledger-entry] Whooing entry created but local sync is pending",
        syncPendingLogContext(request, error),
      );
      syncStatus = "pending";
    }

    return {
      ok: true,
      entryStatus: "created",
      entryId,
      syncStatus,
      message: syncStatus === "synced"
        ? `후잉 ${successLabel} 등록 및 대시보드 동기화가 완료되었습니다.`
        : "후잉 원장 등록은 완료됐지만 대시보드 반영은 지연될 수 있습니다.",
    };
  } catch {
    return invalidResult("whooing_failed", `후잉 ${successLabel} 등록에 실패했습니다.`);
  }
}
