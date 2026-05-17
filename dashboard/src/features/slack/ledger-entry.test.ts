import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLedgerEntryTypeSelectModal,
  buildLedgerEntryModalForType,
  buildWhooingBalanceAdjustmentEntryPayload,
  buildWhooingCardPaymentEntryPayload,
  EXPENSE_LEDGER_CALLBACK_ID,
  BALANCE_ADJUSTMENT_BLOCK_IDS,
  BALANCE_ADJUSTMENT_LEDGER_CALLBACK_ID,
  buildIncomeLedgerModal,
  buildWhooingTransferEntryPayload,
  CARD_PAYMENT_BLOCK_IDS,
  CARD_PAYMENT_LEDGER_CALLBACK_ID,
  buildWhooingIncomeEntryPayload,
  INCOME_BLOCK_IDS,
  INCOME_LEDGER_CALLBACK_ID,
  IncomePostingValidationError,
  LedgerPostingValidationError,
  isIncomeLedgerSubmission,
  isLedgerEntryTypeSelectionSubmission,
  LEDGER_ENTRY_TYPE_SELECT_ACTION_ID,
  LEDGER_ENTRY_TYPE_SELECT_BLOCK_ID,
  LEDGER_ENTRY_TYPE_SELECT_CALLBACK_ID,
  TRANSFER_BLOCK_IDS,
  TRANSFER_LEDGER_CALLBACK_ID,
  parseLedgerEntryTypeSelection,
  parseBalanceAdjustmentLedgerSubmission,
  parseCardPaymentLedgerSubmission,
  parseIncomeLedgerSubmission,
  parseTransferLedgerSubmission,
} from "./ledger-entry.ts";

function selected(value: string, label: string) {
  return {
    selected_option: {
      value,
      text: { text: label },
    },
  };
}

function incomePayload(overrides = {}) {
  return {
    type: "view_submission",
    view: {
      callback_id: INCOME_LEDGER_CALLBACK_ID,
      state: {
        values: {
          [INCOME_BLOCK_IDS.amount]: {
            [INCOME_BLOCK_IDS.amount]: { value: "3110000" },
          },
          [INCOME_BLOCK_IDS.occurredDate]: {
            [INCOME_BLOCK_IDS.occurredDate]: { selected_date: "2026-05-17" },
          },
          [INCOME_BLOCK_IDS.source]: {
            [INCOME_BLOCK_IDS.source]: { value: "월급" },
          },
          [INCOME_BLOCK_IDS.depositAccountId]: {
            [INCOME_BLOCK_IDS.depositAccountId]: selected("assets:x3", "국민은행"),
          },
          [INCOME_BLOCK_IDS.incomeAccountId]: {
            [INCOME_BLOCK_IDS.incomeAccountId]: selected("income:x85", "월급"),
          },
          [INCOME_BLOCK_IDS.userMemo]: {
            [INCOME_BLOCK_IDS.userMemo]: { value: "5월 급여" },
          },
          ...overrides,
        },
      },
    },
  };
}

function transferPayload(overrides = {}) {
  return {
    type: "view_submission",
    view: {
      callback_id: TRANSFER_LEDGER_CALLBACK_ID,
      state: {
        values: {
          [TRANSFER_BLOCK_IDS.amount]: {
            [TRANSFER_BLOCK_IDS.amount]: { value: "10000" },
          },
          [TRANSFER_BLOCK_IDS.occurredDate]: {
            [TRANSFER_BLOCK_IDS.occurredDate]: { selected_date: "2026-05-17" },
          },
          [TRANSFER_BLOCK_IDS.fromAccountId]: {
            [TRANSFER_BLOCK_IDS.fromAccountId]: selected("assets:x3", "국민은행"),
          },
          [TRANSFER_BLOCK_IDS.toAccountId]: {
            [TRANSFER_BLOCK_IDS.toAccountId]: selected("assets:x35", "네이버 CMA"),
          },
          [TRANSFER_BLOCK_IDS.item]: {
            [TRANSFER_BLOCK_IDS.item]: { value: "계좌이체" },
          },
          [TRANSFER_BLOCK_IDS.userMemo]: {
            [TRANSFER_BLOCK_IDS.userMemo]: { value: "테스트" },
          },
          ...overrides,
        },
      },
    },
  };
}

function cardPaymentPayload(overrides = {}) {
  return {
    type: "view_submission",
    view: {
      callback_id: CARD_PAYMENT_LEDGER_CALLBACK_ID,
      state: {
        values: {
          [CARD_PAYMENT_BLOCK_IDS.amount]: {
            [CARD_PAYMENT_BLOCK_IDS.amount]: { value: "299010" },
          },
          [CARD_PAYMENT_BLOCK_IDS.occurredDate]: {
            [CARD_PAYMENT_BLOCK_IDS.occurredDate]: { selected_date: "2026-05-17" },
          },
          [CARD_PAYMENT_BLOCK_IDS.liabilityAccountId]: {
            [CARD_PAYMENT_BLOCK_IDS.liabilityAccountId]: selected("liabilities:x45", "하나 MG+S"),
          },
          [CARD_PAYMENT_BLOCK_IDS.assetAccountId]: {
            [CARD_PAYMENT_BLOCK_IDS.assetAccountId]: selected("assets:x3", "국민은행"),
          },
          [CARD_PAYMENT_BLOCK_IDS.item]: {
            [CARD_PAYMENT_BLOCK_IDS.item]: { value: "카드대금 상환" },
          },
          [CARD_PAYMENT_BLOCK_IDS.userMemo]: {
            [CARD_PAYMENT_BLOCK_IDS.userMemo]: { value: "테스트" },
          },
          ...overrides,
        },
      },
    },
  };
}

function balanceAdjustmentPayload(overrides = {}) {
  return {
    type: "view_submission",
    view: {
      callback_id: BALANCE_ADJUSTMENT_LEDGER_CALLBACK_ID,
      state: {
        values: {
          [BALANCE_ADJUSTMENT_BLOCK_IDS.occurredDate]: {
            [BALANCE_ADJUSTMENT_BLOCK_IDS.occurredDate]: { selected_date: "2026-05-17" },
          },
          [BALANCE_ADJUSTMENT_BLOCK_IDS.targetAccountType]: {
            [BALANCE_ADJUSTMENT_BLOCK_IDS.targetAccountType]: selected("assets", "자산"),
          },
          [BALANCE_ADJUSTMENT_BLOCK_IDS.targetAccountId]: {
            [BALANCE_ADJUSTMENT_BLOCK_IDS.targetAccountId]: selected("assets:x3", "국민은행"),
          },
          [BALANCE_ADJUSTMENT_BLOCK_IDS.direction]: {
            [BALANCE_ADJUSTMENT_BLOCK_IDS.direction]: selected("increase", "증가"),
          },
          [BALANCE_ADJUSTMENT_BLOCK_IDS.amount]: {
            [BALANCE_ADJUSTMENT_BLOCK_IDS.amount]: { value: "5000" },
          },
          [BALANCE_ADJUSTMENT_BLOCK_IDS.reason]: {
            [BALANCE_ADJUSTMENT_BLOCK_IDS.reason]: { value: "검산 차이" },
          },
          [BALANCE_ADJUSTMENT_BLOCK_IDS.capitalAccountId]: {
            [BALANCE_ADJUSTMENT_BLOCK_IDS.capitalAccountId]: selected("capital:x1", "기초잔액"),
          },
          [BALANCE_ADJUSTMENT_BLOCK_IDS.userMemo]: {
            [BALANCE_ADJUSTMENT_BLOCK_IDS.userMemo]: { value: "테스트" },
          },
          ...overrides,
        },
      },
    },
  };
}

test("parses income ledger submission from Slack view payload", () => {
  const payload = incomePayload();

  assert.equal(isIncomeLedgerSubmission(payload), true);
  assert.deepEqual(parseIncomeLedgerSubmission(payload), {
    amount: "3110000",
    occurredDate: "2026-05-17",
    source: "월급",
    depositAccountType: "assets",
    depositAccountId: "x3",
    depositAccountLabel: "국민은행",
    incomeAccountType: "income",
    incomeAccountId: "x85",
    incomeAccountLabel: "월급",
    userMemo: "5월 급여",
  });
});

test("builds income ledger modal with required income fields", () => {
  const modal = buildIncomeLedgerModal({
    depositAccounts: [{ accountType: "assets", accountId: "x3", title: "국민은행" }],
    incomeCategories: [{ accountType: "income", accountId: "x85", title: "월급" }],
  });

  assert.equal(modal.callback_id, INCOME_LEDGER_CALLBACK_ID);
  assert.deepEqual(
    modal.blocks.map((block) => block.block_id),
    [
      INCOME_BLOCK_IDS.amount,
      INCOME_BLOCK_IDS.occurredDate,
      INCOME_BLOCK_IDS.source,
      INCOME_BLOCK_IDS.depositAccountId,
      INCOME_BLOCK_IDS.incomeAccountId,
      INCOME_BLOCK_IDS.userMemo,
    ],
  );
});

test("builds ledger entry type select modal", () => {
  const modal = buildLedgerEntryTypeSelectModal();

  assert.equal(modal.callback_id, LEDGER_ENTRY_TYPE_SELECT_CALLBACK_ID);
  assert.equal(modal.submit.text, "다음");
  const block = modal.blocks.find((item) => item.block_id === LEDGER_ENTRY_TYPE_SELECT_BLOCK_ID);
  assert.ok(block);
  assert.equal(block.element.action_id, LEDGER_ENTRY_TYPE_SELECT_ACTION_ID);
  assert.deepEqual(
    block.element.options.map((item) => item.value),
    ["expense", "income", "transfer", "card_payment", "balance_adjustment"],
  );
});

test("parses ledger entry type selection", () => {
  const payload = {
    type: "view_submission",
    view: {
      callback_id: LEDGER_ENTRY_TYPE_SELECT_CALLBACK_ID,
      state: {
        values: {
          [LEDGER_ENTRY_TYPE_SELECT_BLOCK_ID]: {
            [LEDGER_ENTRY_TYPE_SELECT_ACTION_ID]: selected("income", "수입"),
          },
        },
      },
    },
  };

  assert.equal(isLedgerEntryTypeSelectionSubmission(payload), true);
  assert.equal(parseLedgerEntryTypeSelection(payload), "income");
});

test("builds target modal for selected ledger entry type", () => {
  const options = {
    expenseCategories: [{ accountType: "expenses", accountId: "x1", title: "식비" }],
    paymentAccounts: [{ accountType: "assets", accountId: "x3", title: "국민은행" }],
    incomeCategories: [{ accountType: "income", accountId: "x85", title: "월급" }],
    depositAccounts: [{ accountType: "assets", accountId: "x3", title: "국민은행" }],
    assetAccounts: [{ accountType: "assets", accountId: "x3", title: "국민은행" }],
    liabilityAccounts: [{ accountType: "liabilities", accountId: "x45", title: "하나 MG+S" }],
    capitalAccounts: [{ accountType: "capital", accountId: "x1", title: "기초잔액" }],
  } as const;

  assert.equal(buildLedgerEntryModalForType("expense", options).callback_id, EXPENSE_LEDGER_CALLBACK_ID);
  assert.equal(buildLedgerEntryModalForType("income", options).callback_id, INCOME_LEDGER_CALLBACK_ID);
  assert.equal(buildLedgerEntryModalForType("transfer", options).callback_id, TRANSFER_LEDGER_CALLBACK_ID);
  assert.equal(buildLedgerEntryModalForType("card_payment", options).callback_id, CARD_PAYMENT_LEDGER_CALLBACK_ID);
  assert.equal(buildLedgerEntryModalForType("balance_adjustment", options).callback_id, BALANCE_ADJUSTMENT_LEDGER_CALLBACK_ID);
});

test("maps income submission to Whooing income entry payload", () => {
  const submission = parseIncomeLedgerSubmission(incomePayload());
  assert.ok(submission);

  assert.deepEqual(buildWhooingIncomeEntryPayload({ sectionId: "s1", submission }), {
    section_id: "s1",
    entry_date: "20260517",
    l_account: "assets",
    l_account_id: "x3",
    r_account: "income",
    r_account_id: "x85",
    item: "월급",
    money: 3110000,
    memo: "5월 급여",
  });
});

test("rejects income submission with invalid amount", () => {
  const submission = parseIncomeLedgerSubmission(incomePayload({
    [INCOME_BLOCK_IDS.amount]: {
      [INCOME_BLOCK_IDS.amount]: { value: "0" },
    },
  }));
  assert.ok(submission);

  assert.throws(
    () => buildWhooingIncomeEntryPayload({ sectionId: "s1", submission }),
    (error) => error instanceof IncomePostingValidationError
      && error.blockId === INCOME_BLOCK_IDS.amount,
  );
});

test("rejects income submission with non-income category account", () => {
  const submission = parseIncomeLedgerSubmission(incomePayload({
    [INCOME_BLOCK_IDS.incomeAccountId]: {
      [INCOME_BLOCK_IDS.incomeAccountId]: selected("assets:x3", "국민은행"),
    },
  }));
  assert.ok(submission);

  assert.throws(
    () => buildWhooingIncomeEntryPayload({ sectionId: "s1", submission }),
    (error) => error instanceof IncomePostingValidationError
      && error.blockId === INCOME_BLOCK_IDS.incomeAccountId,
  );
});

test("maps transfer submission to assets to assets entry payload", () => {
  const submission = parseTransferLedgerSubmission(transferPayload());
  assert.ok(submission);

  assert.deepEqual(buildWhooingTransferEntryPayload({ sectionId: "s1", submission }), {
    section_id: "s1",
    entry_date: "20260517",
    l_account: "assets",
    l_account_id: "x35",
    r_account: "assets",
    r_account_id: "x3",
    item: "계좌이체",
    money: 10000,
    memo: "테스트",
  });
});

test("rejects transfer with the same asset account", () => {
  const submission = parseTransferLedgerSubmission(transferPayload({
    [TRANSFER_BLOCK_IDS.toAccountId]: {
      [TRANSFER_BLOCK_IDS.toAccountId]: selected("assets:x3", "국민은행"),
    },
  }));
  assert.ok(submission);

  assert.throws(
    () => buildWhooingTransferEntryPayload({ sectionId: "s1", submission }),
    (error) => error instanceof LedgerPostingValidationError
      && error.blockId === TRANSFER_BLOCK_IDS.toAccountId,
  );
});

test("maps card payment submission to liabilities to assets entry payload", () => {
  const submission = parseCardPaymentLedgerSubmission(cardPaymentPayload());
  assert.ok(submission);

  assert.deepEqual(buildWhooingCardPaymentEntryPayload({ sectionId: "s1", submission }), {
    section_id: "s1",
    entry_date: "20260517",
    l_account: "liabilities",
    l_account_id: "x45",
    r_account: "assets",
    r_account_id: "x3",
    item: "카드대금 상환",
    money: 299010,
    memo: "테스트",
  });
});

test("rejects card payment with invalid amount", () => {
  const submission = parseCardPaymentLedgerSubmission(cardPaymentPayload({
    [CARD_PAYMENT_BLOCK_IDS.amount]: {
      [CARD_PAYMENT_BLOCK_IDS.amount]: { value: "0" },
    },
  }));
  assert.ok(submission);

  assert.throws(
    () => buildWhooingCardPaymentEntryPayload({ sectionId: "s1", submission }),
    (error) => error instanceof LedgerPostingValidationError
      && error.blockId === CARD_PAYMENT_BLOCK_IDS.amount,
  );
});

test("maps balance adjustment asset increase and asset decrease payloads", () => {
  const increase = parseBalanceAdjustmentLedgerSubmission(balanceAdjustmentPayload());
  const decrease = parseBalanceAdjustmentLedgerSubmission(balanceAdjustmentPayload({
    [BALANCE_ADJUSTMENT_BLOCK_IDS.direction]: {
      [BALANCE_ADJUSTMENT_BLOCK_IDS.direction]: selected("decrease", "감소"),
    },
  }));
  assert.ok(increase);
  assert.ok(decrease);

  assert.deepEqual(buildWhooingBalanceAdjustmentEntryPayload({ sectionId: "s1", submission: increase }), {
    section_id: "s1",
    entry_date: "20260517",
    l_account: "assets",
    l_account_id: "x3",
    r_account: "capital",
    r_account_id: "x1",
    item: "잔고조정",
    money: 5000,
    memo: "잔고조정 / 사유: 검산 차이 / 방향: 증가 / 테스트",
  });
  assert.deepEqual(buildWhooingBalanceAdjustmentEntryPayload({ sectionId: "s1", submission: decrease }), {
    section_id: "s1",
    entry_date: "20260517",
    l_account: "capital",
    l_account_id: "x1",
    r_account: "assets",
    r_account_id: "x3",
    item: "잔고조정",
    money: 5000,
    memo: "잔고조정 / 사유: 검산 차이 / 방향: 감소 / 테스트",
  });
});

test("maps balance adjustment liability increase and liability decrease payloads", () => {
  const base = {
    [BALANCE_ADJUSTMENT_BLOCK_IDS.targetAccountType]: {
      [BALANCE_ADJUSTMENT_BLOCK_IDS.targetAccountType]: selected("liabilities", "부채"),
    },
    [BALANCE_ADJUSTMENT_BLOCK_IDS.targetAccountId]: {
      [BALANCE_ADJUSTMENT_BLOCK_IDS.targetAccountId]: selected("liabilities:x45", "하나 MG+S"),
    },
  };
  const increase = parseBalanceAdjustmentLedgerSubmission(balanceAdjustmentPayload(base));
  const decrease = parseBalanceAdjustmentLedgerSubmission(balanceAdjustmentPayload({
    ...base,
    [BALANCE_ADJUSTMENT_BLOCK_IDS.direction]: {
      [BALANCE_ADJUSTMENT_BLOCK_IDS.direction]: selected("decrease", "감소"),
    },
  }));
  assert.ok(increase);
  assert.ok(decrease);

  assert.deepEqual(buildWhooingBalanceAdjustmentEntryPayload({ sectionId: "s1", submission: increase }), {
    section_id: "s1",
    entry_date: "20260517",
    l_account: "capital",
    l_account_id: "x1",
    r_account: "liabilities",
    r_account_id: "x45",
    item: "잔고조정",
    money: 5000,
    memo: "잔고조정 / 사유: 검산 차이 / 방향: 증가 / 테스트",
  });
  assert.deepEqual(buildWhooingBalanceAdjustmentEntryPayload({ sectionId: "s1", submission: decrease }), {
    section_id: "s1",
    entry_date: "20260517",
    l_account: "liabilities",
    l_account_id: "x45",
    r_account: "capital",
    r_account_id: "x1",
    item: "잔고조정",
    money: 5000,
    memo: "잔고조정 / 사유: 검산 차이 / 방향: 감소 / 테스트",
  });
});
