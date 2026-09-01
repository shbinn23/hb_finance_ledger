import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedPyeonhanTransaction } from "./pyeonhan-types.ts";
import type { CardBenefitRule } from "../../lib/card-benefits/types.ts";
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

const mgsRules: CardBenefitRule[] = [{
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
}];

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

test("reconciliation keeps a discounted row ledger-creatable and resolves its unique DB rule", () => {
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({
      sourceAssetName: "하나 MG+S",
      sourceCategoryName: "필수",
      sourceSubcategoryName: "생필품",
      item: "쿠팡",
      approvalAmount: 25250,
      postingAmount: 22725,
      discountAmount: 2525,
    })],
    mappings: [
      ...mappings,
      { mappingType: "asset", sourceKey: "하나 MG+S", accountType: "liabilities", accountId: "x45", confidence: 1 },
      { mappingType: "expense_category", sourceKey: "필수 / 생필품", accountType: "expenses", accountId: "e2", confidence: 1 },
    ],
    mirrorEntries: [],
    previousRows: [],
    cardBenefitRules: mgsRules,
  });

  assert.equal(result.rows[0].status, "auto_creatable");
  assert.equal(result.rows[0].cardBenefitStatus, "rule_matched");
  assert.equal(result.rows[0].cardBenefitCandidate?.ruleId, "hana_mgs_simple_pay_10p");
  assert.equal(result.rows[0].cardBenefitCandidates.length, 1);
});

test("reconciliation reconstructs a unique cap-limited approval and records provenance", () => {
  const cappedRules = [{
    ...mgsRules[0],
    monthlyCapTiers: [{ performanceThreshold: 1_000_000, monthlyCapAmount: 60_000 }],
  }];
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({
      occurredDate: "2026-08-15",
      sourceAssetName: "하나 MG+S",
      item: "카카오페이 결제",
      postingAmount: 47_000,
      approvalAmount: 47_000,
      discountAmount: 0,
    })],
    mappings: [
      ...mappings,
      { mappingType: "asset", sourceKey: "하나 MG+S", accountType: "liabilities", accountId: "x45", confidence: 1 },
    ],
    mirrorEntries: [],
    previousRows: [],
    cardBenefitRules: cappedRules,
    cardBenefitReplay: {
      monthlyCaps: { "2026-08:hana_mgs_simple_pay_10p": 60_000 },
      existingEvents: [{
        occurredDate: "2026-08-14",
        ruleId: "hana_mgs_simple_pay_10p",
        cardAccountId: "x45",
        appliedDiscountAmount: 57_000,
      }],
    },
  });

  assert.equal(result.rows[0].status, "auto_creatable");
  assert.equal(result.rows[0].transaction.approvalAmount, 50_000);
  assert.equal(result.rows[0].transaction.postingAmount, 47_000);
  assert.equal(result.rows[0].transaction.discountAmount, 3_000);
  assert.equal(result.rows[0].cardBenefitStatus, "rule_matched");
  assert.equal(result.rows[0].cardBenefitCandidate?.ruleId, "hana_mgs_simple_pay_10p");
  assert.equal(result.rows[0].benefitAmountProvenance?.approvalSource, "rule_reconstructed");
  assert.match(result.rows[0].benefitAmountProvenance?.reason ?? "", /잔여 한도 3,000원/);
});

test("reconciliation keeps an ambiguous reconstruction ledger-creatable but marks benefit review", () => {
  const duplicateRateRules = [
    { ...mgsRules[0], monthlyCapTiers: [{ performanceThreshold: 1_000_000, monthlyCapAmount: 60_000 }] },
    { ...mgsRules[0], ruleId: "other_10p", name: "다른 10%", priority: 11,
      monthlyCapTiers: [{ performanceThreshold: 1_000_000, monthlyCapAmount: 60_000 }] },
  ];
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({
      occurredDate: "2026-08-15",
      sourceAssetName: "하나 MG+S",
      item: "카카오페이 결제",
      postingAmount: 47_000,
      approvalAmount: 47_000,
      discountAmount: 0,
    })],
    mappings: [
      ...mappings,
      { mappingType: "asset", sourceKey: "하나 MG+S", accountType: "liabilities", accountId: "x45", confidence: 1 },
    ],
    mirrorEntries: [],
    previousRows: [],
    cardBenefitRules: duplicateRateRules,
    cardBenefitReplay: {
      monthlyCaps: {
        "2026-08:hana_mgs_simple_pay_10p": 60_000,
        "2026-08:other_10p": 60_000,
      },
      existingEvents: [],
    },
  });

  assert.equal(result.rows[0].status, "auto_creatable");
  assert.equal(result.rows[0].cardBenefitStatus, "needs_review");
  assert.match(result.rows[0].benefitAmountProvenance?.reason ?? "", /후보가 2개/);
});

test("reconciliation keeps the ledger creatable when no benefit rule matches", () => {
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({
      sourceAssetName: "하나 MG+S",
      approvalAmount: 10000,
      postingAmount: 9300,
      discountAmount: 700,
    })],
    mappings: [
      ...mappings,
      { mappingType: "asset", sourceKey: "하나 MG+S", accountType: "liabilities", accountId: "x45", confidence: 1 },
    ],
    mirrorEntries: [],
    previousRows: [],
    cardBenefitRules: mgsRules,
  });

  assert.equal(result.rows[0].status, "auto_creatable");
  assert.equal(result.rows[0].cardBenefitStatus, "rule_unknown");
  assert.equal(result.rows[0].cardBenefitCandidate, null);
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

test("reconciliation ignores appended ledger metadata when comparing an import memo", () => {
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({ memo: "원예" })],
    mappings,
    mirrorEntries: [mirror({
      memo: "원예 / 승인금액 44,900원 / src=xlsx-20260827-row-13",
    })],
    previousRows: [],
  });

  assert.equal(result.rows[0].status, "duplicate");
});

test("reconciliation treats metadata-only mirror memo as an empty import memo", () => {
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction()],
    mappings,
    mirrorEntries: [mirror({
      memo: "승인금액 9,000원 / 카드혜택 확인 / src=xlsx-20260830-row-1",
    })],
    previousRows: [],
  });

  assert.equal(result.rows[0].status, "duplicate");
});

test("reconciliation keeps a mirror-only content mismatch in conflict review", () => {
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({ item: "점심" })],
    mappings,
    mirrorEntries: [mirror({ item: "쇼핑" })],
    previousRows: [],
  });

  assert.equal(result.rows[0].status, "conflict");
  assert.equal(result.rows[0].matchedWhooingEntryId, 1428000);
});

test("discounted row never becomes rule matched against a different mirror item", () => {
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({
      postingAmount: 8550,
      approvalAmount: 9000,
      discountAmount: 450,
      sourceAssetName: "신한 레이디",
    })],
    mappings: [
      ...mappings,
      { mappingType: "asset", sourceKey: "신한 레이디", accountType: "liabilities", accountId: "x50", confidence: 1 },
    ],
    mirrorEntries: [mirror({ rightAccountType: "liabilities", rightAccountId: "x50", item: "쇼핑", amount: 8550 })],
    previousRows: [],
  });

  assert.equal(result.rows[0].status, "conflict");
  assert.notEqual(result.rows[0].cardBenefitStatus, "rule_matched");
});

test("reconciliation ignores generated income and transfer amount metadata", () => {
  const income = reconcilePyeonhanTransactions({
    transactions: [transaction({
      entryType: "income",
      sourceCategoryName: "근로소득",
      sourceSubcategoryName: null,
      item: "월급",
      memo: "정산",
      postingAmount: 7700,
      approvalAmount: 7700,
    })],
    mappings,
    mirrorEntries: [mirror({
      leftAccountType: "assets",
      leftAccountId: "a1",
      rightAccountType: "income",
      rightAccountId: "i1",
      item: "월급",
      memo: "정산 / 입금금액 7,700원 / src=xlsx-20260827-row-4",
      amount: 7700,
    })],
    previousRows: [],
  });
  const transfer = reconcilePyeonhanTransactions({
    transactions: [transaction({
      entryType: "transfer",
      counterpartyAssetName: "우체국",
      sourceCategoryName: null,
      sourceSubcategoryName: null,
      item: "이체",
      postingAmount: 100000,
      approvalAmount: 100000,
    })],
    mappings,
    mirrorEntries: [mirror({
      leftAccountType: "assets",
      leftAccountId: "a2",
      rightAccountType: "assets",
      rightAccountId: "a1",
      item: "이체",
      memo: "이체금액 100,000원 / src=xlsx-20260823-row-10-11",
      amount: 100000,
    })],
    previousRows: [],
  });

  assert.equal(income.rows[0].status, "duplicate");
  assert.equal(transfer.rows[0].status, "duplicate");
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
    item: "점심",
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

test("reconciliation keeps a different item on the same card and date in conflict review", () => {
  const previousRows: PreviousImportRow[] = [{
    sourceIdentityKey: "old-lunch",
    sourceContentHash: "old-content",
    status: "duplicate",
    matchedWhooingEntryId: 1428000,
    occurredDate: "2026-08-30",
    entryType: "expense",
    sourceAssetName: "신한 레이디",
    item: "점심",
    postingAmount: 9000,
    approvalAmount: 9000,
  }];
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({
      sourceIdentityKey: "new-shopping",
      sourceContentHash: "new-content",
      sourceAssetName: "신한 레이디",
      item: "쇼핑",
      postingAmount: 8550,
      approvalAmount: 9000,
    })],
    mappings: [
      ...mappings,
      { mappingType: "asset", sourceKey: "신한 레이디", accountType: "liabilities", accountId: "x50", confidence: 1 },
    ],
    mirrorEntries: [],
    previousRows,
  });

  assert.equal(result.rows[0].status, "conflict");
});

test("reconciliation prefers the same-date card row over repeated items from other dates", () => {
  const previousRows: PreviousImportRow[] = [
    {
      sourceIdentityKey: "aug-30-original",
      sourceContentHash: "aug-30-content",
      status: "duplicate",
      matchedWhooingEntryId: 1468607,
      occurredDate: "2026-08-30",
      entryType: "expense",
      sourceAssetName: "신한 레이디",
      item: "점심",
      postingAmount: 9000,
      approvalAmount: 9000,
    },
    ...["2026-08-27", "2026-08-25"].map((occurredDate, index) => ({
      sourceIdentityKey: `older-lunch-${index}`,
      sourceContentHash: `older-content-${index}`,
      status: "duplicate",
      matchedWhooingEntryId: 1468500 + index,
      occurredDate,
      entryType: "expense",
      sourceAssetName: "신한 레이디",
      item: "점심",
      postingAmount: 9000,
      approvalAmount: 9000,
    })),
  ];
  const result = reconcilePyeonhanTransactions({
    transactions: [
      transaction({
        sourceIdentityKey: "aug-30-discounted",
        sourceContentHash: "aug-30-discounted-content",
        sourceAssetName: "신한 레이디",
        postingAmount: 8550,
        approvalAmount: 9000,
        discountAmount: 450,
      }),
      transaction({
        occurredDate: "2026-08-31",
        sourceIdentityKey: "other-new-lunch",
        sourceContentHash: "other-new-lunch-content",
        sourceAssetName: "신한 레이디",
        postingAmount: 8000,
        approvalAmount: 8000,
      }),
    ],
    mappings: [
      ...mappings,
      { mappingType: "asset", sourceKey: "신한 레이디", accountType: "liabilities", accountId: "x50", confidence: 1 },
    ],
    mirrorEntries: [],
    previousRows,
  });

  assert.equal(result.rows[0].status, "possible_update");
  assert.equal(result.rows[0].matchedWhooingEntryId, 1468607);
  assert.deepEqual(result.rows[0].changes.map((change) => change.field), ["postingAmount"]);
});

test("reconciliation keeps a repeated item from another date in conflict review", () => {
  const previousRows: PreviousImportRow[] = [{
    sourceIdentityKey: "aug-30-lunch",
    sourceContentHash: "aug-30-content",
    status: "updated",
    matchedWhooingEntryId: 1468607,
    occurredDate: "2026-08-30",
    entryType: "expense",
    sourceAssetName: "신한 레이디",
    item: "점심",
    postingAmount: 8550,
    approvalAmount: 9000,
  }];
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({
      occurredDate: "2026-08-25",
      sourceIdentityKey: "aug-25-lunch",
      sourceContentHash: "aug-25-content",
      sourceAssetName: "신한 레이디",
      postingAmount: 7600,
      approvalAmount: 8000,
      discountAmount: 400,
    })],
    mappings: [
      ...mappings,
      { mappingType: "asset", sourceKey: "신한 레이디", accountType: "liabilities", accountId: "x50", confidence: 1 },
    ],
    mirrorEntries: [],
    previousRows,
  });

  assert.equal(result.rows[0].status, "conflict");
  assert.equal(result.rows[0].matchedWhooingEntryId, null);
});

test("reconciliation exposes before and after fields for a conservative one-to-one revision", () => {
  const previousRows: PreviousImportRow[] = [{
    sourceIdentityKey: "old-identity",
    sourceContentHash: "old-content",
    status: "created",
    matchedWhooingEntryId: 1428000,
    occurredDate: "2026-08-30",
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
      memo: "수정 메모",
      postingAmount: 10000,
      approvalAmount: 10000,
    })],
    mappings,
    mirrorEntries: [mirror()],
    previousRows,
  });

  assert.equal(result.rows[0].status, "possible_update");
  assert.deepEqual(result.rows[0].changes.map((change) => change.field), [
    "memo", "postingAmount", "approvalAmount",
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

test("reconciliation reviews a changed replay result even when the raw source hash is unchanged", () => {
  const previousRows: PreviousImportRow[] = [{
    sourceIdentityKey: "identity-1",
    sourceContentHash: "content-1",
    status: "created",
    matchedWhooingEntryId: 1428000,
    postingAmount: 47_000,
    approvalAmount: 47_000,
  }];
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({ postingAmount: 47_000, approvalAmount: 50_000, discountAmount: 3_000 })],
    mappings,
    mirrorEntries: [],
    previousRows,
  });

  assert.equal(result.rows[0].status, "review_required");
  assert.equal(result.rows[0].cardBenefitStatus, "needs_review");
  assert.match(result.rows[0].reason, /replay 결과/);
});

test("reconciliation reviews an existing benefit event that conflicts with equal Excel amounts", () => {
  const cardMappings: ImportMapping[] = [
    ...mappings,
    { mappingType: "asset", sourceKey: "하나 MG+S", accountType: "liabilities", accountId: "x45", confidence: 1 },
  ];
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({ sourceAssetName: "하나 MG+S", postingAmount: 47_000, approvalAmount: 47_000 })],
    mappings: cardMappings,
    mirrorEntries: [mirror({
      rightAccountType: "liabilities",
      rightAccountId: "x45",
      amount: 47_000,
      benefitEventId: "event-1",
      benefitEventApprovalAmount: 50_000,
      benefitEventPerformanceAmount: 50_000,
      benefitEventPostingAmount: 47_000,
      benefitEventDiscountAmount: 3_000,
    })],
    previousRows: [],
    cardBenefitRules: mgsRules,
  });

  assert.equal(result.rows[0].status, "review_required");
  assert.equal(result.rows[0].cardBenefitStatus, "needs_review");
  assert.equal(result.rows[0].benefitEventIntegrity, "amount_mismatch");
});

test("reconciliation reports previous snapshot identities missing from the current export", () => {
  const previousRows: PreviousImportRow[] = [{
    sourceIdentityKey: "missing-identity",
    sourceContentHash: "old-content",
    occurrenceIndex: 3,
    status: "created",
    matchedWhooingEntryId: 1428001,
  }];
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction()], mappings, mirrorEntries: [], previousRows,
  });

  assert.equal(result.possibleDeletes.length, 1);
  assert.equal(result.possibleDeletes[0].status, "possible_delete");
  assert.equal(result.possibleDeletes[0].transaction.occurredDate, "");
  assert.equal(result.possibleDeletes[0].transaction.occurrenceIndex, 3);
});

test("reconciliation detects a payment-account-only revision as one update", () => {
  const previousRows: PreviousImportRow[] = [{
    sourceIdentityKey: "old-card-identity",
    sourceContentHash: "old-card-content",
    status: "created",
    matchedWhooingEntryId: 1429000,
    occurredDate: "2026-08-25",
    entryType: "expense",
    sourceAssetName: "국민 톡톡",
    sourceCategoryName: "선택",
    sourceSubcategoryName: "식비",
    item: "점심",
    memo: "",
    postingAmount: 9000,
    approvalAmount: 9000,
  }];
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({
      occurredDate: "2026-08-25",
      sourceAssetName: "우체국",
      item: "점심",
      sourceIdentityKey: "new-card-identity",
      sourceContentHash: "new-card-content",
    })],
    mappings,
    mirrorEntries: [mirror({
      entryId: 1429000,
      occurredDate: "2026-08-25",
    })],
    previousRows,
  });

  assert.equal(result.rows[0].status, "possible_update");
  assert.equal(result.rows[0].matchedWhooingEntryId, 1429000);
  assert.deepEqual(result.rows[0].changes.map((change) => change.field), ["sourceAssetName"]);
  assert.deepEqual(result.rows[0].mirrorChanges.map((change) => change.field), ["rightAccount"]);
  assert.equal(result.possibleDeletes.length, 0);
});

test("reconciliation keeps an unresolved discount ledger-creatable but difference income in review", () => {
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

  assert.equal(result.rows[0].status, "auto_creatable");
  assert.match(result.rows[0].reason, /활성 rule|혜택만 검토/);
  assert.equal(result.rows[0].cardBenefitCandidate, null);
  assert.equal(result.rows[1].status, "review_required");
  assert.match(result.rows[1].reason, /지원금\/쿠폰 처리 정책 필요/);
});

test("reconciliation exposes an exact card rule candidate without blocking ledger creation", () => {
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

  assert.equal(result.rows[0].status, "auto_creatable");
  assert.equal(result.rows[0].cardBenefitCandidate?.ruleId, "shinhan_lady_lunch_5p");
  assert.equal(result.rows[0].cardBenefitStatus, "rule_matched");
  assert.match(result.rows[0].reason, /신한 레이디 · 점심 5% rule/);
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
    mappings: [
      ...mappings,
      { mappingType: "income_category", sourceKey: "환급 / 캐시백", accountType: "income", accountId: "i-cashback", confidence: 1 },
    ],
    mirrorEntries: [],
    previousRows: [],
  });

  assert.deepEqual(result.rows.map((row) => row.status), ["review_required", "review_required"]);
  assert.match(result.rows[0].reason, /수입 의미가 섞여 있어 수동 정책 필요/);
  assert.match(result.rows[1].reason, /balance adjustment.*지원금\/쿠폰 처리 정책 필요/);
  assert.equal(result.summary.autoCreatable, 0);
});

test("refund income reports its missing category mapping before manual review", () => {
  const result = reconcilePyeonhanTransactions({
    transactions: [transaction({
      entryType: "income",
      sourceCategoryName: "환급",
      sourceSubcategoryName: "캐시백",
      sourceIdentityKey: "refund-mapping",
    })],
    mappings,
    mirrorEntries: [],
    previousRows: [],
  });

  assert.equal(result.rows[0].status, "mapping_required");
  assert.equal(result.mappingGaps.length, 1);
  assert.equal(result.mappingGaps[0].mappingType, "income_category");
  assert.equal(result.mappingGaps[0].sourceKey, "환급 / 캐시백");
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
