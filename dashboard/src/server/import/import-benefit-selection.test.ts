import assert from "node:assert/strict";
import test from "node:test";
import type { CardBenefitRule } from "../../lib/card-benefits/types.ts";
import type { ImportActionRow } from "./import-action-service.ts";
import {
  executeImportBenefitSelection,
  type ImportBenefitSelectionDependencies,
} from "./import-benefit-selection.ts";

const row: ImportActionRow = {
  id: 91,
  status: "auto_creatable",
  sourceIdentityKey: "a".repeat(64),
  sourceContentHash: "b".repeat(64),
  occurredDate: "2026-09-01",
  entryType: "expense",
  item: "쿠팡",
  memo: "욕실",
  postingAmount: 22725,
  approvalAmount: 25250,
  discountAmount: 2525,
  benefitRuleId: null,
  sourceAccountType: "liabilities",
  sourceAccountId: "x45",
  categoryAccountId: "e1",
  counterpartyAccountType: null,
  counterpartyAccountId: null,
  matchedWhooingEntryId: null,
};

const rule: CardBenefitRule = {
  ruleId: "hana_mgs_simple_pay_10p",
  cardAccountType: "liabilities",
  cardAccountId: "x45",
  name: "하나 MG+S 간편결제 10%",
  status: "active",
  priority: 10,
  paymentChannel: "simple_pay",
  minApprovalAmount: 10000,
  discountType: "rate",
  discountRateBps: 1000,
  monthlyCapTiers: [],
  postingPolicy: "reduce_expense",
};

function dependencies(overrides: Partial<ImportBenefitSelectionDependencies> = {}) {
  const selected: string[] = [];
  const value: ImportBenefitSelectionDependencies = {
    getRow: async () => row,
    getRules: async () => [rule],
    saveSelection: async ({ ruleId }) => { selected.push(ruleId); },
    executeCreates: async () => ({
      created: 1,
      reused: 0,
      failed: 0,
      results: [{ rowId: row.id, status: "created", entryId: 77, syncStatus: "synced", message: "created" }],
    }),
    executeBenefit: async () => ({ ok: true, status: "created", benefitStatus: "created", eventId: "event-1", message: "created" }),
    ...overrides,
  };
  return { value, selected };
}

test("registers the posting ledger then applies a server-validated MG+S rule", async () => {
  const deps = dependencies();
  const result = await executeImportBenefitSelection({
    importRowId: row.id,
    selectedRuleId: rule.ruleId,
    action: "register_and_apply",
  }, deps.value);

  assert.equal(result.ok, true);
  assert.equal(result.ledgerStatus, "created");
  assert.equal(result.benefitStatus, "created");
  assert.deepEqual(deps.selected, [rule.ruleId]);
});

test("rejects a selected rule that is inactive, wrong-card, wrong-rate, or below minimum", async () => {
  for (const invalidRule of [
    { ...rule, status: "disabled" as const },
    { ...rule, cardAccountId: "x99" },
    { ...rule, discountRateBps: 500 },
    { ...rule, minApprovalAmount: 30000 },
  ]) {
    const deps = dependencies({ getRules: async () => [invalidRule] });
    const result = await executeImportBenefitSelection({
      importRowId: row.id,
      selectedRuleId: invalidRule.ruleId,
      action: "register_and_apply",
    }, deps.value);
    assert.equal(result.ok, false);
    assert.equal(result.status, "rejected");
  }
});

test("keeps a successful ledger registration successful when sync or benefit is pending", async () => {
  let benefitCalls = 0;
  const deps = dependencies({
    executeCreates: async () => ({
      created: 1,
      reused: 0,
      failed: 0,
      results: [{ rowId: row.id, status: "created", entryId: 77, syncStatus: "pending", message: "pending" }],
    }),
    executeBenefit: async () => {
      benefitCalls += 1;
      throw new Error("must not run before mirror sync");
    },
  });
  const result = await executeImportBenefitSelection({
    importRowId: row.id,
    selectedRuleId: rule.ruleId,
    action: "register_and_apply",
  }, deps.value);

  assert.equal(result.ok, true);
  assert.equal(result.ledgerStatus, "created");
  assert.equal(result.benefitStatus, "pending");
  assert.equal(benefitCalls, 0);
});

test("benefit-only requires a matched ledger entry and never creates a ledger", async () => {
  let createCalls = 0;
  const missing = dependencies({
    executeCreates: async () => {
      createCalls += 1;
      throw new Error("must not create");
    },
  });
  const rejected = await executeImportBenefitSelection({
    importRowId: row.id,
    selectedRuleId: rule.ruleId,
    action: "benefit_only",
  }, missing.value);
  assert.equal(rejected.ok, false);
  assert.deepEqual(missing.selected, []);

  const existing = dependencies({
    getRow: async () => ({ ...row, status: "duplicate", matchedWhooingEntryId: 88 }),
    executeCreates: async () => {
      createCalls += 1;
      throw new Error("must not create");
    },
  });
  const applied = await executeImportBenefitSelection({
    importRowId: row.id,
    selectedRuleId: rule.ruleId,
    action: "benefit_only",
  }, existing.value);
  assert.equal(applied.ok, true);
  assert.equal(applied.benefitStatus, "created");
  assert.equal(createCalls, 0);
});
