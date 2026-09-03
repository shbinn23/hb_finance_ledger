import {
  buildExpensePostingFromCardBenefit,
  buildWhooingBalanceAdjustmentEntryPayload,
  buildWhooingCardPaymentEntryPayload,
  buildWhooingExpenseEntryPayload,
  buildWhooingIncomeEntryPayload,
  buildWhooingTransferEntryPayload,
  calculateExpensePosting,
  type BalanceAdjustmentEntrySubmission,
  type CardPaymentEntrySubmission,
  type ExpenseEntrySubmission,
  type IncomeEntrySubmission,
  LedgerEntryValidationError,
  type TransferEntrySubmission,
  type WhooingEntryPayload,
} from "./ledger-entry-payload.ts";
import { evaluateCardBenefit } from "../../lib/card-benefits/evaluator.ts";
import type { CardBenefitRule } from "../../lib/card-benefits/types.ts";
import { buildExpenseCardBenefitEventInsert } from "../card-benefits/expense-event.ts";
import type { CardBenefitEventInsert } from "../card-benefits/repository.ts";
import { extractWhooingEntryId } from "../whooing/entry-id.ts";
import { getSyncFailureReason, type SyncFailureReason } from "../whooing/sync-client.ts";
import type {
  LedgerOperationBenefitStatus,
  LedgerOperationStore,
} from "./ledger-operation-repository.ts";

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
  operationKey?: string;
  source?: string;
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
  insertCardBenefitEvent: (event: CardBenefitEventInsert) => Promise<unknown>;
  operationStore?: LedgerOperationStore;
}

export type DashboardLedgerEntryResult =
  | {
    ok: true;
    entryStatus: "created";
    entryId: number | null;
    syncStatus: "synced" | "pending" | "skipped";
    syncReason: SyncFailureReason | null;
    benefitStatus: "created" | "skipped" | "pending" | "failed";
    duplicate?: boolean;
    message: string;
  }
  | {
    ok: false;
    reason: "unsupported_type" | "invalid_request" | "invalid_account" | "whooing_failed" | "operation_pending" | "operation_unavailable";
    message: string;
    fieldErrors: Record<string, string>;
  };

type DashboardLedgerEntryFailureReason =
  | "unsupported_type"
  | "invalid_request"
  | "invalid_account"
  | "whooing_failed"
  | "operation_pending"
  | "operation_unavailable";

function invalidResult(
  reason: DashboardLedgerEntryFailureReason,
  message: string,
  fieldErrors: Record<string, string> = {},
): DashboardLedgerEntryResult {
  return { ok: false, reason, message, fieldErrors };
}

function whooingFailureMessage(error: unknown, entryLabel: string) {
  const status = error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
  const detail = status === 400
    ? "후잉 요청값을 확인해야 합니다."
    : status === 401
      ? "후잉 쓰기 권한이 없습니다."
      : status === 402
        ? "후잉의 일일 API 요청 한도가 소진되었습니다. 다음날 다시 시도해 주세요."
        : status === 405
          ? "후잉 인증 토큰이 만료되었거나 유효하지 않습니다."
          : status === 429
            ? "후잉 요청이 일시적으로 제한되었습니다. 잠시 후 재시도해 주세요."
            : "후잉 API 요청에 실패했습니다.";
  return `후잉 ${entryLabel} 등록 실패: ${detail}`;
}

function whooingFailureLogContext(request: DashboardLedgerEntryRequest, error: unknown) {
  const status = error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
  return {
    entryType: request.type,
    occurredDate: request.occurredDate,
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorStatus: Number.isFinite(status) ? status : undefined,
  };
}

function validateCommonRequest(request: DashboardLedgerEntryRequest) {
  const fieldErrors: Record<string, string> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.occurredDate)) {
    fieldErrors.occurredDate = "날짜는 YYYY-MM-DD 형식이어야 합니다.";
  }
  if (request.operationKey && !/^[A-Za-z0-9:_-]{8,128}$/.test(request.operationKey)) {
    fieldErrors.operationKey = "작업 식별자가 올바르지 않습니다.";
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

function toExpenseSubmission(request: DashboardLedgerEntryRequest): ExpenseEntrySubmission {
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

function toIncomeSubmission(request: DashboardLedgerEntryRequest): IncomeEntrySubmission {
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

function toTransferSubmission(request: DashboardLedgerEntryRequest): TransferEntrySubmission {
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

function toCardPaymentSubmission(request: DashboardLedgerEntryRequest): CardPaymentEntrySubmission {
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

function toBalanceAdjustmentSubmission(request: DashboardLedgerEntryRequest): BalanceAdjustmentEntrySubmission {
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

function benefitFailureLogContext(request: DashboardLedgerEntryRequest, error: unknown) {
  return {
    entryType: request.type,
    occurredDate: request.occurredDate,
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
  };
}

async function evaluateExpenseBenefit(
  submission: ExpenseEntrySubmission,
  dependencies: DashboardLedgerEntryDependencies,
) {
  if (!submission.discountRuleId || submission.discountRuleId === "none") {
    return null;
  }
  if (submission.paymentAccountType !== "liabilities") {
    throw new LedgerEntryValidationError(
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
  let benefitEvent: CardBenefitEventInsert | null = null;

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
        benefitEvent = buildExpenseCardBenefitEventInsert({
          sectionId: sectionId ?? null,
          whooingEntryId: null,
          entryDate: whooingDateValue(submission.occurredDate),
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
    if (error instanceof LedgerEntryValidationError) {
      return invalidResult("invalid_request", error.message, {
        [error.fieldId]: error.message,
      });
    }
    return invalidResult("invalid_request", "입력값을 확인해 주세요.");
  }

  const operationStore = request.operationKey ? dependencies.operationStore : undefined;
  let operationReserved = false;
  if (operationStore && request.operationKey) {
    try {
      const reservation = await operationStore.reserve({
        operationKey: request.operationKey,
        source: request.source ?? "dashboard",
        entryType: request.type,
        occurredDate: request.occurredDate,
        amount: request.amount,
        item: request.item.trim() || successLabel,
      });
      operationReserved = reservation.supported && reservation.outcome === "reserved";
      if (reservation.supported && reservation.outcome === "existing") {
        if (reservation.record.status === "created") {
          return {
            ok: true,
            entryStatus: "created",
            entryId: reservation.record.whooingEntryId,
            syncStatus: reservation.record.syncStatus,
            syncReason: reservation.record.syncReason,
            benefitStatus: reservation.record.benefitStatus,
            duplicate: true,
            message: "이미 처리된 동일 요청입니다. Whooing에 다시 등록하지 않았습니다.",
          };
        }
        return invalidResult(
          "operation_pending",
          "동일 요청이 이미 처리 중입니다. 같은 거래를 다시 등록하지 말고 잠시 후 확인해 주세요.",
        );
      }
    } catch {
      return invalidResult(
        "operation_unavailable",
        "중복 방지 상태를 확인할 수 없어 거래를 등록하지 않았습니다.",
      );
    }
  }

  let entryId: number | null;
  try {
    const response = await dependencies.createEntry(payload);
    entryId = extractWhooingEntryId(response);
  } catch (error) {
    const failureMessage = whooingFailureMessage(error, successLabel);
    console.warn("[ledger-entry] Whooing entry creation failed", whooingFailureLogContext(request, error));
    if (operationReserved && operationStore && request.operationKey) {
      await operationStore.markFailed(request.operationKey, failureMessage).catch(() => undefined);
    }
    return invalidResult("whooing_failed", failureMessage);
  }

  if (operationReserved && operationStore && request.operationKey) {
    await operationStore.markCreated({
      operationKey: request.operationKey,
      whooingEntryId: entryId,
      syncStatus: "pending",
      syncReason: null,
      benefitStatus: benefitEvent ? "pending" : "skipped",
    }).catch((error) => {
      console.warn("[ledger-entry] entry created but operation state update failed", {
        entryType: request.type,
        occurredDate: request.occurredDate,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    });
  }

  let benefitStatus: "created" | "skipped" | "failed" = benefitEvent ? "created" : "skipped";
  if (benefitEvent) {
    try {
      await dependencies.insertCardBenefitEvent({
        ...benefitEvent,
        whooingEntryId: entryId,
      });
    } catch (error) {
      benefitStatus = "failed";
      console.warn(
        "[ledger-entry] Whooing entry created but card benefit evidence failed",
        benefitFailureLogContext(request, error),
      );
    }
  }

  let syncStatus: "synced" | "pending" = "synced";
  let syncReason: SyncFailureReason | null = null;
  try {
    await dependencies.syncForDate(request.occurredDate);
  } catch (error) {
    console.warn(
      "[ledger-entry] Whooing entry created but local sync is pending",
      syncPendingLogContext(request, error),
    );
    syncStatus = "pending";
    syncReason = getSyncFailureReason(error);
  }

  const message = syncReason === "etl_unavailable"
    ? "ETL 동기화 서비스가 실행 중이 아니어서 대시보드에는 아직 반영되지 않았습니다. 후잉 원장 등록은 완료됐으므로 같은 거래를 다시 등록하지 마세요."
    : syncStatus === "pending"
      ? "후잉 원장 등록은 완료됐습니다. 다만 대시보드 반영은 지연될 수 있습니다. 같은 거래를 다시 등록하지 마세요."
      : benefitStatus === "failed"
        ? "후잉 원장 등록과 대시보드 동기화는 완료됐지만 카드혜택 근거 저장에 실패했습니다."
      : `후잉 ${successLabel} 등록 및 대시보드 동기화가 완료되었습니다.`;

  if (operationReserved && operationStore && request.operationKey) {
    await operationStore.markCreated({
      operationKey: request.operationKey,
      whooingEntryId: entryId,
      syncStatus,
      syncReason,
      benefitStatus: benefitStatus as LedgerOperationBenefitStatus,
    }).catch((error) => {
      console.warn("[ledger-entry] operation aftercare state update failed", {
        entryType: request.type,
        occurredDate: request.occurredDate,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return {
    ok: true,
    entryStatus: "created",
    entryId,
    syncStatus,
    syncReason,
    benefitStatus,
    message,
  };
}
