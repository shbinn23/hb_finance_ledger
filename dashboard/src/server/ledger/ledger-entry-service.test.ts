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

test("createDashboardLedgerEntry rejects non-expense entry types in the dashboard MVP", async () => {
  const result = await createDashboardLedgerEntry({
    request: validExpense({ type: "income" }),
    sectionId: "s1",
    dependencies: dependencies(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "unsupported_type");
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
  assert.equal(result.syncStatus, "synced");
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
  const result = await createDashboardLedgerEntry({
    request: validExpense(),
    sectionId: "s1",
    dependencies: dependencies({
      syncForDate: async () => {
        throw new Error("sync failed");
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.syncStatus, "pending");
});
