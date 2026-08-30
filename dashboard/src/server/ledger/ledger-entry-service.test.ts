import assert from "node:assert/strict";
import test from "node:test";
import {
  createDashboardLedgerEntry,
  type DashboardLedgerEntryDependencies,
  type DashboardLedgerEntryRequest,
} from "./ledger-entry-service.ts";

function validExpense(overrides: Partial<DashboardLedgerEntryRequest> = {}): DashboardLedgerEntryRequest {
  return {
    type: "expense",
    occurredDate: "2026-06-10",
    categoryAccountId: "x1",
    paymentAccountType: "assets",
    paymentAccountId: "x3",
    item: "테스트 지출",
    amount: 12000,
    memo: "메모",
    discountRuleId: "none",
    ...overrides,
  };
}

function dependencies(overrides: Partial<DashboardLedgerEntryDependencies> = {}): DashboardLedgerEntryDependencies {
  return {
    assertExpenseCategory: async (accountId) => accountId === "x1",
    assertPaymentAccount: async (accountType, accountId) => (
      (accountType === "assets" && accountId === "x3")
      || (accountType === "liabilities" && accountId === "x45")
    ),
    assertIncomeCategory: async (accountId) => accountId === "i1",
    assertAssetAccount: async (accountId) => accountId === "x3" || accountId === "x4",
    assertLiabilityAccount: async (accountId) => accountId === "x45",
    assertCreditCardAccount: async (accountId) => accountId === "x45",
    assertCapitalAccount: async (accountId) => accountId === "c1",
    getActiveCardBenefitRules: async () => [],
    buildCardBenefitMonthlyContext: async (benefitMonth) => ({
      benefitMonth,
      performanceAmount: 0,
      capUsedByRule: {},
    }),
    createEntry: async () => ({ results: { entry_id: 1426000 } }),
    syncForDate: async () => undefined,
    insertCardBenefitEvent: async () => undefined,
    ...overrides,
  };
}

test("createDashboardLedgerEntry posts an income entry and syncs the entry date", async () => {
  const createdPayloads: unknown[] = [];

  const result = await createDashboardLedgerEntry({
    request: validExpense({
      type: "income",
      incomeAccountId: "i1",
      depositAccountId: "x3",
      item: "캐시백",
      amount: 190000,
    }),
    sectionId: "s1",
    dependencies: dependencies({
      createEntry: async (payload) => {
        createdPayloads.push(payload);
        return { results: { entry_id: 1426002 } };
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(createdPayloads, [{
    section_id: "s1",
    entry_date: "20260610",
    l_account: "assets",
    l_account_id: "x3",
    r_account: "income",
    r_account_id: "i1",
    item: "캐시백",
    money: 190000,
    memo: "메모",
  }]);
});

test("createDashboardLedgerEntry rejects invalid expense amounts", async () => {
  const result = await createDashboardLedgerEntry({
    request: validExpense({ amount: 0 }),
    sectionId: "s1",
    dependencies: dependencies(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_request");
  assert.equal(result.fieldErrors.amount, "금액은 0보다 큰 정수여야 합니다.");
});

test("createDashboardLedgerEntry rejects a category that is not an expense account", async () => {
  const result = await createDashboardLedgerEntry({
    request: validExpense({ categoryAccountId: "x99" }),
    sectionId: "s1",
    dependencies: dependencies(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_account");
  assert.equal(result.fieldErrors.categoryAccountId, "지출 카테고리가 올바르지 않습니다.");
});

test("createDashboardLedgerEntry rejects payment accounts outside assets or liabilities", async () => {
  const result = await createDashboardLedgerEntry({
    request: validExpense({ paymentAccountType: "income", paymentAccountId: "x1" }),
    sectionId: "s1",
    dependencies: dependencies(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_account");
  assert.equal(result.fieldErrors.paymentAccountId, "결제수단은 자산 또는 부채 계정이어야 합니다.");
});

test("createDashboardLedgerEntry posts a Whooing expense entry and syncs the entry date", async () => {
  const createdPayloads: unknown[] = [];
  const syncedDates: string[] = [];

  const result = await createDashboardLedgerEntry({
    request: validExpense(),
    sectionId: "s1",
    dependencies: dependencies({
      createEntry: async (payload) => {
        createdPayloads.push(payload);
        return { results: { entry_id: 1426001 } };
      },
      syncForDate: async (date) => {
        syncedDates.push(date);
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.entryStatus, "created");
  assert.equal(result.syncStatus, "synced");
  assert.equal(result.message, "후잉 지출 등록 및 대시보드 동기화가 완료되었습니다.");
  assert.deepEqual(syncedDates, ["2026-06-10"]);
  assert.deepEqual(createdPayloads, [{
    section_id: "s1",
    entry_date: "20260610",
    l_account: "expenses",
    l_account_id: "x1",
    r_account: "assets",
    r_account_id: "x3",
    item: "테스트 지출",
    money: 12000,
    memo: "메모 / 승인금액 12,000원",
  }]);
});

test("createDashboardLedgerEntry keeps a successful entry when best-effort sync fails", async () => {
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };

  const result = await createDashboardLedgerEntry({
    request: validExpense({ type: "expense", occurredDate: "2026-06-10" }),
    sectionId: "s1",
    dependencies: dependencies({
      syncForDate: async () => {
        throw new Error("sync failed");
      },
    }),
  });

  try {
    assert.equal(result.ok, true);
    assert.equal(result.entryStatus, "created");
    assert.equal(result.syncStatus, "pending");
    assert.equal(result.message, "후잉 원장 등록은 완료됐지만 대시보드 반영은 지연될 수 있습니다.");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0][0], "[ledger-entry] Whooing entry created but local sync is pending");
    assert.deepEqual(warnings[0][1], {
      entryType: "expense",
      occurredDate: "2026-06-10",
      errorName: "Error",
      errorMessage: "sync failed",
      isTimeout: false,
    });
  } finally {
    console.warn = originalWarn;
  }
});

test("createDashboardLedgerEntry posts a transfer entry with the Slack transfer direction", async () => {
  const createdPayloads: unknown[] = [];

  const result = await createDashboardLedgerEntry({
    request: validExpense({
      type: "transfer",
      fromAccountId: "x3",
      toAccountId: "x4",
      item: "계좌이체",
      amount: 10000,
    }),
    sectionId: "s1",
    dependencies: dependencies({
      createEntry: async (payload) => {
        createdPayloads.push(payload);
        return { results: { entry_id: 1426003 } };
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(createdPayloads, [{
    section_id: "s1",
    entry_date: "20260610",
    l_account: "assets",
    l_account_id: "x4",
    r_account: "assets",
    r_account_id: "x3",
    item: "계좌이체",
    money: 10000,
    memo: "메모",
  }]);
});

test("createDashboardLedgerEntry rejects transfer between the same account", async () => {
  const result = await createDashboardLedgerEntry({
    request: validExpense({
      type: "transfer",
      fromAccountId: "x3",
      toAccountId: "x3",
      item: "계좌이체",
    }),
    sectionId: "s1",
    dependencies: dependencies(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_request");
  assert.equal(result.fieldErrors.toAccountId, "출금 계정과 입금 계정은 달라야 합니다.");
});

test("createDashboardLedgerEntry posts a card payment entry", async () => {
  const createdPayloads: unknown[] = [];

  const result = await createDashboardLedgerEntry({
    request: validExpense({
      type: "card_payment",
      cardAccountId: "x45",
      assetAccountId: "x3",
      item: "",
      amount: 299010,
    }),
    sectionId: "s1",
    dependencies: dependencies({
      createEntry: async (payload) => {
        createdPayloads.push(payload);
        return { results: { entry_id: 1426004 } };
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(createdPayloads, [{
    section_id: "s1",
    entry_date: "20260610",
    l_account: "liabilities",
    l_account_id: "x45",
    r_account: "assets",
    r_account_id: "x3",
    item: "카드대금 상환",
    money: 299010,
    memo: "메모",
  }]);
});

test("createDashboardLedgerEntry posts a balance adjustment entry", async () => {
  const createdPayloads: unknown[] = [];

  const result = await createDashboardLedgerEntry({
    request: validExpense({
      type: "balance_adjustment",
      targetAccountType: "assets",
      targetAccountId: "x3",
      adjustmentDirection: "increase",
      capitalAccountId: "c1",
      item: "초기 잔액 보정",
      amount: 50000,
    }),
    sectionId: "s1",
    dependencies: dependencies({
      createEntry: async (payload) => {
        createdPayloads.push(payload);
        return { results: { entry_id: 1426005 } };
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(createdPayloads, [{
    section_id: "s1",
    entry_date: "20260610",
    l_account: "assets",
    l_account_id: "x3",
    r_account: "capital",
    r_account_id: "c1",
    item: "잔고조정",
    money: 50000,
    memo: "잔고조정 / 사유: 초기 잔액 보정 / 방향: 증가 / 메모",
  }]);
});
