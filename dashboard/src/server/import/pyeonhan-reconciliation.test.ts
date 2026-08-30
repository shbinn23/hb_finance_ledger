import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedPyeonhanTransaction } from "./pyeonhan-types.ts";
import {
  reconcilePyeonhanTransactions,
  type ImportMapping,
  type MirrorEntry,
  type PreviousImportRow,
} from "./pyeonhan-reconciliation.ts";

function transaction(
  overrides: Partial<NormalizedPyeonhanTransaction> = {},
): NormalizedPyeonhanTransaction {
  return {
    sourceRowIndexes: [2],
    occurredDate: "2026-08-30",
    entryType: "expense",
    sourceAssetName: "국민은행",
    counterpartyAssetName: null,
    sourceCategoryName: "선택",
    sourceSubcategoryName: "식비",
    item: "점심",
    memo: "",
    postingAmount: 9000,
    approvalAmount: 9000,
    discountAmount: 0,
    currency: "KRW",
    occurrenceIndex: 1,
    sourceIdentityKey: "identity-1",
    sourceContentHash: "content-1",
    transferPairComplete: true,
    ...overrides,
  };
}

const mappings: ImportMapping[] = [
  { mappingType: "asset", sourceKey: "국민은행", accountType: "assets", accountId: "a1", confidence: 1 },
  { mappingType: "asset", sourceKey: "우체국", accountType: "assets", accountId: "a2", confidence: 1 },
  { mappingType: "expense_category", sourceKey: "선택 / 식비", accountType: "expenses", accountId: "e1", confidence: 1 },
  { mappingType: "income_category", sourceKey: "근로소득", accountType: "income", accountId: "i1", confidence: 1 },
];

function mirror(overrides: Partial<MirrorEntry> = {}): MirrorEntry {
  return {
    entryId: 1428000,
    occurredDate: "2026-08-30",
    leftAccountType: "expenses",
    leftAccountId: "e1",
    rightAccountType: "assets",
    rightAccountId: "a1",
    item: "점심",
    memo: "",
    amount: 9000,
    ...overrides,
  };
}

test("reconciliation marks a fully mapped unmatched expense auto-creatable", () => {
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction()], mappings, mirrorEntries: [], previousRows: [],
  });

  assert.equal(result.rows[0].status, "auto_creatable");
  assert.equal(result.summary.autoCreatable, 1);
});

test("reconciliation requires mapping when an account or category is missing", () => {
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({ sourceAssetName: "새 계좌" })],
    mappings,
    mirrorEntries: [],
    previousRows: [],
  });

  assert.equal(result.rows[0].status, "mapping_required");
  assert.match(result.rows[0].reason, /자산 매핑/);
  assert.equal(result.mappingGaps[0].mappingType, "asset");
  assert.equal(result.mappingGaps[0].sourceKey, "새 계좌");
  assert.equal(result.mappingGaps[0].count, 1);
});

test("reconciliation matches mirror duplicates one-to-one", () => {
  const first = transaction();
  const second = transaction({
    sourceRowIndexes: [3],
    occurrenceIndex: 2,
    sourceIdentityKey: "identity-2",
  });
  const result = reconcilePyeonhanTransactions({
    transactions: [first, second], mappings, mirrorEntries: [mirror()], previousRows: [],
  });

  assert.deepEqual(result.rows.map((row) => row.status), ["duplicate", "auto_creatable"]);
  assert.equal(result.rows[0].matchedWhooingEntryId, 1428000);
});

test("reconciliation detects an existing reciprocal transfer as duplicate", () => {
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({
      sourceRowIndexes: [2, 3],
      entryType: "transfer",
      counterpartyAssetName: "우체국",
      sourceCategoryName: null,
      sourceSubcategoryName: null,
      item: "계좌이체",
      postingAmount: 5000,
      approvalAmount: 5000,
    })],
    mappings,
    mirrorEntries: [mirror({
      leftAccountType: "assets",
      leftAccountId: "a2",
      rightAccountType: "assets",
      rightAccountId: "a1",
      item: "계좌이체",
      amount: 5000,
    })],
    previousRows: [],
  });

  assert.equal(result.rows[0].status, "duplicate");
  assert.equal(result.rows[0].matchedWhooingEntryId, 1428000);
});

test("reconciliation detects changed content for a previous source identity", () => {
  const previousRows: PreviousImportRow[] = [{
    sourceIdentityKey: "identity-1",
    sourceContentHash: "old-content",
    status: "created",
    matchedWhooingEntryId: 1428000,
  }];
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction()], mappings, mirrorEntries: [mirror()], previousRows,
  });

  assert.equal(result.rows[0].status, "possible_update");
});

test("reconciliation treats a one-to-one amount identity change as a possible update", () => {
  const previousRows: PreviousImportRow[] = [{
    sourceIdentityKey: "old-identity",
    sourceContentHash: "old-content",
    status: "created",
    matchedWhooingEntryId: 1428000,
    occurredDate: "2026-08-30",
    entryType: "expense",
    sourceAssetName: "국민은행",
  }];
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({ postingAmount: 10000, approvalAmount: 10000 })],
    mappings,
    mirrorEntries: [],
    previousRows,
  });

  assert.equal(result.rows[0].status, "possible_update");
  assert.equal(result.rows[0].matchedWhooingEntryId, 1428000);
  assert.equal(result.possibleDeletes.length, 0);
});

test("reconciliation exposes before and after fields for a conservative one-to-one revision", () => {
  const previousRows: PreviousImportRow[] = [{
    sourceIdentityKey: "old-identity",
    sourceContentHash: "old-content",
    status: "created",
    matchedWhooingEntryId: 1428000,
    occurredDate: "2026-08-29",
    entryType: "expense",
    sourceAssetName: "국민은행",
    counterpartyAssetName: null,
    sourceCategoryName: "선택",
    sourceSubcategoryName: "식비",
    item: "점심",
    memo: "이전 메모",
    postingAmount: 9000,
    approvalAmount: 9000,
  }];
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({
      occurredDate: "2026-08-30",
      memo: "수정 메모",
      postingAmount: 10000,
      approvalAmount: 10000,
    })],
    mappings,
    mirrorEntries: [mirror({ occurredDate: "2026-08-29" })],
    previousRows,
  });

  assert.equal(result.rows[0].status, "possible_update");
  assert.deepEqual(result.rows[0].changes.map((change) => change.field), [
    "occurredDate", "memo", "postingAmount", "approvalAmount",
  ]);
  assert.equal(result.rows[0].matchedWhooingEntryId, 1428000);
  assert.equal(result.possibleDeletes.length, 0);
});

test("reconciliation flags a conflict when multiple previous rows are plausible", () => {
  const previousRows: PreviousImportRow[] = [1, 2].map((index) => ({
    sourceIdentityKey: `old-identity-${index}`,
    sourceContentHash: `old-content-${index}`,
    status: "created",
    matchedWhooingEntryId: 1428000 + index,
    occurredDate: "2026-08-29",
    entryType: "expense",
    sourceAssetName: "국민은행",
    item: "점심",
    postingAmount: 9000,
    approvalAmount: 9000,
  }));
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({ occurredDate: "2026-08-30" })],
    mappings,
    mirrorEntries: [],
    previousRows,
  });

  assert.equal(result.rows[0].status, "conflict");
  assert.equal(result.possibleDeletes.length, 2);
});

test("reconciliation keeps competing modified and new expenses out of auto-create", () => {
  const previousRows: PreviousImportRow[] = [{
    sourceIdentityKey: "old-identity",
    sourceContentHash: "old-content",
    status: "created",
    matchedWhooingEntryId: 1428000,
    occurredDate: "2026-08-30",
    entryType: "expense",
    sourceAssetName: "국민은행",
    item: "점심",
    postingAmount: 9000,
    approvalAmount: 9000,
  }];
  const result = reconcilePyeonhanTransactions({
    transactions: [
      transaction({ item: "수정된 점심", sourceIdentityKey: "changed-identity" }),
      transaction({ item: "신규 간식", sourceIdentityKey: "new-identity", occurrenceIndex: 2 }),
    ],
    mappings,
    mirrorEntries: [],
    previousRows,
  });

  assert.deepEqual(result.rows.map((row) => row.status), ["conflict", "conflict"]);
  assert.equal(result.summary.autoCreatable, 0);
  assert.equal(result.possibleDeletes.length, 1);
});

test("reconciliation keeps an unchanged previously created row duplicate when the mirror is stale", () => {
  const previousRows: PreviousImportRow[] = [{
    sourceIdentityKey: "identity-1",
    sourceContentHash: "content-1",
    status: "created",
    matchedWhooingEntryId: 1428000,
  }];
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction()], mappings, mirrorEntries: [], previousRows,
  });

  assert.equal(result.rows[0].status, "duplicate");
  assert.equal(result.rows[0].matchedWhooingEntryId, 1428000);
});

test("reconciliation reports previous snapshot identities missing from the current export", () => {
  const previousRows: PreviousImportRow[] = [{
    sourceIdentityKey: "missing-identity",
    sourceContentHash: "old-content",
    status: "created",
    matchedWhooingEntryId: 1428001,
  }];
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction()], mappings, mirrorEntries: [], previousRows,
  });

  assert.equal(result.possibleDeletes.length, 1);
  assert.equal(result.possibleDeletes[0].status, "possible_delete");
});

test("reconciliation keeps discounts without an explicit rule and difference income in review", () => {
  const result = reconcilePyeonhanTransactions({
    transactions: [
      transaction({ approvalAmount: 10000, postingAmount: 9000, discountAmount: 1000 }),
      transaction({
        entryType: "difference_income",
        sourceIdentityKey: "difference-1",
        sourceContentHash: "difference-content",
      }),
    ],
    mappings,
    mirrorEntries: [],
    previousRows: [],
  });

  assert.equal(result.rows[0].status, "review_required");
  assert.match(result.rows[0].reason, /할인 rule/);
  assert.equal(result.rows[0].cardBenefitCandidate, null);
  assert.equal(result.rows[1].status, "review_required");
  assert.match(result.rows[1].reason, /지원금\/쿠폰 처리 정책 필요/);
});

test("reconciliation exposes an exact card rule candidate but keeps it review-only", () => {
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({
      sourceAssetName: "신한 레이디",
      sourceCategoryName: "필수",
      sourceSubcategoryName: "식비",
      memo: "점심",
      approvalAmount: 7700,
      postingAmount: 7315,
      discountAmount: 385,
    })],
    mappings: [
      ...mappings,
      { mappingType: "asset", sourceKey: "신한 레이디", accountType: "liabilities", accountId: "x50", confidence: 1 },
      { mappingType: "expense_category", sourceKey: "필수 / 식비", accountType: "expenses", accountId: "x61", confidence: 1 },
    ],
    mirrorEntries: [],
    previousRows: [],
  });

  assert.equal(result.rows[0].status, "review_required");
  assert.equal(result.rows[0].cardBenefitCandidate?.ruleId, "shinhan_lady_lunch_5p");
  assert.equal(result.rows[0].cardBenefitStatus, "needs_review");
  assert.match(result.rows[0].reason, /신한 레이디 · 점심 5% 후보/);
});

test("reconciliation distinguishes matched, uncertain, and existing benefit events", () => {
  const exact = transaction({
    sourceAssetName: "신한 레이디",
    sourceCategoryName: "필수",
    sourceSubcategoryName: "식비",
    item: "아워홈",
    memo: "점심",
    approvalAmount: 7700,
    postingAmount: 7315,
    discountAmount: 385,
  });
  const uncertain = transaction({
    sourceIdentityKey: "identity-2",
    approvalAmount: 10000,
    postingAmount: 9000,
    discountAmount: 1000,
  });
  const exactMirror = mirror({
    entryId: 1428001,
    leftAccountId: "x61",
    rightAccountType: "liabilities",
    rightAccountId: "x50",
    item: "아워홈",
    memo: "점심",
    amount: 7315,
    benefitEventId: "event-exact",
    benefitEventApprovalAmount: 7700,
    benefitEventPerformanceAmount: 7700,
    benefitEventPostingAmount: 7315,
    benefitEventDiscountAmount: 385,
  });
  const result = reconcilePyeonhanTransactions({
    transactions: [exact, uncertain],
    mappings: [
      ...mappings,
      { mappingType: "asset", sourceKey: "신한 레이디", accountType: "liabilities", accountId: "x50", confidence: 1 },
      { mappingType: "expense_category", sourceKey: "필수 / 식비", accountType: "expenses", accountId: "x61", confidence: 1 },
    ],
    mirrorEntries: [exactMirror, mirror({
      entryId: 1428002,
      benefitEventId: "event-1",
      benefitEventApprovalAmount: 10000,
      benefitEventPerformanceAmount: 10000,
      benefitEventPostingAmount: 9000,
      benefitEventDiscountAmount: 1000,
    })],
    previousRows: [],
  });

  assert.equal(result.rows[0].cardBenefitStatus, "event_exists");
  assert.equal(result.rows[1].cardBenefitStatus, "event_exists");
  assert.equal(result.rows[0].benefitEventIntegrity, "matched");
  assert.equal(result.summary.benefitCandidates, 0);
  assert.equal(result.summary.benefitExisting, 2);
  assert.equal(result.summary.benefitEventMissing, 0);
  assert.equal(result.summary.benefitAmountMismatches, 0);
});

test("reconciliation separates missing and amount-mismatched benefit events", () => {
  const discounted = transaction({
    sourceAssetName: "신한 레이디",
    sourceCategoryName: "필수",
    sourceSubcategoryName: "식비",
    item: "아워홈",
    memo: "점심",
    approvalAmount: 7700,
    postingAmount: 7315,
    discountAmount: 385,
  });
  const importMappings: ImportMapping[] = [
    ...mappings,
    { mappingType: "asset", sourceKey: "신한 레이디", accountType: "liabilities", accountId: "x50", confidence: 1 },
    { mappingType: "expense_category", sourceKey: "필수 / 식비", accountType: "expenses", accountId: "x61", confidence: 1 },
  ];
  const missing = reconcilePyeonhanTransactions({
    transactions: [discounted],
    mappings: importMappings,
    mirrorEntries: [mirror({
      leftAccountId: "x61",
      rightAccountType: "liabilities",
      rightAccountId: "x50",
      item: "아워홈",
      memo: "점심",
      amount: 7315,
    })],
    previousRows: [],
  });
  const mismatched = reconcilePyeonhanTransactions({
    transactions: [discounted],
    mappings: importMappings,
    mirrorEntries: [mirror({
      leftAccountId: "x61",
      rightAccountType: "liabilities",
      rightAccountId: "x50",
      item: "아워홈",
      memo: "점심",
      amount: 7315,
      benefitEventId: "event-mismatch",
      benefitEventApprovalAmount: 7700,
      benefitEventPerformanceAmount: 7700,
      benefitEventPostingAmount: 7315,
      benefitEventDiscountAmount: 300,
    })],
    previousRows: [],
  });

  assert.equal(missing.rows[0].benefitEventIntegrity, "missing");
  assert.equal(missing.summary.benefitEventMissing, 1);
  assert.equal(mismatched.rows[0].benefitEventIntegrity, "amount_mismatch");
  assert.equal(mismatched.rows[0].cardBenefitStatus, "needs_review");
  assert.equal(mismatched.summary.benefitAmountMismatches, 1);
  assert.equal(mismatched.summary.benefitExisting, 0);
});

test("refund cashback and support coupon adjustment remain explicit review-only policies", () => {
  const result = reconcilePyeonhanTransactions({
    transactions: [
      transaction({
        entryType: "income",
        sourceCategoryName: "환급",
        sourceSubcategoryName: "캐시백",
        sourceIdentityKey: "refund-1",
      }),
      transaction({
        entryType: "difference_income",
        item: "민생지원쿠폰 차액조정",
        sourceIdentityKey: "coupon-1",
      }),
    ],
    mappings,
    mirrorEntries: [],
    previousRows: [],
  });

  assert.deepEqual(result.rows.map((row) => row.status), ["review_required", "review_required"]);
  assert.match(result.rows[0].reason, /수입 의미가 섞여 있어 수동 정책 필요/);
  assert.match(result.rows[1].reason, /balance adjustment.*지원금\/쿠폰 처리 정책 필요/);
  assert.equal(result.summary.autoCreatable, 0);
});

test("discount review rows retain matching mirror evidence", () => {
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({
      approvalAmount: 10000,
      postingAmount: 9000,
      discountAmount: 1000,
    })],
    mappings,
    mirrorEntries: [mirror({ amount: 9000 })],
    previousRows: [],
  });

  assert.equal(result.rows[0].status, "review_required");
  assert.equal(result.rows[0].matchedWhooingEntryId, 1428000);
});

test("mapping status reports every missing mapping on a row", () => {
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({ sourceAssetName: "새 계좌", sourceSubcategoryName: "새 분류" })],
    mappings,
    mirrorEntries: [],
    previousRows: [],
  });

  assert.equal(result.mappingGaps.length, 2);
  assert.deepEqual(result.mappingGaps.map(({ mappingType, sourceKey, count, amountTotal }) => ({
    mappingType, sourceKey, count, amountTotal,
  })), [
    { mappingType: "asset", sourceKey: "새 계좌", count: 1, amountTotal: 9000 },
    { mappingType: "expense_category", sourceKey: "선택 / 새 분류", count: 1, amountTotal: 9000 },
  ]);
});

test("mapping gaps include conservative suggestions without applying them", () => {
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({ sourceAssetName: "국민 은행" })],
    mappings,
    mirrorEntries: [],
    previousRows: [],
  });

  assert.equal(result.rows[0].status, "mapping_required");
  assert.equal(result.mappingGaps[0].suggestions[0].accountId, "a1");
  assert.equal(result.mappingGaps[0].suggestions[0].sourceKey, "국민은행");
});
