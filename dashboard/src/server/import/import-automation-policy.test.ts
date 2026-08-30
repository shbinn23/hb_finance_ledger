import assert from "node:assert/strict";
import test from "node:test";
import { buildImportAccountCandidate, getImportAutomationPolicy } from "./import-automation-policy.ts";

test("safe auto execution requires explicit enabled flags and write mode", () => {
  assert.equal(getImportAutomationPolicy({}).autoExecuteEnabled, false);
  assert.equal(getImportAutomationPolicy({
    GMAIL_IMPORT_DRY_RUN_ONLY: "false",
    GMAIL_IMPORT_AUTO_EXECUTE_ENABLED: "true",
    GMAIL_IMPORT_AUTO_EXECUTE_SAFE_ONLY: "true",
  }).autoExecuteEnabled, true);
  assert.equal(getImportAutomationPolicy({
    GMAIL_IMPORT_DRY_RUN_ONLY: "false",
    GMAIL_IMPORT_AUTO_EXECUTE_ENABLED: "true",
    GMAIL_IMPORT_AUTO_EXECUTE_SAFE_ONLY: "false",
  }).autoExecuteEnabled, false);
});

test("account creation remains approval-gated", () => {
  const policy = getImportAutomationPolicy({
    GMAIL_IMPORT_ACCOUNT_CREATE_ENABLED: "true",
    GMAIL_IMPORT_ACCOUNT_CREATE_REQUIRES_APPROVAL: "false",
  });
  assert.equal(policy.accountCreateEnabled, true);
  assert.equal(policy.accountCreateRequiresApproval, true);
});

test("clear import mapping gaps produce supported account candidates", () => {
  assert.deepEqual(buildImportAccountCandidate({
    mappingType: "asset", sourceKey: "신한 9단적금", count: 2,
    amountTotal: 300000, entryTypes: ["transfer"],
  }, "s123"), {
    mappingType: "asset", sourceKey: "신한 9단적금", count: 2,
    amountTotal: 300000, entryTypes: ["transfer"],
    recommendedAccountType: "assets", recommendedSectionId: "s123",
    recommendedTitle: "신한 9단적금", canCreate: true, blockedReason: null,
  });
  assert.equal(buildImportAccountCandidate({
    mappingType: "expense_category", sourceKey: "교육", count: 1,
    amountTotal: 10000, entryTypes: ["expense"],
  }, "s123").recommendedAccountType, "expenses");
});

test("ambiguous credit card and missing section candidates are blocked", () => {
  const card = buildImportAccountCandidate({
    mappingType: "asset", sourceKey: "국민 새 신용카드", count: 1,
    amountTotal: 10000, entryTypes: ["expense"],
  }, "s123");
  assert.equal(card.canCreate, false);
  assert.match(card.blockedReason ?? "", /카드/);
  assert.equal(buildImportAccountCandidate({
    mappingType: "asset", sourceKey: "현금", count: 1,
    amountTotal: 10000, entryTypes: ["expense"],
  }, "").canCreate, false);
});
