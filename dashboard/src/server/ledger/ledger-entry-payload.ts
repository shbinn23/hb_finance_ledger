import type { CardBenefitEvaluationResult } from "../../lib/card-benefits/types.ts";

type ExpenseAccountType = "expenses";
type IncomeAccountType = "income";
type CapitalAccountType = "capital";
type PaymentAccountType = "assets" | "liabilities";
type AssetAccountType = "assets";
type LiabilityAccountType = "liabilities";
type BalanceAdjustmentTargetAccountType = AssetAccountType | LiabilityAccountType;
type BalanceAdjustmentDirection = "increase" | "decrease";

const EXPENSE_FIELD_IDS = {
  approvalAmount: "approval_amount",
  occurredDate: "occurred_date",
  merchant: "merchant",
  categoryAccountId: "category_account_id",
  paymentAccountId: "payment_account_id",
  discountRuleId: "discount_rule_id",
} as const;

const INCOME_FIELD_IDS = {
  amount: "income_amount",
  occurredDate: "income_occurred_date",
  source: "income_source",
  depositAccountId: "income_deposit_account_id",
  incomeAccountId: "income_account_id",
} as const;

const TRANSFER_FIELD_IDS = {
  amount: "transfer_amount",
  occurredDate: "transfer_occurred_date",
  fromAccountId: "transfer_from_account_id",
  toAccountId: "transfer_to_account_id",
  item: "transfer_item",
} as const;

const CARD_PAYMENT_FIELD_IDS = {
  amount: "card_payment_amount",
  occurredDate: "card_payment_occurred_date",
  liabilityAccountId: "card_payment_liability_account_id",
  assetAccountId: "card_payment_asset_account_id",
  item: "card_payment_item",
} as const;

const BALANCE_ADJUSTMENT_FIELD_IDS = {
  occurredDate: "balance_adjustment_occurred_date",
  targetAccountType: "balance_adjustment_target_account_type",
  targetAccountId: "balance_adjustment_target_account_id",
  direction: "balance_adjustment_direction",
  amount: "balance_adjustment_amount",
  reason: "balance_adjustment_reason",
  capitalAccountId: "balance_adjustment_capital_account_id",
} as const;

const DISCOUNT_RULES = [
  { id: "none", label: "혜택 없음", type: "none" },
  { id: "hana_mgs_simple_pay_10p", label: "하나 MG+S · 간편결제 10%", type: "card_benefit" },
  { id: "hana_mgs_subscription_50p", label: "하나 MG+S · 구독 50%", type: "card_benefit" },
  { id: "shinhan_lady_lunch_5p", label: "신한 레이디 · 점심 5%", type: "card_benefit" },
  { id: "shinhan_lady_medical_5p", label: "신한 레이디 · 병원/약국 5%", type: "card_benefit" },
  { id: "shinhan_lady_shopping_3p", label: "신한 레이디 · 쇼핑 3%", type: "card_benefit" },
] as const;

export interface ExpenseEntrySubmission {
  approvalAmount: string;
  occurredDate: string;
  merchant: string;
  categoryAccountType: ExpenseAccountType | "";
  categoryAccountId: string;
  categoryAccountLabel: string;
  paymentAccountType: PaymentAccountType | "";
  paymentAccountId: string;
  paymentAccountLabel: string;
  discountRuleId: string;
  userMemo: string;
}

export interface IncomeEntrySubmission {
  amount: string;
  occurredDate: string;
  source: string;
  depositAccountType: PaymentAccountType | "";
  depositAccountId: string;
  depositAccountLabel: string;
  incomeAccountType: IncomeAccountType | "";
  incomeAccountId: string;
  incomeAccountLabel: string;
  userMemo: string;
}

export interface TransferEntrySubmission {
  amount: string;
  occurredDate: string;
  fromAccountType: AssetAccountType | "";
  fromAccountId: string;
  fromAccountLabel: string;
  toAccountType: AssetAccountType | "";
  toAccountId: string;
  toAccountLabel: string;
  item: string;
  userMemo: string;
}

export interface CardPaymentEntrySubmission {
  amount: string;
  occurredDate: string;
  liabilityAccountType: LiabilityAccountType | "";
  liabilityAccountId: string;
  liabilityAccountLabel: string;
  assetAccountType: AssetAccountType | "";
  assetAccountId: string;
  assetAccountLabel: string;
  item: string;
  userMemo: string;
}

export interface BalanceAdjustmentEntrySubmission {
  occurredDate: string;
  targetAccountType: BalanceAdjustmentTargetAccountType | "";
  targetAccountIdType: BalanceAdjustmentTargetAccountType | "";
  targetAccountId: string;
  targetAccountLabel: string;
  direction: BalanceAdjustmentDirection | "";
  amount: string;
  reason: string;
  capitalAccountType: CapitalAccountType | "";
  capitalAccountId: string;
  capitalAccountLabel: string;
  userMemo: string;
}

export interface ExpensePostingCalculation {
  approvalAmount: number;
  discountRuleId: string;
  discountRuleLabel: string;
  discountAmount: number;
  postingAmount: number;
  mergedMemo: string;
}

export interface WhooingEntryPayload {
  section_id: string;
  entry_date: string;
  l_account: "expenses" | PaymentAccountType | CapitalAccountType;
  l_account_id: string;
  r_account: PaymentAccountType | "income" | CapitalAccountType;
  r_account_id: string;
  item: string;
  money: number;
  memo: string;
}

export class LedgerEntryValidationError extends Error {
  public readonly fieldId: string;

  constructor(fieldId: string, message: string) {
    super(message);
    this.name = "LedgerEntryValidationError";
    this.fieldId = fieldId;
  }
}

function parseAmount(value: string, fieldId: string, label: string) {
  if (!/^[1-9]\d*$/.test(value.trim())) {
    throw new LedgerEntryValidationError(fieldId, `${label}은 0보다 큰 정수여야 합니다.`);
  }
  return Number(value);
}

function toWhooingEntryDate(value: string, fieldId: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new LedgerEntryValidationError(fieldId, "거래일은 YYYY-MM-DD 형식이어야 합니다.");
  }
  return value.replaceAll("-", "");
}

function requireText(value: string, fieldId: string, message: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new LedgerEntryValidationError(fieldId, message);
  return trimmed;
}

function requireAccountId(value: string, fieldId: string, message: string) {
  if (!value || value === "missing") throw new LedgerEntryValidationError(fieldId, message);
}

function won(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function mergedMemo(userMemo: string, approvalAmount: number, ruleLabel: string, discountAmount: number) {
  return [
    userMemo.trim(),
    `승인금액 ${won(approvalAmount)}`,
    discountAmount > 0 ? `카드혜택 ${ruleLabel}` : "",
    discountAmount > 0 ? `할인액 ${won(discountAmount)}` : "",
  ].filter(Boolean).join(" / ");
}

function mergedCardBenefitMemo(
  submission: Pick<ExpenseEntrySubmission, "userMemo">,
  evaluation: CardBenefitEvaluationResult,
  ruleLabel: string,
) {
  return [
    submission.userMemo.trim(),
    `승인금액 ${won(evaluation.approvalAmount)}`,
    `카드혜택 ${ruleLabel}`,
    "사용자 선택 기준",
    `이론할인액 ${won(evaluation.eligibleDiscountAmount)}`,
    `적용할인액 ${won(evaluation.appliedDiscountAmount)}`,
    `후잉등록금액 ${won(evaluation.postingAmount)}`,
    evaluation.reason === "automatic_cap_unavailable" ? "카드혜택 미적용: 전월 실적 추정 부족" : "",
  ].filter(Boolean).join(" / ");
}

export function calculateExpensePosting(
  submission: Pick<ExpenseEntrySubmission, "approvalAmount" | "discountRuleId" | "userMemo">,
): ExpensePostingCalculation {
  const approvalAmount = parseAmount(submission.approvalAmount, EXPENSE_FIELD_IDS.approvalAmount, "승인금액");
  const rule = DISCOUNT_RULES.find((item) => item.id === submission.discountRuleId);
  if (!rule) {
    throw new LedgerEntryValidationError(EXPENSE_FIELD_IDS.discountRuleId, "알 수 없는 카드 혜택입니다.");
  }
  const discountAmount = 0;
  const postingAmount = approvalAmount;

  return {
    approvalAmount,
    discountRuleId: rule.id,
    discountRuleLabel: rule.label,
    discountAmount,
    postingAmount,
    mergedMemo: mergedMemo(submission.userMemo, approvalAmount, rule.label, discountAmount),
  };
}

export function buildExpensePostingFromCardBenefit(
  submission: Pick<ExpenseEntrySubmission, "userMemo">,
  evaluation: CardBenefitEvaluationResult,
  ruleLabel: string,
): ExpensePostingCalculation {
  if (evaluation.reason === "automatic_cap_unavailable") {
    throw new LedgerEntryValidationError(
      EXPENSE_FIELD_IDS.discountRuleId,
      "전월 실적 추정이 부족해 이 카드혜택 한도를 자동 산정할 수 없습니다.",
    );
  }
  if (!Number.isInteger(evaluation.postingAmount) || evaluation.postingAmount <= 0) {
    throw new LedgerEntryValidationError(
      EXPENSE_FIELD_IDS.approvalAmount,
      "카드 혜택 적용 후 등록 금액은 0보다 커야 합니다.",
    );
  }

  return {
    approvalAmount: evaluation.approvalAmount,
    discountRuleId: evaluation.ruleId ?? "none",
    discountRuleLabel: ruleLabel,
    discountAmount: evaluation.appliedDiscountAmount,
    postingAmount: evaluation.postingAmount,
    mergedMemo: mergedCardBenefitMemo(submission, evaluation, ruleLabel),
  };
}

export function buildWhooingExpenseEntryPayload({
  sectionId,
  submission,
  calculation,
}: {
  sectionId: string | undefined;
  submission: ExpenseEntrySubmission;
  calculation: ExpensePostingCalculation;
}): WhooingEntryPayload {
  if (!sectionId) throw new LedgerEntryValidationError(EXPENSE_FIELD_IDS.categoryAccountId, "후잉 섹션 설정이 없습니다.");
  if (submission.categoryAccountType !== "expenses") throw new LedgerEntryValidationError(EXPENSE_FIELD_IDS.categoryAccountId, "지출 카테고리 계정 타입이 올바르지 않습니다.");
  requireAccountId(submission.categoryAccountId, EXPENSE_FIELD_IDS.categoryAccountId, "지출 카테고리를 선택해야 합니다.");
  if (submission.paymentAccountType !== "assets" && submission.paymentAccountType !== "liabilities") throw new LedgerEntryValidationError(EXPENSE_FIELD_IDS.paymentAccountId, "결제수단 계정 타입이 올바르지 않습니다.");
  requireAccountId(submission.paymentAccountId, EXPENSE_FIELD_IDS.paymentAccountId, "결제수단을 선택해야 합니다.");
  const item = requireText(submission.merchant, EXPENSE_FIELD_IDS.merchant, "내용/가맹점을 입력해야 합니다.");
  if (!Number.isInteger(calculation.postingAmount) || calculation.postingAmount <= 0) throw new LedgerEntryValidationError(EXPENSE_FIELD_IDS.approvalAmount, "후잉 등록 금액은 0보다 큰 정수여야 합니다.");

  return {
    section_id: sectionId,
    entry_date: toWhooingEntryDate(submission.occurredDate, EXPENSE_FIELD_IDS.occurredDate),
    l_account: "expenses",
    l_account_id: submission.categoryAccountId,
    r_account: submission.paymentAccountType,
    r_account_id: submission.paymentAccountId,
    item,
    money: calculation.postingAmount,
    memo: calculation.mergedMemo,
  };
}

export function buildWhooingIncomeEntryPayload({ sectionId, submission }: {
  sectionId: string | undefined;
  submission: IncomeEntrySubmission;
}): WhooingEntryPayload {
  if (!sectionId) throw new LedgerEntryValidationError(INCOME_FIELD_IDS.incomeAccountId, "후잉 섹션 설정이 없습니다.");
  const amount = parseAmount(submission.amount, INCOME_FIELD_IDS.amount, "수입금액");
  if (submission.depositAccountType !== "assets" && submission.depositAccountType !== "liabilities") throw new LedgerEntryValidationError(INCOME_FIELD_IDS.depositAccountId, "입금 계정 타입이 올바르지 않습니다.");
  requireAccountId(submission.depositAccountId, INCOME_FIELD_IDS.depositAccountId, "입금 계정을 선택해야 합니다.");
  if (submission.incomeAccountType !== "income") throw new LedgerEntryValidationError(INCOME_FIELD_IDS.incomeAccountId, "수입 카테고리 계정 타입이 올바르지 않습니다.");
  requireAccountId(submission.incomeAccountId, INCOME_FIELD_IDS.incomeAccountId, "수입 카테고리를 선택해야 합니다.");

  return {
    section_id: sectionId,
    entry_date: toWhooingEntryDate(submission.occurredDate, INCOME_FIELD_IDS.occurredDate),
    l_account: submission.depositAccountType,
    l_account_id: submission.depositAccountId,
    r_account: "income",
    r_account_id: submission.incomeAccountId,
    item: requireText(submission.source, INCOME_FIELD_IDS.source, "내용/출처를 입력해야 합니다."),
    money: amount,
    memo: submission.userMemo.trim(),
  };
}

export function buildWhooingTransferEntryPayload({ sectionId, submission }: {
  sectionId: string | undefined;
  submission: TransferEntrySubmission;
}): WhooingEntryPayload {
  if (!sectionId) throw new LedgerEntryValidationError(TRANSFER_FIELD_IDS.fromAccountId, "후잉 섹션 설정이 없습니다.");
  const amount = parseAmount(submission.amount, TRANSFER_FIELD_IDS.amount, "이체금액");
  if (submission.fromAccountType !== "assets") throw new LedgerEntryValidationError(TRANSFER_FIELD_IDS.fromAccountId, "출금 계정 타입이 올바르지 않습니다.");
  requireAccountId(submission.fromAccountId, TRANSFER_FIELD_IDS.fromAccountId, "출금 계정을 선택해야 합니다.");
  if (submission.toAccountType !== "assets") throw new LedgerEntryValidationError(TRANSFER_FIELD_IDS.toAccountId, "입금 계정 타입이 올바르지 않습니다.");
  requireAccountId(submission.toAccountId, TRANSFER_FIELD_IDS.toAccountId, "입금 계정을 선택해야 합니다.");
  if (submission.fromAccountId === submission.toAccountId) throw new LedgerEntryValidationError(TRANSFER_FIELD_IDS.toAccountId, "출금 계정과 입금 계정은 달라야 합니다.");

  return {
    section_id: sectionId,
    entry_date: toWhooingEntryDate(submission.occurredDate, TRANSFER_FIELD_IDS.occurredDate),
    l_account: "assets",
    l_account_id: submission.toAccountId,
    r_account: "assets",
    r_account_id: submission.fromAccountId,
    item: requireText(submission.item, TRANSFER_FIELD_IDS.item, "내용을 입력해야 합니다."),
    money: amount,
    memo: submission.userMemo.trim(),
  };
}

export function buildWhooingCardPaymentEntryPayload({ sectionId, submission }: {
  sectionId: string | undefined;
  submission: CardPaymentEntrySubmission;
}): WhooingEntryPayload {
  if (!sectionId) throw new LedgerEntryValidationError(CARD_PAYMENT_FIELD_IDS.liabilityAccountId, "후잉 섹션 설정이 없습니다.");
  const amount = parseAmount(submission.amount, CARD_PAYMENT_FIELD_IDS.amount, "상환금액");
  if (submission.liabilityAccountType !== "liabilities") throw new LedgerEntryValidationError(CARD_PAYMENT_FIELD_IDS.liabilityAccountId, "카드/부채 계정 타입이 올바르지 않습니다.");
  requireAccountId(submission.liabilityAccountId, CARD_PAYMENT_FIELD_IDS.liabilityAccountId, "카드/부채 계정을 선택해야 합니다.");
  if (submission.assetAccountType !== "assets") throw new LedgerEntryValidationError(CARD_PAYMENT_FIELD_IDS.assetAccountId, "출금 계정 타입이 올바르지 않습니다.");
  requireAccountId(submission.assetAccountId, CARD_PAYMENT_FIELD_IDS.assetAccountId, "출금 계정을 선택해야 합니다.");

  return {
    section_id: sectionId,
    entry_date: toWhooingEntryDate(submission.occurredDate, CARD_PAYMENT_FIELD_IDS.occurredDate),
    l_account: "liabilities",
    l_account_id: submission.liabilityAccountId,
    r_account: "assets",
    r_account_id: submission.assetAccountId,
    item: requireText(submission.item, CARD_PAYMENT_FIELD_IDS.item, "내용을 입력해야 합니다."),
    money: amount,
    memo: submission.userMemo.trim(),
  };
}

function adjustmentMemo(submission: BalanceAdjustmentEntrySubmission) {
  return [
    "잔고조정",
    `사유: ${submission.reason.trim()}`,
    `방향: ${submission.direction === "increase" ? "증가" : "감소"}`,
    submission.userMemo.trim(),
  ].filter(Boolean).join(" / ");
}

export function buildWhooingBalanceAdjustmentEntryPayload({ sectionId, submission }: {
  sectionId: string | undefined;
  submission: BalanceAdjustmentEntrySubmission;
}): WhooingEntryPayload {
  if (!sectionId) throw new LedgerEntryValidationError(BALANCE_ADJUSTMENT_FIELD_IDS.capitalAccountId, "후잉 섹션 설정이 없습니다.");
  const amount = parseAmount(submission.amount, BALANCE_ADJUSTMENT_FIELD_IDS.amount, "조정금액");
  const reason = requireText(submission.reason, BALANCE_ADJUSTMENT_FIELD_IDS.reason, "조정 사유를 입력해야 합니다.");
  if (submission.targetAccountType !== "assets" && submission.targetAccountType !== "liabilities") throw new LedgerEntryValidationError(BALANCE_ADJUSTMENT_FIELD_IDS.targetAccountType, "조정 대상 타입을 선택해야 합니다.");
  if (submission.targetAccountIdType !== submission.targetAccountType) throw new LedgerEntryValidationError(BALANCE_ADJUSTMENT_FIELD_IDS.targetAccountId, "조정 대상 계정 타입이 선택한 타입과 다릅니다.");
  requireAccountId(submission.targetAccountId, BALANCE_ADJUSTMENT_FIELD_IDS.targetAccountId, "조정 대상 계정을 선택해야 합니다.");
  if (submission.direction !== "increase" && submission.direction !== "decrease") throw new LedgerEntryValidationError(BALANCE_ADJUSTMENT_FIELD_IDS.direction, "조정 방향을 선택해야 합니다.");
  if (submission.capitalAccountType !== "capital") throw new LedgerEntryValidationError(BALANCE_ADJUSTMENT_FIELD_IDS.capitalAccountId, "조정 상대 capital 계정 타입이 올바르지 않습니다.");
  requireAccountId(submission.capitalAccountId, BALANCE_ADJUSTMENT_FIELD_IDS.capitalAccountId, "조정 상대 capital 계정을 선택해야 합니다.");

  const base = {
    section_id: sectionId,
    entry_date: toWhooingEntryDate(submission.occurredDate, BALANCE_ADJUSTMENT_FIELD_IDS.occurredDate),
    item: "잔고조정",
    money: amount,
    memo: adjustmentMemo({ ...submission, reason }),
  };

  if (submission.targetAccountType === "assets" && submission.direction === "increase") {
    return { ...base, l_account: "assets", l_account_id: submission.targetAccountId, r_account: "capital", r_account_id: submission.capitalAccountId };
  }
  if (submission.targetAccountType === "assets" && submission.direction === "decrease") {
    return { ...base, l_account: "capital", l_account_id: submission.capitalAccountId, r_account: "assets", r_account_id: submission.targetAccountId };
  }
  if (submission.targetAccountType === "liabilities" && submission.direction === "increase") {
    return { ...base, l_account: "capital", l_account_id: submission.capitalAccountId, r_account: "liabilities", r_account_id: submission.targetAccountId };
  }
  return { ...base, l_account: "liabilities", l_account_id: submission.targetAccountId, r_account: "capital", r_account_id: submission.capitalAccountId };
}
