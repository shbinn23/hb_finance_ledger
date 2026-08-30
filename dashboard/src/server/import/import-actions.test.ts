import assert from "node:assert/strict";
import test from "node:test";
import {
  importActionOriginIsAllowed,
  importWritesAreDryRunOnly,
  parseImportMappingRequest,
  parseImportRowActionRequest,
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
