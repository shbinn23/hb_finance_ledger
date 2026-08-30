import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const app = resolve(import.meta.dirname, "../../app/api/imports");

test("live import create and update routes are protected by dry-run policy", () => {
  const apply = readFileSync(resolve(app, "actions/register/route.ts"), "utf8");
  const update = readFileSync(resolve(app, "actions/approve-update/route.ts"), "utf8");
  assert.match(apply, /parseImportCreateRequest/);
  assert.match(apply, /importActionOriginIsAllowed/);
  assert.match(apply, /importWritesAreDryRunOnly/);
  assert.match(update, /importWritesAreDryRunOnly/);
  assert.match(update, /parseImportUpdateRequest/);
});

test("legacy bulk apply route is retired so it cannot bypass row approval operations", () => {
  const legacyApply = readFileSync(resolve(app, "pyeonhan/apply/route.ts"), "utf8");
  assert.match(legacyApply, /status: 410/);
  assert.doesNotMatch(legacyApply, /createRuntimeDashboardLedgerEntry|applyAutoCreatableRows/);
});

test("local review route requires explicit confirmation and never calls Whooing", () => {
  const review = readFileSync(resolve(app, "actions/review/route.ts"), "utf8");
  assert.match(review, /parseImportReviewRequest/);
  assert.match(review, /importActionOriginIsAllowed/);
  assert.doesNotMatch(review, /createWhooingEntry|updateWhooingEntry/);
});

test("account creation route only returns a preview and never calls Whooing write", () => {
  const preview = readFileSync(resolve(app, "account-create-preview/route.ts"), "utf8");
  assert.match(preview, /liveCreationAllowed: false/);
  assert.doesNotMatch(preview, /createWhooing|updateWhooing|fetch\(/);
});

test("approved account creation route is origin, policy, schema, and confirmation guarded", () => {
  const createAccount = readFileSync(resolve(app, "actions/create-account/route.ts"), "utf8");
  assert.match(createAccount, /importActionOriginIsAllowed/);
  assert.match(createAccount, /parseImportAccountCreateRequest/);
  assert.match(createAccount, /accountCreateEnabled/);
  assert.match(createAccount, /importAccountCreateSchemaAvailable/);
  assert.match(createAccount, /createRuntimeApprovedImportAccount/);
  assert.match(createAccount, /createdAccounts/);
  assert.match(createAccount, /savedMappings/);
});

test("mapping and benefit mutations share origin, confirmation, and operation safeguards", () => {
  const mapping = readFileSync(resolve(app, "account-mappings/route.ts"), "utf8");
  const benefit = readFileSync(resolve(app, "benefit-events/route.ts"), "utf8");
  assert.match(mapping, /importActionOriginIsAllowed/);
  assert.match(mapping, /getImportSchemaStatus/);
  assert.match(mapping, /reserveImportMappingOperation/);
  assert.match(benefit, /importActionOriginIsAllowed/);
  assert.match(benefit, /parseImportBenefitRequest/);
  assert.match(benefit, /importWritesAreDryRunOnly/);
  assert.match(benefit, /executeRuntimePyeonhanBenefitCandidate/);
});
