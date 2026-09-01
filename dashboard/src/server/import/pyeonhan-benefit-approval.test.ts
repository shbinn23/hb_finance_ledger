import assert from "node:assert/strict";
import test from "node:test";
import {
  approvePyeonhanBenefitCandidate,
  type BenefitApprovalCandidate,
  type BenefitApprovalDependencies,
} from "./pyeonhan-benefit-approval.ts";

function candidate(overrides: Partial<BenefitApprovalCandidate> = {}): BenefitApprovalCandidate {
  return {
    importRowId: 11,
    benefitStatus: "rule_matched",
    candidateRuleId: "shinhan_lady_lunch_5p",
    sourceIdentityKey: "a".repeat(64),
    occurrenceIndex: 1,
    occurredDate: "2026-08-15",
    item: "아워홈",
    memo: "점심",
    approvalAmount: 7700,
    postingAmount: 7315,
    discountAmount: 385,
    mappedCardAccountType: "liabilities",
    mappedCardAccountId: "x50",
    matchedWhooingEntryId: 1429001,
    mirrorEntry: {
      sectionId: "s1",
      entryId: 1429001,
      entryDate: 20260815,
      leftAccountType: "expenses",
      leftAccountId: "x61",
      rightAccountType: "liabilities",
      rightAccountId: "x50",
      item: "아워홈",
      memo: "점심",
      amount: 7315,
    },
    rule: {
      ruleId: "shinhan_lady_lunch_5p",
      cardAccountType: "liabilities",
      cardAccountId: "x50",
      paymentChannel: null,
      discountRateBps: 500,
      performanceAmountPolicy: "approval_amount",
    },
    existingEventId: null,
    ...overrides,
  };
}

function dependencies(record = candidate()): BenefitApprovalDependencies & { statuses: string[] } {
  const statuses: string[] = [];
  return {
    statuses,
    getCandidate: async () => record,
    createEvent: async (event) => {
      assert.equal(event.approvalAmount, 7700);
      assert.equal(event.performanceAmount, 7700);
      assert.equal(event.postingAmount, 7315);
      assert.equal(event.appliedDiscountAmount, 385);
      assert.equal(event.whooingEntryId, 1429001);
      return "event-created";
    },
    updateBenefitStatus: async ({ status }) => { statuses.push(status); },
  };
}

test("benefit approval creates only a correctly separated event from server-side evidence", async () => {
  const deps = dependencies();
  const result = await approvePyeonhanBenefitCandidate({ importRowId: 11, ruleId: "shinhan_lady_lunch_5p" }, deps);

  assert.deepEqual(result, {
    ok: true,
    status: "created",
    benefitStatus: "created",
    eventId: "event-created",
    message: "카드혜택 event를 생성했습니다. 후잉 원장은 변경하지 않았습니다.",
  });
  assert.deepEqual(deps.statuses, ["approved", "created"]);
});

test("benefit approval rejects missing mirror evidence and card-rule mismatches", async () => {
  const missing = dependencies(candidate({ mirrorEntry: null }));
  const mismatch = dependencies(candidate({ rule: { ...candidate().rule, cardAccountId: "x45" } }));

  assert.equal((await approvePyeonhanBenefitCandidate({ importRowId: 11, ruleId: "shinhan_lady_lunch_5p" }, missing)).status, "rejected");
  assert.equal((await approvePyeonhanBenefitCandidate({ importRowId: 11, ruleId: "shinhan_lady_lunch_5p" }, mismatch)).status, "rejected");
});

test("benefit approval returns event_exists without inserting a duplicate", async () => {
  let inserts = 0;
  const deps = dependencies(candidate({ existingEventId: "event-existing" }));
  deps.createEvent = async () => { inserts += 1; return "unexpected"; };

  const result = await approvePyeonhanBenefitCandidate({ importRowId: 11, ruleId: "shinhan_lady_lunch_5p" }, deps);

  assert.equal(result.status, "event_exists");
  assert.equal(result.eventId, "event-existing");
  assert.equal(inserts, 0);
});

test("benefit approval updates a mismatched event tied to the same entry and rule", async () => {
  const deps = dependencies(candidate({
    existingEventId: "event-existing",
    existingEvent: {
      eventId: "event-existing",
      whooingEntryId: 1429001,
      ruleId: "shinhan_lady_lunch_5p",
      updatedAt: "2026-08-31T00:00:00.000Z",
      approvalAmount: 7700,
      performanceAmount: 7700,
      eligibleDiscountAmount: 385,
      appliedDiscountAmount: 0,
      postingAmount: 7700,
    },
  } as Partial<BenefitApprovalCandidate>));
  const updates: unknown[] = [];
  (deps as BenefitApprovalDependencies & {
    updateEvent: (eventId: string, event: unknown) => Promise<boolean>;
  }).updateEvent = async (eventId, event) => {
    updates.push({ eventId, event });
    return true;
  };

  const result = await approvePyeonhanBenefitCandidate(
    { importRowId: 11, ruleId: "shinhan_lady_lunch_5p" },
    deps,
  );

  assert.equal(result.status, "updated");
  assert.equal(updates.length, 1);
  assert.equal((updates[0] as { eventId: string }).eventId, "event-existing");
});

test("benefit approval never replaces an event from another rule", async () => {
  const deps = dependencies(candidate({
    existingEventId: "event-existing",
    existingEvent: {
      eventId: "event-existing",
      whooingEntryId: 1429001,
      ruleId: "shinhan_lady_medical_5p",
      updatedAt: "2026-08-31T00:00:00.000Z",
      approvalAmount: 7700,
      performanceAmount: 7700,
      eligibleDiscountAmount: 385,
      appliedDiscountAmount: 385,
      postingAmount: 7315,
    },
  } as Partial<BenefitApprovalCandidate>));
  let updates = 0;
  deps.updateEvent = async () => { updates += 1; return true; };

  const result = await approvePyeonhanBenefitCandidate(
    { importRowId: 11, ruleId: "shinhan_lady_lunch_5p" },
    deps,
  );

  assert.equal(result.status, "rejected");
  assert.equal(updates, 0);
});

test("benefit approval rejects client rule changes and invalid amount invariants", async () => {
  const deps = dependencies(candidate({ discountAmount: 384 }));
  const invalidAmounts = await approvePyeonhanBenefitCandidate({ importRowId: 11, ruleId: "shinhan_lady_lunch_5p" }, deps);
  const invalidRule = await approvePyeonhanBenefitCandidate({ importRowId: 11, ruleId: "hana_mgs_subscription_50p" }, dependencies());

  assert.equal(invalidAmounts.status, "rejected");
  assert.equal(invalidRule.status, "rejected");
});

test("benefit approval rejects a mirror transaction with a different item", async () => {
  const deps = dependencies(candidate({
    mirrorEntry: { ...candidate().mirrorEntry!, item: "쇼핑" },
  }));

  const result = await approvePyeonhanBenefitCandidate(
    { importRowId: 11, ruleId: "shinhan_lady_lunch_5p" },
    deps,
  );

  assert.equal(result.status, "rejected");
});

test("benefit approval stores an observed cap-limited discount below the theoretical amount", async () => {
  const record = candidate({
    approvalAmount: 159000,
    postingAmount: 158167,
    discountAmount: 833,
    mirrorEntry: {
      ...candidate().mirrorEntry!,
      amount: 158167,
    },
    rule: {
      ...candidate().rule,
      discountRateBps: 1000,
      hasMonthlyCap: true,
    },
  });
  const deps = dependencies(record);
  deps.validateCapLimitedDiscount = async () => true;
  let inserted: { eligibleDiscountAmount: number; appliedDiscountAmount: number } | null = null;
  deps.createEvent = async (event) => {
    inserted = event;
    return "event-cap";
  };

  const result = await approvePyeonhanBenefitCandidate(
    { importRowId: 11, ruleId: "shinhan_lady_lunch_5p" },
    deps,
  );

  assert.equal(result.status, "created");
  assert.deepEqual(inserted && {
    eligibleDiscountAmount: inserted.eligibleDiscountAmount,
    appliedDiscountAmount: inserted.appliedDiscountAmount,
  }, { eligibleDiscountAmount: 15900, appliedDiscountAmount: 833 });
});

test("benefit approval rejects a stale cap-limited reconstruction", async () => {
  const record = candidate({
    approvalAmount: 50_000,
    postingAmount: 47_000,
    discountAmount: 3_000,
    mirrorEntry: { ...candidate().mirrorEntry!, amount: 47_000 },
    rule: {
      ...candidate().rule,
      discountRateBps: 1_000,
      hasMonthlyCap: true,
    },
  });
  const deps = dependencies(record);
  deps.validateCapLimitedDiscount = async () => false;

  const result = await approvePyeonhanBenefitCandidate(
    { importRowId: 11, ruleId: "shinhan_lady_lunch_5p" },
    deps,
  );

  assert.equal(result.status, "rejected");
  assert.match(result.message, /다시 확인할 수 없습니다/);
  assert.deepEqual(deps.statuses, []);
});
