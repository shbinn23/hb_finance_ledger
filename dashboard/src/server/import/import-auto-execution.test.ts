import assert from "node:assert/strict";
import test from "node:test";
import { executeSafeImportAutomation } from "./import-auto-execution.ts";

const rows = [
  { importRowId: 1, status: "auto_creatable", transaction: { entryType: "expense" }, cardBenefitStatus: "not_applicable", cardBenefitCandidate: null },
  { importRowId: 2, status: "possible_update", transaction: { entryType: "expense" }, cardBenefitStatus: "not_applicable", cardBenefitCandidate: null },
  { importRowId: 3, status: "conflict", transaction: { entryType: "expense" }, cardBenefitStatus: "rule_uncertain", cardBenefitCandidate: null },
  { importRowId: 4, status: "duplicate", transaction: { entryType: "expense" }, cardBenefitStatus: "rule_matched", cardBenefitCandidate: { ruleId: "rule-1" } },
];

test("safe automation executes only create and exact benefit candidates", async () => {
  const created: number[][] = [];
  const benefits: Array<{ importRowId: number; ruleId: string }> = [];
  const result = await executeSafeImportAutomation({
    enabled: true,
    rows,
    executeCreates: async (rowIds) => { created.push(rowIds); return { created: 1, failed: 0, results: [{ rowId: 1, operationKey: "create-1", status: "created", syncStatus: "synced" }] }; },
    executeBenefit: async (input) => { benefits.push(input); return { ok: true, status: "created", operationKey: "benefit-4" }; },
  });
  assert.deepEqual(created, [[1]]);
  assert.deepEqual(benefits, [{ importRowId: 4, ruleId: "rule-1" }]);
  assert.equal(result.createdLedgerEntries, 1);
  assert.equal(result.createdBenefitEvents, 1);
  assert.deepEqual(result.completedCreateRowIds, [1]);
  assert.deepEqual(result.completedBenefitRowIds, [4]);
  assert.equal(result.updatedEntries, 0);
  assert.equal(result.blockedDangerousCount, 1);
  assert.equal(result.blockedReviewOnlyCount, 2);
});

test("disabled automation performs no writes", async () => {
  let calls = 0;
  const result = await executeSafeImportAutomation({
    enabled: false,
    rows,
    executeCreates: async () => { calls += 1; return { created: 0, failed: 0, results: [] }; },
    executeBenefit: async () => { calls += 1; return { ok: true, status: "created" }; },
  });
  assert.equal(calls, 0);
  assert.equal(result.executedCount, 0);
});

test("transfer count includes only successfully created transfer rows", async () => {
  const result = await executeSafeImportAutomation({
    enabled: true,
    rows: [
      { importRowId: 10, status: "auto_creatable", transaction: { entryType: "transfer" }, cardBenefitStatus: "not_applicable", cardBenefitCandidate: null },
      { importRowId: 11, status: "auto_creatable", transaction: { entryType: "expense" }, cardBenefitStatus: "not_applicable", cardBenefitCandidate: null },
    ],
    executeCreates: async () => ({
      created: 1,
      failed: 1,
      results: [
        { rowId: 10, operationKey: "transfer-10", status: "failed", syncStatus: "skipped" },
        { rowId: 11, operationKey: "expense-11", status: "created", syncStatus: "synced" },
      ],
    }),
    executeBenefit: async () => ({ ok: true, status: "created" }),
  });

  assert.equal(result.createdLedgerEntries, 1);
  assert.equal(result.createdTransfers, 0);
  assert.deepEqual(result.completedCreateRowIds, [11]);
});

test("refund, cashback, and support coupon rows remain review-only even if misclassified", async () => {
  let creates = 0;
  const result = await executeSafeImportAutomation({
    enabled: true,
    rows: [
      { importRowId: 20, status: "auto_creatable", transaction: { entryType: "income", sourceCategoryName: "환급", sourceSubcategoryName: "캐시백" }, cardBenefitStatus: "not_applicable", cardBenefitCandidate: null },
      { importRowId: 21, status: "auto_creatable", transaction: { entryType: "difference_income", item: "민생지원쿠폰 차액조정" }, cardBenefitStatus: "not_applicable", cardBenefitCandidate: null },
    ],
    executeCreates: async () => { creates += 1; return { created: 0, failed: 0, results: [] }; },
    executeBenefit: async () => ({ ok: true, status: "created" }),
  });

  assert.equal(creates, 0);
  assert.equal(result.safeEligibleCount, 0);
  assert.equal(result.blockedReviewOnlyCount, 2);
});
