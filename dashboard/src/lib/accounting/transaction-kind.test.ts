import assert from "node:assert/strict";
import test from "node:test";
import { classifyTransactionKind } from "./transaction-kind.ts";

const expectedKinds = [
  ["expenses", "liabilities", "card_expense"],
  ["expenses", "assets", "cash_expense"],
  ["assets", "income", "income_received"],
  ["liabilities", "assets", "liability_payment"],
  ["assets", "assets", "asset_transfer"],
  ["assets", "capital", "capital_injection"],
  ["capital", "assets", "capital_withdrawal"],
  ["liabilities", "income", "liability_income_adjustment"],
  ["assets", "liabilities", "debt_financing"],
  ["capital", "liabilities", "capital_liability_adjustment"],
  ["liabilities", "capital", "capital_liability_adjustment"],
  ["expenses", "income", "unknown"],
] as const;

test("classifies Whooing l_account/r_account pairs into accounting transaction kinds", () => {
  for (const [left, right, kind] of expectedKinds) {
    assert.equal(classifyTransactionKind(left, right).kind, kind);
  }
});

test("exposes accounting impacts for profit/loss cash flow and balance analysis", () => {
  const cardExpense = classifyTransactionKind("expenses", "liabilities");
  assert.equal(cardExpense.profitLossImpact, "expense_increase");
  assert.equal(cardExpense.cashFlowImpact, "none");
  assert.equal(cardExpense.liabilityImpact, "increase");

  const liabilityPayment = classifyTransactionKind("liabilities", "assets");
  assert.equal(liabilityPayment.cashFlowImpact, "outflow");
  assert.equal(liabilityPayment.assetImpact, "decrease");
  assert.equal(liabilityPayment.liabilityImpact, "decrease");

  const assetTransfer = classifyTransactionKind("assets", "assets");
  assert.equal(assetTransfer.cashFlowImpact, "internal_transfer");
  assert.equal(assetTransfer.assetImpact, "internal_transfer");
});
