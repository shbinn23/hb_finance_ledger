import assert from "node:assert/strict";
import test from "node:test";
import { createApprovedImportAccount } from "./import-account-create-service.ts";

const candidate = {
  mappingType: "asset" as const,
  sourceKey: "신한 9단적금",
  count: 2,
  amountTotal: 300000,
  entryTypes: ["transfer"],
  recommendedAccountType: "assets" as const,
  recommendedSectionId: "s1",
  recommendedTitle: "신한 9단적금",
  canCreate: true,
  blockedReason: null,
  openDate: "20260801",
};

function dependencies(overrides: Record<string, unknown> = {}) {
  const calls = { created: 0, synced: 0, mapped: 0, finished: [] as unknown[] };
  return {
    calls,
    value: {
      getCandidate: async () => candidate,
      findExactAccount: async () => null,
      getOperation: async () => null,
      reserveOperation: async () => true,
      createAccount: async () => { calls.created += 1; return "x99"; },
      syncAccounts: async () => { calls.synced += 1; },
      saveMapping: async () => { calls.mapped += 1; },
      finishOperation: async (input: unknown) => { calls.finished.push(input); },
      ...overrides,
    },
  };
}

test("approved clear candidate creates, refreshes, and maps one account", async () => {
  const deps = dependencies();
  const result = await createApprovedImportAccount({
    mappingType: "asset", sourceKey: "신한 9단적금", accountType: "assets",
    title: "신한 9단적금", confirmed: true,
  }, deps.value);
  assert.equal(result.ok, true);
  assert.equal(result.accountId, "x99");
  assert.equal(deps.calls.created, 1);
  assert.equal(deps.calls.synced, 1);
  assert.equal(deps.calls.mapped, 1);
  assert.deepEqual(deps.calls.finished.at(-1), {
    operationKey: result.operationKey, status: "created", whooingAccountId: "x99", errorMessage: null,
  });
});

test("an exact local account is mapped without creating a duplicate", async () => {
  const deps = dependencies({ findExactAccount: async () => ({ accountId: "x7", accountType: "assets" }) });
  const result = await createApprovedImportAccount({
    mappingType: "asset", sourceKey: "신한 9단적금", accountType: "assets",
    title: "신한 9단적금", confirmed: true,
  }, deps.value);
  assert.equal(result.status, "mapped_existing");
  assert.equal(deps.calls.created, 0);
  assert.equal(deps.calls.mapped, 1);
});

test("retry resumes mapping from a previously created Whooing account", async () => {
  const deps = dependencies({
    getOperation: async () => ({ status: "failed", whooingAccountId: "x88" }),
  });
  const result = await createApprovedImportAccount({
    mappingType: "asset", sourceKey: "신한 9단적금", accountType: "assets",
    title: "신한 9단적금", confirmed: true,
  }, deps.value);
  assert.equal(result.accountId, "x88");
  assert.equal(deps.calls.created, 0);
  assert.equal(deps.calls.synced, 1);
});

test("ambiguous or unconfirmed account creation is rejected", async () => {
  const deps = dependencies({ getCandidate: async () => ({ ...candidate, canCreate: false, blockedReason: "카드 계정" }) });
  const result = await createApprovedImportAccount({
    mappingType: "asset", sourceKey: "국민 카드", accountType: "assets",
    title: "국민 카드", confirmed: true,
  }, deps.value);
  assert.equal(result.ok, false);
  assert.equal(deps.calls.created, 0);
});
