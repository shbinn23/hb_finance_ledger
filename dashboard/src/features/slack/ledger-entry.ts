import type { CardBenefitEvaluationResult } from "@/lib/card-benefits/types";

export const EXPENSE_LEDGER_CALLBACK_ID = "expense_ledger_entry";
export const INCOME_LEDGER_CALLBACK_ID = "income_ledger_entry";
export const TRANSFER_LEDGER_CALLBACK_ID = "transfer_ledger_entry";
export const CARD_PAYMENT_LEDGER_CALLBACK_ID = "card_payment_ledger_entry";
export const BALANCE_ADJUSTMENT_LEDGER_CALLBACK_ID = "balance_adjustment_ledger_entry";
export const LEDGER_ENTRY_TYPE_SELECT_CALLBACK_ID = "ledger_entry_type_select";
export const LEDGER_ENTRY_UNSUPPORTED_CALLBACK_ID = "ledger_entry_unsupported";
export const LEDGER_ENTRY_TYPE_SELECT_BLOCK_ID = "ledger_entry_type";
export const LEDGER_ENTRY_TYPE_SELECT_ACTION_ID = "ledger_entry_type";

export type LedgerEntryType = "expense" | "income" | "transfer" | "card_payment" | "balance_adjustment";

export const EXPENSE_BLOCK_IDS = {
  approvalAmount: "approval_amount",
  occurredDate: "occurred_date",
  merchant: "merchant",
  categoryAccountId: "category_account_id",
  paymentAccountId: "payment_account_id",
  discountRuleId: "discount_rule_id",
  userMemo: "user_memo",
} as const;

export const EXPENSE_ACTION_IDS = EXPENSE_BLOCK_IDS;

export const INCOME_BLOCK_IDS = {
  amount: "income_amount",
  occurredDate: "income_occurred_date",
  source: "income_source",
  depositAccountId: "income_deposit_account_id",
  incomeAccountId: "income_account_id",
  userMemo: "income_user_memo",
} as const;

export const INCOME_ACTION_IDS = INCOME_BLOCK_IDS;

export const TRANSFER_BLOCK_IDS = {
  amount: "transfer_amount",
  occurredDate: "transfer_occurred_date",
  fromAccountId: "transfer_from_account_id",
  toAccountId: "transfer_to_account_id",
  item: "transfer_item",
  userMemo: "transfer_user_memo",
} as const;

export const TRANSFER_ACTION_IDS = TRANSFER_BLOCK_IDS;

export const CARD_PAYMENT_BLOCK_IDS = {
  amount: "card_payment_amount",
  occurredDate: "card_payment_occurred_date",
  liabilityAccountId: "card_payment_liability_account_id",
  assetAccountId: "card_payment_asset_account_id",
  item: "card_payment_item",
  userMemo: "card_payment_user_memo",
} as const;

export const CARD_PAYMENT_ACTION_IDS = CARD_PAYMENT_BLOCK_IDS;

export const BALANCE_ADJUSTMENT_BLOCK_IDS = {
  occurredDate: "balance_adjustment_occurred_date",
  targetAccountType: "balance_adjustment_target_account_type",
  targetAccountId: "balance_adjustment_target_account_id",
  direction: "balance_adjustment_direction",
  amount: "balance_adjustment_amount",
  reason: "balance_adjustment_reason",
  capitalAccountId: "balance_adjustment_capital_account_id",
  userMemo: "balance_adjustment_user_memo",
} as const;

export const BALANCE_ADJUSTMENT_ACTION_IDS = BALANCE_ADJUSTMENT_BLOCK_IDS;

export const DISCOUNT_RULES = [
  { id: "none", label: "혜택 없음", type: "none" },
  { id: "hana_mgs_simple_pay_10p", label: "하나 MG+S · 간편결제 10%", type: "card_benefit" },
  { id: "hana_mgs_subscription_50p", label: "하나 MG+S · 구독 50%", type: "card_benefit" },
  { id: "shinhan_lady_lunch_5p", label: "신한 레이디 · 점심 5%", type: "card_benefit" },
  { id: "shinhan_lady_medical_5p", label: "신한 레이디 · 병원/약국 5%", type: "card_benefit" },
  { id: "shinhan_lady_shopping_3p", label: "신한 레이디 · 쇼핑 3%", type: "card_benefit" },
] as const;

const SLACK_STATIC_SELECT_OPTION_LIMIT = 100;

type ExpenseAccountType = "expenses";
type IncomeAccountType = "income";
type CapitalAccountType = "capital";
type PaymentAccountType = "assets" | "liabilities";
type AssetAccountType = "assets";
type LiabilityAccountType = "liabilities";
type BalanceAdjustmentTargetAccountType = AssetAccountType | LiabilityAccountType;
type BalanceAdjustmentDirection = "increase" | "decrease";
type LedgerAccountType = ExpenseAccountType | IncomeAccountType | CapitalAccountType | PaymentAccountType;

export interface SlackLedgerAccountOption {
  accountType: LedgerAccountType;
  accountId: string;
  title: string;
}

export interface ExpenseModalOptions {
  expenseCategories: SlackLedgerAccountOption[];
  paymentAccounts: SlackLedgerAccountOption[];
}

export interface IncomeModalOptions {
  incomeCategories: SlackLedgerAccountOption[];
  depositAccounts: SlackLedgerAccountOption[];
}

export interface TransferModalOptions {
  assetAccounts: SlackLedgerAccountOption[];
}

export interface CardPaymentModalOptions {
  assetAccounts: SlackLedgerAccountOption[];
  liabilityAccounts: SlackLedgerAccountOption[];
}

export interface BalanceAdjustmentModalOptions {
  assetAccounts: SlackLedgerAccountOption[];
  liabilityAccounts: SlackLedgerAccountOption[];
  capitalAccounts: SlackLedgerAccountOption[];
}

export type LedgerEntryModalOptions =
  & ExpenseModalOptions
  & IncomeModalOptions
  & TransferModalOptions
  & CardPaymentModalOptions
  & BalanceAdjustmentModalOptions;

export interface ExpenseModalSubmission {
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

export interface IncomeModalSubmission {
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

export interface TransferModalSubmission {
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

export interface CardPaymentModalSubmission {
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

export interface BalanceAdjustmentModalSubmission {
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

export type ExpenseLocalSyncStatus = "synced" | "pending";
export type IncomeLocalSyncStatus = "synced" | "pending";
export type LedgerLocalSyncStatus = "synced" | "pending";
export type ExpenseBenefitTrackingStatus = "stored" | "failed" | "skipped";

export class ExpensePostingValidationError extends Error {
  public readonly blockId: string;

  constructor(blockId: string, message: string) {
    super(message);
    this.name = "ExpensePostingValidationError";
    this.blockId = blockId;
  }
}

export class IncomePostingValidationError extends Error {
  public readonly blockId: string;

  constructor(blockId: string, message: string) {
    super(message);
    this.name = "IncomePostingValidationError";
    this.blockId = blockId;
  }
}

export class LedgerPostingValidationError extends Error {
  public readonly blockId: string;

  constructor(blockId: string, message: string) {
    super(message);
    this.name = "LedgerPostingValidationError";
    this.blockId = blockId;
  }
}

interface SlackViewStateValue {
  value?: string | null;
  selected_date?: string | null;
  selected_option?: {
    value?: string | null;
    text?: {
      text?: string | null;
    } | null;
  } | null;
}

interface SlackViewSubmissionPayload {
  type?: string;
  view?: {
    callback_id?: string;
    state?: {
      values?: Record<string, Record<string, SlackViewStateValue>>;
    };
  };
}

function ledgerEntryTypeLabel(type: LedgerEntryType) {
  switch (type) {
    case "expense":
      return "지출";
    case "income":
      return "수입";
    case "transfer":
      return "이체";
    case "card_payment":
      return "카드상환";
    case "balance_adjustment":
      return "잔고조정";
  }
}

function todayIsoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function plainText(text: string) {
  return {
    type: "plain_text",
    text,
    emoji: true,
  };
}

function markdownText(text: string) {
  return {
    type: "mrkdwn",
    text,
  };
}

function option(text: string, value: string) {
  return {
    text: plainText(text),
    value,
  };
}

function ledgerEntryTypeOptions() {
  return [
    option(ledgerEntryTypeLabel("expense"), "expense"),
    option(ledgerEntryTypeLabel("income"), "income"),
    option(ledgerEntryTypeLabel("transfer"), "transfer"),
    option(ledgerEntryTypeLabel("card_payment"), "card_payment"),
    option(ledgerEntryTypeLabel("balance_adjustment"), "balance_adjustment"),
  ];
}

function accountOptionValue(accountType: LedgerAccountType, accountId: string) {
  return `${accountType}:${accountId}`;
}

export function parseAccountOptionValue(value: string | null | undefined) {
  if (!value) return { accountType: "", accountId: "" };

  const [accountType, accountId, ...rest] = value.split(":");
  if (rest.length > 0 || !accountId) return { accountType: "", accountId: "" };
  if (
    accountType !== "expenses"
    && accountType !== "income"
    && accountType !== "capital"
    && accountType !== "assets"
    && accountType !== "liabilities"
  ) {
    return { accountType: "", accountId: "" };
  }

  return { accountType, accountId };
}

function accountOptions(accounts: SlackLedgerAccountOption[], fallbackText: string, fallbackValue: string) {
  if (accounts.length === 0) {
    return [option(fallbackText, fallbackValue)];
  }

  // TODO: Switch to external_select if the account list grows beyond Slack's static_select option limit.
  return accounts.slice(0, SLACK_STATIC_SELECT_OPTION_LIMIT).map((account) => (
    option(account.title, accountOptionValue(account.accountType, account.accountId))
  ));
}

function inputBlock(label: string, blockId: string, element: object, optional = false) {
  return {
    type: "input",
    block_id: blockId,
    label: plainText(label),
    optional,
    element,
  };
}

function stateValue(
  values: Record<string, Record<string, SlackViewStateValue>>,
  blockId: string,
  actionId: string,
) {
  return values[blockId]?.[actionId];
}

function selectedOptionText(value: SlackViewStateValue | undefined) {
  return value?.selected_option?.text?.text ?? "";
}

function parseApprovalAmount(value: string) {
  if (!/^[1-9]\d*$/.test(value.trim())) {
    throw new ExpensePostingValidationError(
      EXPENSE_BLOCK_IDS.approvalAmount,
      "승인금액은 0보다 큰 정수여야 합니다.",
    );
  }

  return Number(value);
}

function parseIncomeAmount(value: string) {
  if (!/^[1-9]\d*$/.test(value.trim())) {
    throw new IncomePostingValidationError(
      INCOME_BLOCK_IDS.amount,
      "수입금액은 0보다 큰 정수여야 합니다.",
    );
  }

  return Number(value);
}

function parseLedgerAmount(value: string, blockId: string, label: string) {
  if (!/^[1-9]\d*$/.test(value.trim())) {
    throw new LedgerPostingValidationError(blockId, `${label}은 0보다 큰 정수여야 합니다.`);
  }

  return Number(value);
}

function discountRuleById(discountRuleId: string) {
  const rule = DISCOUNT_RULES.find((item) => item.id === discountRuleId);
  if (!rule) {
    throw new ExpensePostingValidationError(
      EXPENSE_BLOCK_IDS.discountRuleId,
      "알 수 없는 카드 혜택입니다.",
    );
  }

  return rule;
}

function discountAmountFor(approvalAmount: number, rule: typeof DISCOUNT_RULES[number]) {
  if (rule.type === "none") return 0;
  return 0;
}

function won(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function resultField(label: string, value: string) {
  return markdownText(`*${label}*\n${value}`);
}

function dateToWhooingEntryDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ExpensePostingValidationError(
      EXPENSE_BLOCK_IDS.occurredDate,
      "거래일은 YYYY-MM-DD 형식이어야 합니다.",
    );
  }

  return value.replaceAll("-", "");
}

function incomeDateToWhooingEntryDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new IncomePostingValidationError(
      INCOME_BLOCK_IDS.occurredDate,
      "거래일은 YYYY-MM-DD 형식이어야 합니다.",
    );
  }

  return value.replaceAll("-", "");
}

function ledgerDateToWhooingEntryDate(value: string, blockId: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new LedgerPostingValidationError(blockId, "거래일은 YYYY-MM-DD 형식이어야 합니다.");
  }

  return value.replaceAll("-", "");
}

function requireText(value: string, blockId: string, message: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new LedgerPostingValidationError(blockId, message);
  }

  return trimmed;
}

function requireAccountId(value: string, blockId: string, message: string) {
  if (!value || value === "missing") {
    throw new LedgerPostingValidationError(blockId, message);
  }
}

function mergedMemo(userMemo: string, approvalAmount: number, ruleLabel: string, discountAmount: number) {
  const parts = [
    userMemo.trim(),
    `승인금액 ${won(approvalAmount)}`,
    discountAmount > 0 ? `카드혜택 ${ruleLabel}` : "",
    discountAmount > 0 ? `할인액 ${won(discountAmount)}` : "",
  ].filter(Boolean);

  return parts.join(" / ");
}

function mergedCardBenefitMemo(
  submission: Pick<ExpenseModalSubmission, "userMemo">,
  evaluation: CardBenefitEvaluationResult,
  ruleLabel: string,
) {
  const parts = [
    submission.userMemo.trim(),
    `승인금액 ${won(evaluation.approvalAmount)}`,
    `카드혜택 ${ruleLabel}`,
    "사용자 선택 기준",
    `이론할인액 ${won(evaluation.eligibleDiscountAmount)}`,
    `적용할인액 ${won(evaluation.appliedDiscountAmount)}`,
    `후잉등록금액 ${won(evaluation.postingAmount)}`,
    evaluation.reason === "automatic_cap_unavailable" ? "카드혜택 미적용: 전월 실적 추정 부족" : "",
  ].filter(Boolean);

  return parts.join(" / ");
}

export function calculateExpensePosting(
  submission: Pick<ExpenseModalSubmission, "approvalAmount" | "discountRuleId" | "userMemo">,
): ExpensePostingCalculation {
  const approvalAmount = parseApprovalAmount(submission.approvalAmount);
  const rule = discountRuleById(submission.discountRuleId);
  const discountAmount = discountAmountFor(approvalAmount, rule);
  const postingAmount = approvalAmount - discountAmount;

  if (postingAmount <= 0) {
    throw new ExpensePostingValidationError(
      EXPENSE_BLOCK_IDS.approvalAmount,
      "카드 혜택 적용 후 등록 금액은 0보다 커야 합니다.",
    );
  }

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
  submission: Pick<ExpenseModalSubmission, "userMemo">,
  evaluation: CardBenefitEvaluationResult,
  ruleLabel: string,
): ExpensePostingCalculation {
  if (evaluation.reason === "automatic_cap_unavailable") {
    throw new ExpensePostingValidationError(
      EXPENSE_BLOCK_IDS.discountRuleId,
      "전월 실적 추정이 부족해 이 카드혜택 한도를 자동 산정할 수 없습니다.",
    );
  }
  if (!Number.isInteger(evaluation.postingAmount) || evaluation.postingAmount <= 0) {
    throw new ExpensePostingValidationError(
      EXPENSE_BLOCK_IDS.approvalAmount,
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
  submission: ExpenseModalSubmission;
  calculation: ExpensePostingCalculation;
}): WhooingEntryPayload {
  if (!sectionId) {
    throw new ExpensePostingValidationError(EXPENSE_BLOCK_IDS.categoryAccountId, "후잉 섹션 설정이 없습니다.");
  }
  if (submission.categoryAccountType !== "expenses") {
    throw new ExpensePostingValidationError(EXPENSE_BLOCK_IDS.categoryAccountId, "지출 카테고리 계정 타입이 올바르지 않습니다.");
  }
  if (!submission.categoryAccountId) {
    throw new ExpensePostingValidationError(EXPENSE_BLOCK_IDS.categoryAccountId, "지출 카테고리를 선택해야 합니다.");
  }
  if (submission.paymentAccountType !== "assets" && submission.paymentAccountType !== "liabilities") {
    throw new ExpensePostingValidationError(EXPENSE_BLOCK_IDS.paymentAccountId, "결제수단 계정 타입이 올바르지 않습니다.");
  }
  if (!submission.paymentAccountId) {
    throw new ExpensePostingValidationError(EXPENSE_BLOCK_IDS.paymentAccountId, "결제수단을 선택해야 합니다.");
  }
  if (!submission.merchant.trim()) {
    throw new ExpensePostingValidationError(EXPENSE_BLOCK_IDS.merchant, "내용/가맹점을 입력해야 합니다.");
  }
  if (!Number.isInteger(calculation.postingAmount) || calculation.postingAmount <= 0) {
    throw new ExpensePostingValidationError(EXPENSE_BLOCK_IDS.approvalAmount, "후잉 등록 금액은 0보다 큰 정수여야 합니다.");
  }

  return {
    section_id: sectionId,
    entry_date: dateToWhooingEntryDate(submission.occurredDate),
    l_account: "expenses",
    l_account_id: submission.categoryAccountId,
    r_account: submission.paymentAccountType,
    r_account_id: submission.paymentAccountId,
    item: submission.merchant.trim(),
    money: calculation.postingAmount,
    memo: calculation.mergedMemo,
  };
}

export function buildWhooingIncomeEntryPayload({
  sectionId,
  submission,
}: {
  sectionId: string | undefined;
  submission: IncomeModalSubmission;
}): WhooingEntryPayload {
  if (!sectionId) {
    throw new IncomePostingValidationError(INCOME_BLOCK_IDS.incomeAccountId, "후잉 섹션 설정이 없습니다.");
  }

  const amount = parseIncomeAmount(submission.amount);
  if (submission.depositAccountType !== "assets" && submission.depositAccountType !== "liabilities") {
    throw new IncomePostingValidationError(INCOME_BLOCK_IDS.depositAccountId, "입금 계정 타입이 올바르지 않습니다.");
  }
  if (!submission.depositAccountId) {
    throw new IncomePostingValidationError(INCOME_BLOCK_IDS.depositAccountId, "입금 계정을 선택해야 합니다.");
  }
  if (submission.incomeAccountType !== "income") {
    throw new IncomePostingValidationError(INCOME_BLOCK_IDS.incomeAccountId, "수입 카테고리 계정 타입이 올바르지 않습니다.");
  }
  if (!submission.incomeAccountId) {
    throw new IncomePostingValidationError(INCOME_BLOCK_IDS.incomeAccountId, "수입 카테고리를 선택해야 합니다.");
  }
  if (!submission.source.trim()) {
    throw new IncomePostingValidationError(INCOME_BLOCK_IDS.source, "내용/출처를 입력해야 합니다.");
  }

  return {
    section_id: sectionId,
    entry_date: incomeDateToWhooingEntryDate(submission.occurredDate),
    l_account: submission.depositAccountType,
    l_account_id: submission.depositAccountId,
    r_account: "income",
    r_account_id: submission.incomeAccountId,
    item: submission.source.trim(),
    money: amount,
    memo: submission.userMemo.trim(),
  };
}

export function buildWhooingTransferEntryPayload({
  sectionId,
  submission,
}: {
  sectionId: string | undefined;
  submission: TransferModalSubmission;
}): WhooingEntryPayload {
  if (!sectionId) {
    throw new LedgerPostingValidationError(TRANSFER_BLOCK_IDS.fromAccountId, "후잉 섹션 설정이 없습니다.");
  }

  const amount = parseLedgerAmount(submission.amount, TRANSFER_BLOCK_IDS.amount, "이체금액");
  if (submission.fromAccountType !== "assets") {
    throw new LedgerPostingValidationError(TRANSFER_BLOCK_IDS.fromAccountId, "출금 계정 타입이 올바르지 않습니다.");
  }
  requireAccountId(submission.fromAccountId, TRANSFER_BLOCK_IDS.fromAccountId, "출금 계정을 선택해야 합니다.");
  if (submission.toAccountType !== "assets") {
    throw new LedgerPostingValidationError(TRANSFER_BLOCK_IDS.toAccountId, "입금 계정 타입이 올바르지 않습니다.");
  }
  requireAccountId(submission.toAccountId, TRANSFER_BLOCK_IDS.toAccountId, "입금 계정을 선택해야 합니다.");
  if (submission.fromAccountId === submission.toAccountId) {
    throw new LedgerPostingValidationError(TRANSFER_BLOCK_IDS.toAccountId, "출금 계정과 입금 계정은 달라야 합니다.");
  }

  return {
    section_id: sectionId,
    entry_date: ledgerDateToWhooingEntryDate(submission.occurredDate, TRANSFER_BLOCK_IDS.occurredDate),
    l_account: "assets",
    l_account_id: submission.toAccountId,
    r_account: "assets",
    r_account_id: submission.fromAccountId,
    item: requireText(submission.item, TRANSFER_BLOCK_IDS.item, "내용을 입력해야 합니다."),
    money: amount,
    memo: submission.userMemo.trim(),
  };
}

export function buildWhooingCardPaymentEntryPayload({
  sectionId,
  submission,
}: {
  sectionId: string | undefined;
  submission: CardPaymentModalSubmission;
}): WhooingEntryPayload {
  if (!sectionId) {
    throw new LedgerPostingValidationError(CARD_PAYMENT_BLOCK_IDS.liabilityAccountId, "후잉 섹션 설정이 없습니다.");
  }

  const amount = parseLedgerAmount(submission.amount, CARD_PAYMENT_BLOCK_IDS.amount, "상환금액");
  if (submission.liabilityAccountType !== "liabilities") {
    throw new LedgerPostingValidationError(CARD_PAYMENT_BLOCK_IDS.liabilityAccountId, "카드/부채 계정 타입이 올바르지 않습니다.");
  }
  requireAccountId(submission.liabilityAccountId, CARD_PAYMENT_BLOCK_IDS.liabilityAccountId, "카드/부채 계정을 선택해야 합니다.");
  if (submission.assetAccountType !== "assets") {
    throw new LedgerPostingValidationError(CARD_PAYMENT_BLOCK_IDS.assetAccountId, "출금 계정 타입이 올바르지 않습니다.");
  }
  requireAccountId(submission.assetAccountId, CARD_PAYMENT_BLOCK_IDS.assetAccountId, "출금 계정을 선택해야 합니다.");

  return {
    section_id: sectionId,
    entry_date: ledgerDateToWhooingEntryDate(submission.occurredDate, CARD_PAYMENT_BLOCK_IDS.occurredDate),
    l_account: "liabilities",
    l_account_id: submission.liabilityAccountId,
    r_account: "assets",
    r_account_id: submission.assetAccountId,
    item: requireText(submission.item, CARD_PAYMENT_BLOCK_IDS.item, "내용을 입력해야 합니다."),
    money: amount,
    memo: submission.userMemo.trim(),
  };
}

function adjustmentMemo(submission: BalanceAdjustmentModalSubmission) {
  return [
    "잔고조정",
    `사유: ${submission.reason.trim()}`,
    `방향: ${submission.direction === "increase" ? "증가" : "감소"}`,
    submission.userMemo.trim(),
  ].filter(Boolean).join(" / ");
}

export function buildWhooingBalanceAdjustmentEntryPayload({
  sectionId,
  submission,
}: {
  sectionId: string | undefined;
  submission: BalanceAdjustmentModalSubmission;
}): WhooingEntryPayload {
  if (!sectionId) {
    throw new LedgerPostingValidationError(BALANCE_ADJUSTMENT_BLOCK_IDS.capitalAccountId, "후잉 섹션 설정이 없습니다.");
  }

  const amount = parseLedgerAmount(submission.amount, BALANCE_ADJUSTMENT_BLOCK_IDS.amount, "조정금액");
  const reason = requireText(submission.reason, BALANCE_ADJUSTMENT_BLOCK_IDS.reason, "조정 사유를 입력해야 합니다.");
  if (submission.targetAccountType !== "assets" && submission.targetAccountType !== "liabilities") {
    throw new LedgerPostingValidationError(BALANCE_ADJUSTMENT_BLOCK_IDS.targetAccountType, "조정 대상 타입을 선택해야 합니다.");
  }
  if (submission.targetAccountIdType !== submission.targetAccountType) {
    throw new LedgerPostingValidationError(BALANCE_ADJUSTMENT_BLOCK_IDS.targetAccountId, "조정 대상 계정 타입이 선택한 타입과 다릅니다.");
  }
  requireAccountId(submission.targetAccountId, BALANCE_ADJUSTMENT_BLOCK_IDS.targetAccountId, "조정 대상 계정을 선택해야 합니다.");
  if (submission.direction !== "increase" && submission.direction !== "decrease") {
    throw new LedgerPostingValidationError(BALANCE_ADJUSTMENT_BLOCK_IDS.direction, "조정 방향을 선택해야 합니다.");
  }
  if (submission.capitalAccountType !== "capital") {
    throw new LedgerPostingValidationError(BALANCE_ADJUSTMENT_BLOCK_IDS.capitalAccountId, "조정 상대 capital 계정 타입이 올바르지 않습니다.");
  }
  requireAccountId(submission.capitalAccountId, BALANCE_ADJUSTMENT_BLOCK_IDS.capitalAccountId, "조정 상대 capital 계정을 선택해야 합니다.");

  const base = {
    section_id: sectionId,
    entry_date: ledgerDateToWhooingEntryDate(submission.occurredDate, BALANCE_ADJUSTMENT_BLOCK_IDS.occurredDate),
    item: "잔고조정",
    money: amount,
    memo: adjustmentMemo({ ...submission, reason }),
  };

  if (submission.targetAccountType === "assets" && submission.direction === "increase") {
    return {
      ...base,
      l_account: "assets",
      l_account_id: submission.targetAccountId,
      r_account: "capital",
      r_account_id: submission.capitalAccountId,
    };
  }
  if (submission.targetAccountType === "assets" && submission.direction === "decrease") {
    return {
      ...base,
      l_account: "capital",
      l_account_id: submission.capitalAccountId,
      r_account: "assets",
      r_account_id: submission.targetAccountId,
    };
  }
  if (submission.targetAccountType === "liabilities" && submission.direction === "increase") {
    return {
      ...base,
      l_account: "capital",
      l_account_id: submission.capitalAccountId,
      r_account: "liabilities",
      r_account_id: submission.targetAccountId,
    };
  }

  return {
    ...base,
    l_account: "liabilities",
    l_account_id: submission.targetAccountId,
    r_account: "capital",
    r_account_id: submission.capitalAccountId,
  };
}

export function buildExpenseLedgerModal(options: ExpenseModalOptions) {
  return {
    type: "modal",
    callback_id: EXPENSE_LEDGER_CALLBACK_ID,
    title: plainText("지출 입력"),
    submit: plainText("등록"),
    close: plainText("취소"),
    blocks: [
      inputBlock("승인금액", EXPENSE_BLOCK_IDS.approvalAmount, {
        type: "number_input",
        action_id: EXPENSE_ACTION_IDS.approvalAmount,
        is_decimal_allowed: false,
        placeholder: plainText("예: 7700"),
      }),
      inputBlock("거래일", EXPENSE_BLOCK_IDS.occurredDate, {
        type: "datepicker",
        action_id: EXPENSE_ACTION_IDS.occurredDate,
        initial_date: todayIsoDate(),
        placeholder: plainText("거래일 선택"),
      }),
      inputBlock("내용/가맹점", EXPENSE_BLOCK_IDS.merchant, {
        type: "plain_text_input",
        action_id: EXPENSE_ACTION_IDS.merchant,
        placeholder: plainText("예: 스타벅스"),
      }),
      inputBlock("지출 카테고리", EXPENSE_BLOCK_IDS.categoryAccountId, {
        type: "static_select",
        action_id: EXPENSE_ACTION_IDS.categoryAccountId,
        placeholder: plainText("카테고리 선택"),
        options: accountOptions(
          options.expenseCategories,
          "지출 카테고리 없음",
          accountOptionValue("expenses", "missing"),
        ),
      }),
      inputBlock("결제수단", EXPENSE_BLOCK_IDS.paymentAccountId, {
        type: "static_select",
        action_id: EXPENSE_ACTION_IDS.paymentAccountId,
        placeholder: plainText("결제수단 선택"),
        options: accountOptions(
          options.paymentAccounts,
          "결제수단 없음",
          accountOptionValue("assets", "missing"),
        ),
      }),
      inputBlock("카드 혜택", EXPENSE_BLOCK_IDS.discountRuleId, {
        type: "static_select",
        action_id: EXPENSE_ACTION_IDS.discountRuleId,
        initial_option: option(DISCOUNT_RULES[0].label, DISCOUNT_RULES[0].id),
        options: DISCOUNT_RULES.map((rule) => option(rule.label, rule.id)),
      }),
      inputBlock("메모", EXPENSE_BLOCK_IDS.userMemo, {
        type: "plain_text_input",
        action_id: EXPENSE_ACTION_IDS.userMemo,
        multiline: true,
        placeholder: plainText("선택 입력"),
      }, true),
    ],
  };
}

export function buildIncomeLedgerModal(options: IncomeModalOptions) {
  return {
    type: "modal",
    callback_id: INCOME_LEDGER_CALLBACK_ID,
    title: plainText("수입 입력"),
    submit: plainText("등록"),
    close: plainText("취소"),
    blocks: [
      inputBlock("수입금액", INCOME_BLOCK_IDS.amount, {
        type: "number_input",
        action_id: INCOME_ACTION_IDS.amount,
        is_decimal_allowed: false,
        placeholder: plainText("예: 3110000"),
      }),
      inputBlock("거래일", INCOME_BLOCK_IDS.occurredDate, {
        type: "datepicker",
        action_id: INCOME_ACTION_IDS.occurredDate,
        initial_date: todayIsoDate(),
        placeholder: plainText("거래일 선택"),
      }),
      inputBlock("내용/출처", INCOME_BLOCK_IDS.source, {
        type: "plain_text_input",
        action_id: INCOME_ACTION_IDS.source,
        placeholder: plainText("예: 월급"),
      }),
      inputBlock("입금 계정", INCOME_BLOCK_IDS.depositAccountId, {
        type: "static_select",
        action_id: INCOME_ACTION_IDS.depositAccountId,
        placeholder: plainText("입금 계정 선택"),
        options: accountOptions(
          options.depositAccounts,
          "입금 계정 없음",
          accountOptionValue("assets", "missing"),
        ),
      }),
      inputBlock("수입 카테고리", INCOME_BLOCK_IDS.incomeAccountId, {
        type: "static_select",
        action_id: INCOME_ACTION_IDS.incomeAccountId,
        placeholder: plainText("수입 카테고리 선택"),
        options: accountOptions(
          options.incomeCategories,
          "수입 카테고리 없음",
          accountOptionValue("income", "missing"),
        ),
      }),
      inputBlock("메모", INCOME_BLOCK_IDS.userMemo, {
        type: "plain_text_input",
        action_id: INCOME_ACTION_IDS.userMemo,
        multiline: true,
        placeholder: plainText("선택 입력"),
      }, true),
    ],
  };
}

export function buildTransferLedgerModal(options: TransferModalOptions) {
  return {
    type: "modal",
    callback_id: TRANSFER_LEDGER_CALLBACK_ID,
    title: plainText("이체 입력"),
    submit: plainText("등록"),
    close: plainText("취소"),
    blocks: [
      inputBlock("이체금액", TRANSFER_BLOCK_IDS.amount, {
        type: "number_input",
        action_id: TRANSFER_ACTION_IDS.amount,
        is_decimal_allowed: false,
        placeholder: plainText("예: 10000"),
      }),
      inputBlock("거래일", TRANSFER_BLOCK_IDS.occurredDate, {
        type: "datepicker",
        action_id: TRANSFER_ACTION_IDS.occurredDate,
        initial_date: todayIsoDate(),
        placeholder: plainText("거래일 선택"),
      }),
      inputBlock("출금 계정", TRANSFER_BLOCK_IDS.fromAccountId, {
        type: "static_select",
        action_id: TRANSFER_ACTION_IDS.fromAccountId,
        placeholder: plainText("출금 계정 선택"),
        options: accountOptions(options.assetAccounts, "자산 계정 없음", accountOptionValue("assets", "missing")),
      }),
      inputBlock("입금 계정", TRANSFER_BLOCK_IDS.toAccountId, {
        type: "static_select",
        action_id: TRANSFER_ACTION_IDS.toAccountId,
        placeholder: plainText("입금 계정 선택"),
        options: accountOptions(options.assetAccounts, "자산 계정 없음", accountOptionValue("assets", "missing")),
      }),
      inputBlock("내용", TRANSFER_BLOCK_IDS.item, {
        type: "plain_text_input",
        action_id: TRANSFER_ACTION_IDS.item,
        placeholder: plainText("예: 계좌이체"),
      }),
      inputBlock("메모", TRANSFER_BLOCK_IDS.userMemo, {
        type: "plain_text_input",
        action_id: TRANSFER_ACTION_IDS.userMemo,
        multiline: true,
        placeholder: plainText("선택 입력"),
      }, true),
    ],
  };
}

export function buildCardPaymentLedgerModal(options: CardPaymentModalOptions) {
  return {
    type: "modal",
    callback_id: CARD_PAYMENT_LEDGER_CALLBACK_ID,
    title: plainText("카드상환"),
    submit: plainText("등록"),
    close: plainText("취소"),
    blocks: [
      inputBlock("상환금액", CARD_PAYMENT_BLOCK_IDS.amount, {
        type: "number_input",
        action_id: CARD_PAYMENT_ACTION_IDS.amount,
        is_decimal_allowed: false,
        placeholder: plainText("예: 299010"),
      }),
      inputBlock("거래일", CARD_PAYMENT_BLOCK_IDS.occurredDate, {
        type: "datepicker",
        action_id: CARD_PAYMENT_ACTION_IDS.occurredDate,
        initial_date: todayIsoDate(),
        placeholder: plainText("거래일 선택"),
      }),
      inputBlock("카드/부채 계정", CARD_PAYMENT_BLOCK_IDS.liabilityAccountId, {
        type: "static_select",
        action_id: CARD_PAYMENT_ACTION_IDS.liabilityAccountId,
        placeholder: plainText("카드/부채 계정 선택"),
        options: accountOptions(options.liabilityAccounts, "카드/부채 계정 없음", accountOptionValue("liabilities", "missing")),
      }),
      inputBlock("출금 계정", CARD_PAYMENT_BLOCK_IDS.assetAccountId, {
        type: "static_select",
        action_id: CARD_PAYMENT_ACTION_IDS.assetAccountId,
        placeholder: plainText("출금 계정 선택"),
        options: accountOptions(options.assetAccounts, "자산 계정 없음", accountOptionValue("assets", "missing")),
      }),
      inputBlock("내용", CARD_PAYMENT_BLOCK_IDS.item, {
        type: "plain_text_input",
        action_id: CARD_PAYMENT_ACTION_IDS.item,
        placeholder: plainText("예: 카드대금 상환"),
      }),
      inputBlock("메모", CARD_PAYMENT_BLOCK_IDS.userMemo, {
        type: "plain_text_input",
        action_id: CARD_PAYMENT_ACTION_IDS.userMemo,
        multiline: true,
        placeholder: plainText("선택 입력"),
      }, true),
    ],
  };
}

export function buildBalanceAdjustmentLedgerModal(options: BalanceAdjustmentModalOptions) {
  const targetAccounts = [...options.assetAccounts, ...options.liabilityAccounts];

  return {
    type: "modal",
    callback_id: BALANCE_ADJUSTMENT_LEDGER_CALLBACK_ID,
    title: plainText("잔고조정"),
    submit: plainText("등록"),
    close: plainText("취소"),
    blocks: [
      {
        type: "section",
        text: markdownText("잔고조정은 실제 거래가 아니라 회계 조정입니다. 누락 거래를 찾을 수 없을 때만 사용하세요."),
      },
      inputBlock("거래일", BALANCE_ADJUSTMENT_BLOCK_IDS.occurredDate, {
        type: "datepicker",
        action_id: BALANCE_ADJUSTMENT_ACTION_IDS.occurredDate,
        initial_date: todayIsoDate(),
        placeholder: plainText("거래일 선택"),
      }),
      inputBlock("조정 대상 타입", BALANCE_ADJUSTMENT_BLOCK_IDS.targetAccountType, {
        type: "static_select",
        action_id: BALANCE_ADJUSTMENT_ACTION_IDS.targetAccountType,
        placeholder: plainText("대상 타입 선택"),
        options: [
          option("자산", "assets"),
          option("부채", "liabilities"),
        ],
      }),
      inputBlock("조정 대상 계정", BALANCE_ADJUSTMENT_BLOCK_IDS.targetAccountId, {
        type: "static_select",
        action_id: BALANCE_ADJUSTMENT_ACTION_IDS.targetAccountId,
        placeholder: plainText("대상 계정 선택"),
        options: accountOptions(targetAccounts, "조정 대상 계정 없음", accountOptionValue("assets", "missing")),
      }),
      inputBlock("조정 방향", BALANCE_ADJUSTMENT_BLOCK_IDS.direction, {
        type: "static_select",
        action_id: BALANCE_ADJUSTMENT_ACTION_IDS.direction,
        placeholder: plainText("방향 선택"),
        options: [
          option("증가", "increase"),
          option("감소", "decrease"),
        ],
      }),
      inputBlock("조정금액", BALANCE_ADJUSTMENT_BLOCK_IDS.amount, {
        type: "number_input",
        action_id: BALANCE_ADJUSTMENT_ACTION_IDS.amount,
        is_decimal_allowed: false,
        placeholder: plainText("예: 5000"),
      }),
      inputBlock("조정 사유", BALANCE_ADJUSTMENT_BLOCK_IDS.reason, {
        type: "plain_text_input",
        action_id: BALANCE_ADJUSTMENT_ACTION_IDS.reason,
        placeholder: plainText("예: 검산 차이"),
      }),
      inputBlock("조정 상대 capital 계정", BALANCE_ADJUSTMENT_BLOCK_IDS.capitalAccountId, {
        type: "static_select",
        action_id: BALANCE_ADJUSTMENT_ACTION_IDS.capitalAccountId,
        placeholder: plainText("capital 계정 선택"),
        options: accountOptions(options.capitalAccounts, "capital 계정 없음", accountOptionValue("capital", "missing")),
      }),
      inputBlock("메모", BALANCE_ADJUSTMENT_BLOCK_IDS.userMemo, {
        type: "plain_text_input",
        action_id: BALANCE_ADJUSTMENT_ACTION_IDS.userMemo,
        multiline: true,
        placeholder: plainText("선택 입력"),
      }, true),
    ],
  };
}

export function buildLedgerEntryTypeSelectModal() {
  return {
    type: "modal",
    callback_id: LEDGER_ENTRY_TYPE_SELECT_CALLBACK_ID,
    title: plainText("거래 입력"),
    submit: plainText("다음"),
    close: plainText("취소"),
    blocks: [
      inputBlock("거래 유형", LEDGER_ENTRY_TYPE_SELECT_BLOCK_ID, {
        type: "static_select",
        action_id: LEDGER_ENTRY_TYPE_SELECT_ACTION_ID,
        placeholder: plainText("거래 유형 선택"),
        options: ledgerEntryTypeOptions(),
      }),
    ],
  };
}

export function buildUnsupportedLedgerEntryModal(type: LedgerEntryType) {
  return {
    type: "modal",
    callback_id: LEDGER_ENTRY_UNSUPPORTED_CALLBACK_ID,
    title: plainText("준비 중"),
    close: plainText("닫기"),
    blocks: [
      {
        type: "section",
        text: markdownText(`*${ledgerEntryTypeLabel(type)} 입력은 아직 준비 중입니다.*`),
      },
      {
        type: "section",
        text: markdownText("이번 단계에서는 지출과 수입 입력만 지원합니다."),
      },
    ],
  };
}

export function buildLedgerEntryModalForType(type: LedgerEntryType, options: LedgerEntryModalOptions) {
  if (type === "expense") return buildExpenseLedgerModal(options);
  if (type === "income") return buildIncomeLedgerModal(options);
  if (type === "transfer") return buildTransferLedgerModal(options);
  if (type === "card_payment") return buildCardPaymentLedgerModal(options);
  if (type === "balance_adjustment") return buildBalanceAdjustmentLedgerModal(options);
  return buildUnsupportedLedgerEntryModal(type);
}

export function buildExpenseRegistrationSuccessView(
  submission: ExpenseModalSubmission,
  calculation: ExpensePostingCalculation,
  syncStatus: ExpenseLocalSyncStatus,
  benefitTrackingStatus: ExpenseBenefitTrackingStatus = "skipped",
) {
  const synced = syncStatus === "synced";

  return {
    type: "modal",
    title: plainText("등록 완료"),
    close: plainText("닫기"),
    blocks: [
      {
        type: "section",
        text: markdownText(synced
          ? "*후잉 등록 및 대시보드 동기화 완료*"
          : "*후잉 등록 완료*"),
      },
      ...(!synced ? [{
        type: "section",
        text: markdownText("대시보드 반영은 잠시 후 확인하세요."),
      }] : []),
      ...(benefitTrackingStatus === "failed" ? [{
        type: "section",
        text: markdownText("후잉 등록 완료. 카드혜택 추적 저장은 실패했습니다."),
      }] : []),
      {
        type: "section",
        fields: [
          resultField("내용", submission.merchant.trim()),
          resultField("승인금액", won(calculation.approvalAmount)),
          resultField("등록금액", won(calculation.postingAmount)),
          resultField("카드혜택", calculation.discountRuleLabel),
          resultField("할인액", won(calculation.discountAmount)),
          resultField("지출 카테고리", submission.categoryAccountLabel || submission.categoryAccountId),
          resultField("결제수단", submission.paymentAccountLabel || submission.paymentAccountId),
        ],
      },
    ],
  };
}

export function buildExpenseRegistrationFailureView() {
  return {
    type: "modal",
    title: plainText("등록 실패"),
    close: plainText("닫기"),
    blocks: [
      {
        type: "section",
        text: markdownText("*후잉 지출 등록 실패*"),
      },
      {
        type: "section",
        text: markdownText("후잉에 지출을 등록하지 못했습니다. 잠시 후 `/expense`로 다시 시도해 주세요."),
      },
    ],
  };
}

export function buildIncomeRegistrationSuccessView(
  submission: IncomeModalSubmission,
  syncStatus: IncomeLocalSyncStatus,
) {
  const synced = syncStatus === "synced";

  return {
    type: "modal",
    title: plainText("등록 완료"),
    close: plainText("닫기"),
    blocks: [
      {
        type: "section",
        text: markdownText(synced
          ? "*후잉 수입 등록 및 대시보드 동기화 완료*"
          : "*후잉 수입 등록 완료*"),
      },
      ...(!synced ? [{
        type: "section",
        text: markdownText("대시보드 반영은 잠시 후 확인하세요."),
      }] : []),
      {
        type: "section",
        fields: [
          resultField("내용/출처", submission.source.trim()),
          resultField("수입금액", won(Number(submission.amount))),
          resultField("입금 계정", submission.depositAccountLabel || submission.depositAccountId),
          resultField("수입 카테고리", submission.incomeAccountLabel || submission.incomeAccountId),
        ],
      },
    ],
  };
}

export function buildIncomeRegistrationFailureView() {
  return {
    type: "modal",
    title: plainText("등록 실패"),
    close: plainText("닫기"),
    blocks: [
      {
        type: "section",
        text: markdownText("*후잉 수입 등록 실패*"),
      },
      {
        type: "section",
        text: markdownText("후잉에 수입을 등록하지 못했습니다. 잠시 후 `/income`으로 다시 시도해 주세요."),
      },
    ],
  };
}

export function buildLedgerRegistrationSuccessView(
  title: string,
  fields: Array<{ label: string; value: string }>,
  syncStatus: LedgerLocalSyncStatus,
) {
  const synced = syncStatus === "synced";

  return {
    type: "modal",
    title: plainText("등록 완료"),
    close: plainText("닫기"),
    blocks: [
      {
        type: "section",
        text: markdownText(synced
          ? `*후잉 ${title} 등록 및 대시보드 동기화 완료*`
          : `*후잉 ${title} 등록 완료*`),
      },
      ...(!synced ? [{
        type: "section",
        text: markdownText("대시보드 반영은 잠시 후 확인하세요."),
      }] : []),
      {
        type: "section",
        fields: fields.map((field) => resultField(field.label, field.value)),
      },
    ],
  };
}

export function buildLedgerRegistrationFailureView(title: string) {
  return {
    type: "modal",
    title: plainText("등록 실패"),
    close: plainText("닫기"),
    blocks: [
      {
        type: "section",
        text: markdownText(`*후잉 ${title} 등록 실패*`),
      },
      {
        type: "section",
        text: markdownText("후잉에 거래를 등록하지 못했습니다. 잠시 후 `/ledger`로 다시 시도해 주세요."),
      },
    ],
  };
}

export function isExpenseLedgerSubmission(payload: SlackViewSubmissionPayload) {
  return payload.type === "view_submission"
    && payload.view?.callback_id === EXPENSE_LEDGER_CALLBACK_ID;
}

export function isIncomeLedgerSubmission(payload: SlackViewSubmissionPayload) {
  return payload.type === "view_submission"
    && payload.view?.callback_id === INCOME_LEDGER_CALLBACK_ID;
}

export function isTransferLedgerSubmission(payload: SlackViewSubmissionPayload) {
  return payload.type === "view_submission"
    && payload.view?.callback_id === TRANSFER_LEDGER_CALLBACK_ID;
}

export function isCardPaymentLedgerSubmission(payload: SlackViewSubmissionPayload) {
  return payload.type === "view_submission"
    && payload.view?.callback_id === CARD_PAYMENT_LEDGER_CALLBACK_ID;
}

export function isBalanceAdjustmentLedgerSubmission(payload: SlackViewSubmissionPayload) {
  return payload.type === "view_submission"
    && payload.view?.callback_id === BALANCE_ADJUSTMENT_LEDGER_CALLBACK_ID;
}

export function isLedgerEntryTypeSelectionSubmission(payload: SlackViewSubmissionPayload) {
  return payload.type === "view_submission"
    && payload.view?.callback_id === LEDGER_ENTRY_TYPE_SELECT_CALLBACK_ID;
}

export function parseLedgerEntryTypeSelection(payload: SlackViewSubmissionPayload): LedgerEntryType | null {
  const values = payload.view?.state?.values;
  if (!values) return null;

  const selectedType = stateValue(
    values,
    LEDGER_ENTRY_TYPE_SELECT_BLOCK_ID,
    LEDGER_ENTRY_TYPE_SELECT_ACTION_ID,
  )?.selected_option?.value;

  if (
    selectedType === "expense"
    || selectedType === "income"
    || selectedType === "transfer"
    || selectedType === "card_payment"
    || selectedType === "balance_adjustment"
  ) {
    return selectedType;
  }

  return null;
}

export function parseExpenseLedgerSubmission(
  payload: SlackViewSubmissionPayload,
): ExpenseModalSubmission | null {
  const values = payload.view?.state?.values;
  if (!values) return null;

  const categoryValue = stateValue(values, EXPENSE_BLOCK_IDS.categoryAccountId, EXPENSE_ACTION_IDS.categoryAccountId);
  const paymentValue = stateValue(values, EXPENSE_BLOCK_IDS.paymentAccountId, EXPENSE_ACTION_IDS.paymentAccountId);
  const category = parseAccountOptionValue(
    categoryValue?.selected_option?.value,
  );
  const payment = parseAccountOptionValue(
    paymentValue?.selected_option?.value,
  );

  return {
    approvalAmount: stateValue(values, EXPENSE_BLOCK_IDS.approvalAmount, EXPENSE_ACTION_IDS.approvalAmount)?.value ?? "",
    occurredDate: stateValue(values, EXPENSE_BLOCK_IDS.occurredDate, EXPENSE_ACTION_IDS.occurredDate)?.selected_date ?? "",
    merchant: stateValue(values, EXPENSE_BLOCK_IDS.merchant, EXPENSE_ACTION_IDS.merchant)?.value ?? "",
    categoryAccountType: category.accountType === "expenses" ? category.accountType : "",
    categoryAccountId: category.accountId,
    categoryAccountLabel: selectedOptionText(categoryValue),
    paymentAccountType: payment.accountType === "assets" || payment.accountType === "liabilities" ? payment.accountType : "",
    paymentAccountId: payment.accountId,
    paymentAccountLabel: selectedOptionText(paymentValue),
    discountRuleId: stateValue(values, EXPENSE_BLOCK_IDS.discountRuleId, EXPENSE_ACTION_IDS.discountRuleId)?.selected_option?.value ?? "",
    userMemo: stateValue(values, EXPENSE_BLOCK_IDS.userMemo, EXPENSE_ACTION_IDS.userMemo)?.value ?? "",
  };
}

export function parseIncomeLedgerSubmission(
  payload: SlackViewSubmissionPayload,
): IncomeModalSubmission | null {
  const values = payload.view?.state?.values;
  if (!values) return null;

  const depositValue = stateValue(values, INCOME_BLOCK_IDS.depositAccountId, INCOME_ACTION_IDS.depositAccountId);
  const incomeValue = stateValue(values, INCOME_BLOCK_IDS.incomeAccountId, INCOME_ACTION_IDS.incomeAccountId);
  const deposit = parseAccountOptionValue(
    depositValue?.selected_option?.value,
  );
  const income = parseAccountOptionValue(
    incomeValue?.selected_option?.value,
  );

  return {
    amount: stateValue(values, INCOME_BLOCK_IDS.amount, INCOME_ACTION_IDS.amount)?.value ?? "",
    occurredDate: stateValue(values, INCOME_BLOCK_IDS.occurredDate, INCOME_ACTION_IDS.occurredDate)?.selected_date ?? "",
    source: stateValue(values, INCOME_BLOCK_IDS.source, INCOME_ACTION_IDS.source)?.value ?? "",
    depositAccountType: deposit.accountType === "assets" || deposit.accountType === "liabilities" ? deposit.accountType : "",
    depositAccountId: deposit.accountId,
    depositAccountLabel: selectedOptionText(depositValue),
    incomeAccountType: income.accountType === "income" ? income.accountType : "",
    incomeAccountId: income.accountId,
    incomeAccountLabel: selectedOptionText(incomeValue),
    userMemo: stateValue(values, INCOME_BLOCK_IDS.userMemo, INCOME_ACTION_IDS.userMemo)?.value ?? "",
  };
}

export function parseTransferLedgerSubmission(
  payload: SlackViewSubmissionPayload,
): TransferModalSubmission | null {
  const values = payload.view?.state?.values;
  if (!values) return null;

  const fromValue = stateValue(values, TRANSFER_BLOCK_IDS.fromAccountId, TRANSFER_ACTION_IDS.fromAccountId);
  const toValue = stateValue(values, TRANSFER_BLOCK_IDS.toAccountId, TRANSFER_ACTION_IDS.toAccountId);
  const from = parseAccountOptionValue(fromValue?.selected_option?.value);
  const to = parseAccountOptionValue(toValue?.selected_option?.value);

  return {
    amount: stateValue(values, TRANSFER_BLOCK_IDS.amount, TRANSFER_ACTION_IDS.amount)?.value ?? "",
    occurredDate: stateValue(values, TRANSFER_BLOCK_IDS.occurredDate, TRANSFER_ACTION_IDS.occurredDate)?.selected_date ?? "",
    fromAccountType: from.accountType === "assets" ? from.accountType : "",
    fromAccountId: from.accountId,
    fromAccountLabel: selectedOptionText(fromValue),
    toAccountType: to.accountType === "assets" ? to.accountType : "",
    toAccountId: to.accountId,
    toAccountLabel: selectedOptionText(toValue),
    item: stateValue(values, TRANSFER_BLOCK_IDS.item, TRANSFER_ACTION_IDS.item)?.value ?? "",
    userMemo: stateValue(values, TRANSFER_BLOCK_IDS.userMemo, TRANSFER_ACTION_IDS.userMemo)?.value ?? "",
  };
}

export function parseCardPaymentLedgerSubmission(
  payload: SlackViewSubmissionPayload,
): CardPaymentModalSubmission | null {
  const values = payload.view?.state?.values;
  if (!values) return null;

  const liabilityValue = stateValue(values, CARD_PAYMENT_BLOCK_IDS.liabilityAccountId, CARD_PAYMENT_ACTION_IDS.liabilityAccountId);
  const assetValue = stateValue(values, CARD_PAYMENT_BLOCK_IDS.assetAccountId, CARD_PAYMENT_ACTION_IDS.assetAccountId);
  const liability = parseAccountOptionValue(liabilityValue?.selected_option?.value);
  const asset = parseAccountOptionValue(assetValue?.selected_option?.value);

  return {
    amount: stateValue(values, CARD_PAYMENT_BLOCK_IDS.amount, CARD_PAYMENT_ACTION_IDS.amount)?.value ?? "",
    occurredDate: stateValue(values, CARD_PAYMENT_BLOCK_IDS.occurredDate, CARD_PAYMENT_ACTION_IDS.occurredDate)?.selected_date ?? "",
    liabilityAccountType: liability.accountType === "liabilities" ? liability.accountType : "",
    liabilityAccountId: liability.accountId,
    liabilityAccountLabel: selectedOptionText(liabilityValue),
    assetAccountType: asset.accountType === "assets" ? asset.accountType : "",
    assetAccountId: asset.accountId,
    assetAccountLabel: selectedOptionText(assetValue),
    item: stateValue(values, CARD_PAYMENT_BLOCK_IDS.item, CARD_PAYMENT_ACTION_IDS.item)?.value ?? "",
    userMemo: stateValue(values, CARD_PAYMENT_BLOCK_IDS.userMemo, CARD_PAYMENT_ACTION_IDS.userMemo)?.value ?? "",
  };
}

export function parseBalanceAdjustmentLedgerSubmission(
  payload: SlackViewSubmissionPayload,
): BalanceAdjustmentModalSubmission | null {
  const values = payload.view?.state?.values;
  if (!values) return null;

  const targetTypeValue = stateValue(
    values,
    BALANCE_ADJUSTMENT_BLOCK_IDS.targetAccountType,
    BALANCE_ADJUSTMENT_ACTION_IDS.targetAccountType,
  )?.selected_option?.value;
  const directionValue = stateValue(
    values,
    BALANCE_ADJUSTMENT_BLOCK_IDS.direction,
    BALANCE_ADJUSTMENT_ACTION_IDS.direction,
  )?.selected_option?.value;
  const targetValue = stateValue(values, BALANCE_ADJUSTMENT_BLOCK_IDS.targetAccountId, BALANCE_ADJUSTMENT_ACTION_IDS.targetAccountId);
  const capitalValue = stateValue(values, BALANCE_ADJUSTMENT_BLOCK_IDS.capitalAccountId, BALANCE_ADJUSTMENT_ACTION_IDS.capitalAccountId);
  const target = parseAccountOptionValue(targetValue?.selected_option?.value);
  const capital = parseAccountOptionValue(capitalValue?.selected_option?.value);

  return {
    occurredDate: stateValue(values, BALANCE_ADJUSTMENT_BLOCK_IDS.occurredDate, BALANCE_ADJUSTMENT_ACTION_IDS.occurredDate)?.selected_date ?? "",
    targetAccountType: targetTypeValue === "assets" || targetTypeValue === "liabilities" ? targetTypeValue : "",
    targetAccountIdType: target.accountType === "assets" || target.accountType === "liabilities" ? target.accountType : "",
    targetAccountId: target.accountId,
    targetAccountLabel: selectedOptionText(targetValue),
    direction: directionValue === "increase" || directionValue === "decrease" ? directionValue : "",
    amount: stateValue(values, BALANCE_ADJUSTMENT_BLOCK_IDS.amount, BALANCE_ADJUSTMENT_ACTION_IDS.amount)?.value ?? "",
    reason: stateValue(values, BALANCE_ADJUSTMENT_BLOCK_IDS.reason, BALANCE_ADJUSTMENT_ACTION_IDS.reason)?.value ?? "",
    capitalAccountType: capital.accountType === "capital" ? capital.accountType : "",
    capitalAccountId: capital.accountId,
    capitalAccountLabel: selectedOptionText(capitalValue),
    userMemo: stateValue(values, BALANCE_ADJUSTMENT_BLOCK_IDS.userMemo, BALANCE_ADJUSTMENT_ACTION_IDS.userMemo)?.value ?? "",
  };
}
