import assert from "node:assert/strict";
import test from "node:test";
import {
  importActionOriginIsAllowed,
  importWritesAreDryRunOnly,
  parseImportCreateRequest,
  parseImportDeleteRequest,
  parseImportBenefitRequest,
  parseImportBenefitSelectionRequest,
  parseImportAccountCreateRequest,
  parseImportMappingRequest,
  parseImportRowActionRequest,
  parseImportReviewRequest,
  parseImportUpdateRequest,
} from "./import-actions.ts";

test("import writes remain dry-run-only unless explicitly disabled", () => {
  assert.equal(importWritesAreDryRunOnly({}), true);
  assert.equal(importWritesAreDryRunOnly({ GMAIL_IMPORT_DRY_RUN_ONLY: "true" }), true);
  assert.equal(importWritesAreDryRunOnly({ GMAIL_IMPORT_DRY_RUN_ONLY: "false" }), false);
});

test("mapping request validates source and target account combinations", () => {
  assert.deepEqual(parseImportMappingRequest({
    mappingType: "asset",
    sourceKey: "새 통장",
    accountType: "assets",
    accountId: "x1",
    confirmed: true,
  }), {
    ok: true,
    value: { mappingType: "asset", sourceKey: "새 통장", accountType: "assets", accountId: "x1" },
  });
  assert.equal(parseImportMappingRequest({
    mappingType: "asset",
    sourceKey: "새 통장",
    accountType: "assets",
    accountId: "x1",
  }).ok, false);
  assert.equal(parseImportMappingRequest({
    mappingType: "expense_category",
    sourceKey: "선택 / 식비",
    accountType: "assets",
    accountId: "x1",
    confirmed: true,
  }).ok, false);
  assert.equal(parseImportMappingRequest({
    mappingType: "asset",
    sourceKey: "",
    accountType: "assets",
    accountId: "x1",
    confirmed: true,
  }).ok, false);
});

test("mapping mutation accepts only absent or same-origin requests", () => {
  assert.equal(importActionOriginIsAllowed({ origin: null, forwardedHost: null, host: "localhost:3000" }), true);
  assert.equal(importActionOriginIsAllowed({
    origin: "http://localhost:3000", forwardedHost: null, host: "localhost:3000",
  }), true);
  assert.equal(importActionOriginIsAllowed({
    origin: "https://attacker.example", forwardedHost: null, host: "localhost:3000",
  }), false);
  assert.equal(importActionOriginIsAllowed({ origin: "not a url", forwardedHost: null, host: "localhost:3000" }), false);
});

test("review actions require a positive persisted import row id", () => {
  assert.deepEqual(parseImportRowActionRequest({ importRowId: 17 }), { ok: true, value: { importRowId: 17 } });
  assert.equal(parseImportRowActionRequest({ importRowId: 0 }).ok, false);
  assert.equal(parseImportRowActionRequest({}).ok, false);
});

test("create approval requires confirmation and unique positive row ids", () => {
  assert.deepEqual(parseImportCreateRequest({ confirmed: true, importRowIds: [7, 9, 7] }), {
    ok: true,
    value: { importRowIds: [7, 9] },
  });
  assert.equal(parseImportCreateRequest({ confirmed: false, importRowIds: [7] }).ok, false);
  assert.equal(parseImportCreateRequest({ confirmed: true, importRowIds: [0] }).ok, false);
  assert.equal(parseImportCreateRequest({ confirmed: true, importRowIds: [] }).ok, false);
});

test("update and review approvals validate their explicit action", () => {
  assert.deepEqual(parseImportUpdateRequest({ confirmed: true, importRowId: 4 }), {
    ok: true,
    value: { importRowId: 4 },
  });
  assert.equal(parseImportUpdateRequest({ importRowId: 4 }).ok, false);
  assert.deepEqual(parseImportReviewRequest({ confirmed: true, importRowIds: [4], action: "skip" }), {
    ok: true,
    value: { importRowIds: [4], action: "skip" },
  });
  assert.equal(parseImportReviewRequest({ confirmed: true, importRowIds: [4], action: "delete" }).ok, false);
});

test("delete approval requires the explicit destructive confirmation phrase", () => {
  assert.deepEqual(parseImportDeleteRequest({
    confirmed: true,
    confirmationText: "원장 거래 삭제",
    importRowId: 4,
  }), { ok: true, value: { importRowId: 4 } });
  assert.equal(parseImportDeleteRequest({ confirmed: true, importRowId: 4 }).ok, false);
  assert.equal(parseImportDeleteRequest({
    confirmed: true,
    confirmationText: "삭제",
    importRowId: 4,
  }).ok, false);
});

test("benefit approval requires confirmation, row id, and rule id", () => {
  assert.deepEqual(parseImportBenefitRequest({ confirmed: true, importRowId: 8, ruleId: "rule-1" }), {
    ok: true,
    value: { importRowId: 8, ruleId: "rule-1" },
  });
  assert.equal(parseImportBenefitRequest({ importRowId: 8, ruleId: "rule-1" }).ok, false);
  assert.equal(parseImportBenefitRequest({ confirmed: true, importRowId: 8, ruleId: "" }).ok, false);
});

test("benefit selection requires an explicit supported action", () => {
  assert.deepEqual(parseImportBenefitSelectionRequest({
    confirmed: true,
    importRowId: 8,
    selectedRuleId: "rule-1",
    action: "register_and_apply",
  }), {
    ok: true,
    value: { importRowId: 8, selectedRuleId: "rule-1", action: "register_and_apply" },
  });
  assert.equal(parseImportBenefitSelectionRequest({
    confirmed: true, importRowId: 8, selectedRuleId: "rule-1", action: "delete",
  }).ok, false);
  assert.equal(parseImportBenefitSelectionRequest({
    importRowId: 8, selectedRuleId: "rule-1", action: "benefit_only",
  }).ok, false);
});

test("account creation requires approval and a compatible mapping type", () => {
  assert.equal(parseImportAccountCreateRequest({
    confirmed: true, mappingType: "asset", sourceKey: "신한 9단적금",
    accountType: "assets", title: "신한 9단적금",
  }).ok, true);
  assert.equal(parseImportAccountCreateRequest({
    mappingType: "asset", sourceKey: "신한 9단적금", accountType: "assets", title: "신한 9단적금",
  }).ok, false);
  assert.equal(parseImportAccountCreateRequest({
    confirmed: true, mappingType: "expense_category", sourceKey: "교육",
    accountType: "assets", title: "교육",
  }).ok, false);
});
