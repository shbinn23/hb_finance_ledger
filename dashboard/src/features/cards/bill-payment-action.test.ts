import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCardBillPaymentEntryMemo,
  buildCardBillPaymentEntryPayload,
  registerCardBillPayment,
} from "./bill-payment-action.ts";

const billRows = [
  {
    accountId: "x45",
    amount: 666_265,
    startUseDate: 20260501,
    endUseDate: 20260531,
    payDate: 10,
  },
];

test("buildCardBillPaymentEntryPayload creates liabilities to assets entry", () => {
  const payload = buildCardBillPaymentEntryPayload({
    sectionId: "s1",
    payDate: "2026-06-10",
    cardAccountId: "x45",
    assetAccountId: "x29",
    amount: 666_265,
    billMonth: "2026-06",
    useStartDate: 20260501,
    useEndDate: 20260531,
  });

  assert.deepEqual(payload, {
    section_id: "s1",
    entry_date: "20260610",
    l_account: "liabilities",
    l_account_id: "x45",
    r_account: "assets",
    r_account_id: "x29",
    item: "카드대금 상환",
    money: 666_265,
    memo: "[CARD_BILL] bill_month=202606; card=x45; use_period=20260501-20260531",
  });
});

test("buildCardBillPaymentEntryMemo records bill metadata without raw secrets", () => {
  assert.equal(
    buildCardBillPaymentEntryMemo({
      billMonth: "2026-06",
      cardAccountId: "x50",
      useStartDate: 20260501,
      useEndDate: 20260531,
    }),
    "[CARD_BILL] bill_month=202606; card=x50; use_period=20260501-20260531",
  );
});

test("registerCardBillPayment rejects duplicate repayment before Whooing write", async () => {
  let created = false;

  const result = await registerCardBillPayment({
    request: {
      billMonth: "2026-06",
      cardAccountId: "x45",
      assetAccountId: "x29",
      amount: 666_265,
      payDate: "2026-06-10",
    },
    sectionId: "s1",
    dependencies: {
      getBillRows: async () => billRows,
      assertAssetAccount: async () => true,
      assertCreditCardAccount: async () => true,
      countDuplicateRepayments: async () => 1,
      createEntry: async () => {
        created = true;
        return {};
      },
      syncForDate: async () => undefined,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "duplicate_repayment");
  assert.equal(created, false);
});

test("registerCardBillPayment creates entry and treats sync as best effort", async () => {
  const calls: string[] = [];

  const result = await registerCardBillPayment({
    request: {
      billMonth: "2026-06",
      cardAccountId: "x45",
      assetAccountId: "x29",
      amount: 666_265,
      payDate: "2026-06-10",
    },
    sectionId: "s1",
    dependencies: {
      getBillRows: async () => billRows,
      assertAssetAccount: async () => true,
      assertCreditCardAccount: async () => true,
      countDuplicateRepayments: async () => 0,
      createEntry: async (payload) => {
        calls.push(`${payload.l_account}->${payload.r_account}:${payload.money}`);
        return { results: { entry_id: 123 } };
      },
      syncForDate: async (date) => {
        calls.push(`sync:${date}`);
        throw new Error("sync timeout");
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.syncStatus, "pending");
  assert.equal(result.entryId, 123);
  assert.deepEqual(calls, ["liabilities->assets:666265", "sync:2026-06-10"]);
});

test("registerCardBillPayment rejects amount mismatch against Bill API", async () => {
  const result = await registerCardBillPayment({
    request: {
      billMonth: "2026-06",
      cardAccountId: "x45",
      assetAccountId: "x29",
      amount: 100,
      payDate: "2026-06-10",
    },
    sectionId: "s1",
    dependencies: {
      getBillRows: async () => billRows,
      assertAssetAccount: async () => true,
      assertCreditCardAccount: async () => true,
      countDuplicateRepayments: async () => 0,
      createEntry: async () => ({}),
      syncForDate: async () => undefined,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "bill_amount_mismatch");
});
