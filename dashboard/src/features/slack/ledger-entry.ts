export const EXPENSE_LEDGER_CALLBACK_ID = "expense_ledger_entry";

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

export const DISCOUNT_RULES = [
  { id: "none", label: "혜택 없음", type: "none" },
  { id: "lunch_5_percent", label: "점심시간 5% 할인", type: "rate", rate: 0.05 },
  { id: "coffee_10_percent", label: "커피 10% 할인", type: "rate", rate: 0.10 },
] as const;

const SLACK_STATIC_SELECT_OPTION_LIMIT = 100;

type ExpenseAccountType = "expenses";
type PaymentAccountType = "assets" | "liabilities";
type LedgerAccountType = ExpenseAccountType | PaymentAccountType;

export interface SlackLedgerAccountOption {
  accountType: LedgerAccountType;
  accountId: string;
  title: string;
}

export interface ExpenseModalOptions {
  expenseCategories: SlackLedgerAccountOption[];
  paymentAccounts: SlackLedgerAccountOption[];
}

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
  l_account: "expenses";
  l_account_id: string;
  r_account: PaymentAccountType;
  r_account_id: string;
  item: string;
  money: number;
  memo: string;
}

export type ExpenseLocalSyncStatus = "synced" | "pending";

export class ExpensePostingValidationError extends Error {
  constructor(
    public readonly blockId: string,
    message: string,
  ) {
    super(message);
    this.name = "ExpensePostingValidationError";
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

function accountOptionValue(accountType: LedgerAccountType, accountId: string) {
  return `${accountType}:${accountId}`;
}

export function parseAccountOptionValue(value: string | null | undefined) {
  if (!value) return { accountType: "", accountId: "" };

  const [accountType, accountId, ...rest] = value.split(":");
  if (rest.length > 0 || !accountId) return { accountType: "", accountId: "" };
  if (accountType !== "expenses" && accountType !== "assets" && accountType !== "liabilities") {
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
  return Math.floor(approvalAmount * rule.rate);
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

function mergedMemo(userMemo: string, approvalAmount: number, ruleLabel: string, discountAmount: number) {
  const parts = [
    userMemo.trim(),
    `승인금액 ${won(approvalAmount)}`,
    discountAmount > 0 ? `카드혜택 ${ruleLabel}` : "",
    discountAmount > 0 ? `할인액 ${won(discountAmount)}` : "",
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

export function buildExpenseRegistrationSuccessView(
  submission: ExpenseModalSubmission,
  calculation: ExpensePostingCalculation,
  syncStatus: ExpenseLocalSyncStatus,
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

export function isExpenseLedgerSubmission(payload: SlackViewSubmissionPayload) {
  return payload.type === "view_submission"
    && payload.view?.callback_id === EXPENSE_LEDGER_CALLBACK_ID;
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
