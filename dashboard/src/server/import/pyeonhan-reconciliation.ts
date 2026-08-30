import type { NormalizedPyeonhanTransaction } from "./pyeonhan-types.ts";
import {
  identifyPyeonhanCardBenefitCandidate,
  type PyeonhanCardBenefitCandidate,
} from "./pyeonhan-card-benefit.ts";

export type ImportReconciliationStatus =
  | "auto_creatable"
  | "duplicate"
  | "mapping_required"
  | "possible_update"
  | "possible_delete"
  | "conflict"
  | "review_required";

export type ImportBenefitStatus =
  | "not_applicable"
  | "rule_matched"
  | "rule_uncertain"
  | "event_exists"
  | "needs_review"
  | "approved"
  | "skipped"
  | "created"
  | "failed";

export interface ImportMapping {
  mappingType: "asset" | "expense_category" | "income_category";
  sourceKey: string;
  accountType: string;
  accountId: string;
  confidence: number;
}

export interface MirrorEntry {
  entryId: number;
  occurredDate: string;
  leftAccountType: string;
  leftAccountId: string;
  rightAccountType: string;
  rightAccountId: string;
  item: string;
  memo: string;
  amount: number;
  benefitEventId?: string | null;
  benefitEventApprovalAmount?: number | null;
  benefitEventPerformanceAmount?: number | null;
  benefitEventPostingAmount?: number | null;
  benefitEventDiscountAmount?: number | null;
}

export interface PreviousImportRow {
  sourceIdentityKey: string;
  sourceContentHash: string;
  status: string;
  matchedWhooingEntryId: number | null;
  occurredDate?: string;
  entryType?: string;
  sourceAssetName?: string;
  counterpartyAssetName?: string | null;
  sourceCategoryName?: string | null;
  sourceSubcategoryName?: string | null;
  item?: string;
  memo?: string;
  postingAmount?: number;
  approvalAmount?: number;
}

export interface ImportRowChange {
  field: "occurredDate" | "sourceAssetName" | "counterpartyAssetName"
    | "sourceCategoryName" | "sourceSubcategoryName" | "item" | "memo"
    | "postingAmount" | "approvalAmount" | "leftAccount" | "rightAccount";
  label: string;
  before: string | number | null;
  after: string | number | null;
}

export interface ResolvedImportMapping {
  sourceAccount: ImportMapping | null;
  counterpartyAccount: ImportMapping | null;
  categoryAccount: ImportMapping | null;
}

export interface ReconciledImportRow {
  transaction: NormalizedPyeonhanTransaction;
  status: ImportReconciliationStatus;
  reason: string;
  matchedWhooingEntryId: number | null;
  mapping: ResolvedImportMapping;
  cardBenefitCandidate: PyeonhanCardBenefitCandidate | null;
  cardBenefitStatus: ImportBenefitStatus;
  benefitEventIntegrity: "not_applicable" | "missing" | "matched" | "amount_mismatch";
  changes: ImportRowChange[];
  mirrorChanges: ImportRowChange[];
}

export interface ImportMappingGap {
  mappingType: ImportMapping["mappingType"];
  sourceKey: string;
  count: number;
  amountTotal: number;
  entryTypes: string[];
  suggestions: ImportMapping[];
}

export interface PyeonhanReconciliationResult {
  rows: ReconciledImportRow[];
  possibleDeletes: ReconciledImportRow[];
  mappingGaps: ImportMappingGap[];
  summary: {
    total: number;
    autoCreatable: number;
    duplicates: number;
    mappingRequired: number;
    reviewRequired: number;
    possibleUpdates: number;
    possibleDeletes: number;
    conflicts: number;
    benefitCandidates: number;
    benefitUncertain: number;
    benefitExisting: number;
    benefitEventMissing: number;
    benefitAmountMismatches: number;
  };
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

function compact(value: string | null | undefined) {
  return normalize(value).replace(/[^\p{L}\p{N}]/gu, "");
}

const changeFields = [
  ["occurredDate", "날짜"],
  ["sourceAssetName", "자산"],
  ["counterpartyAssetName", "상대 자산"],
  ["sourceCategoryName", "분류"],
  ["sourceSubcategoryName", "소분류"],
  ["item", "내용"],
  ["memo", "메모"],
  ["postingAmount", "매입금액"],
  ["approvalAmount", "승인금액"],
] as const;

function revisionChanges(
  previous: PreviousImportRow,
  transaction: NormalizedPyeonhanTransaction,
): ImportRowChange[] {
  return changeFields.flatMap(([field, label]) => {
    const before = previous[field];
    const after = transaction[field];
    if (before === undefined || before === after) return [];
    return [{ field, label, before, after }];
  });
}

function mirrorChanges(row: ReconciledImportRow, entry: MirrorEntry | undefined): ImportRowChange[] {
  if (!entry) return [];
  const sides = expectedSides(row);
  const comparisons: Array<[ImportRowChange["field"], string, string | number, string | number | null | undefined]> = [
    ["occurredDate", "날짜", entry.occurredDate, row.transaction.occurredDate],
    ["item", "내용", entry.item, row.transaction.item],
    ["memo", "메모", entry.memo, row.transaction.memo],
    ["postingAmount", "매입금액", entry.amount, row.transaction.postingAmount],
    ["leftAccount", "차변 계정", `${entry.leftAccountType}:${entry.leftAccountId}`, `${sides.leftType}:${sides.leftId}`],
    ["rightAccount", "대변 계정", `${entry.rightAccountType}:${entry.rightAccountId}`, `${sides.rightType}:${sides.rightId}`],
  ];
  return comparisons.flatMap(([field, label, before, after]) => (
    after !== undefined && before !== after ? [{ field, label, before, after }] : []
  ));
}

function isRevisionCandidate(
  transaction: NormalizedPyeonhanTransaction,
  previous: PreviousImportRow,
) {
  if (transaction.entryType !== previous.entryType) return false;
  const sameDate = transaction.occurredDate === previous.occurredDate;
  const sameAsset = normalize(transaction.sourceAssetName) === normalize(previous.sourceAssetName);
  const sameItem = normalize(transaction.item) === normalize(previous.item);
  const samePosting = transaction.postingAmount === previous.postingAmount;
  return (sameDate && sameAsset) || (sameItem && (sameDate || sameAsset || samePosting));
}

function mappingSuggestions(gap: Omit<ImportMappingGap, "suggestions">, mappings: ImportMapping[]) {
  const target = compact(gap.sourceKey);
  const candidates = mappings.filter((mapping) => mapping.mappingType === gap.mappingType);
  const scored = candidates.map((mapping) => {
    const candidate = compact(mapping.sourceKey);
    const score = target === candidate
      ? 1
      : target.includes(candidate) || candidate.includes(target)
        ? Math.min(target.length, candidate.length) / Math.max(target.length, candidate.length)
        : 0;
    return { mapping, score };
  }).filter(({ score }) => score >= 0.5)
    .sort((a, b) => b.score - a.score || a.mapping.sourceKey.localeCompare(b.mapping.sourceKey, "ko-KR"));
  const seen = new Set<string>();
  return scored.flatMap(({ mapping }) => {
    const key = `${mapping.accountType}:${mapping.accountId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [mapping];
  }).slice(0, 3);
}

function categoryKey(transaction: NormalizedPyeonhanTransaction) {
  return [transaction.sourceCategoryName, transaction.sourceSubcategoryName]
    .filter(Boolean)
    .join(" / ");
}

function resolveMapping(
  transaction: NormalizedPyeonhanTransaction,
  mappings: ImportMapping[],
): ResolvedImportMapping {
  const find = (mappingType: ImportMapping["mappingType"], sourceKey: string | null) => (
    sourceKey
      ? mappings.find((mapping) => (
        mapping.mappingType === mappingType
        && normalize(mapping.sourceKey) === normalize(sourceKey)
        && mapping.confidence === 1
      )) ?? null
      : null
  );
  return {
    sourceAccount: find("asset", transaction.sourceAssetName),
    counterpartyAccount: find("asset", transaction.counterpartyAssetName),
    categoryAccount: transaction.entryType === "expense"
      ? find("expense_category", categoryKey(transaction))
      : transaction.entryType === "income"
        ? find("income_category", categoryKey(transaction))
        : null,
  };
}

function mappingGap(
  transaction: NormalizedPyeonhanTransaction,
  mapping: ResolvedImportMapping,
) {
  if (transaction.entryType === "difference_income") return "차액수입은 조정 계정 매핑이 필요합니다.";
  if (!mapping.sourceAccount) return "자산 매핑이 필요합니다.";
  if (transaction.entryType === "transfer" && !mapping.counterpartyAccount) {
    return "이체 상대 자산 매핑이 필요합니다.";
  }
  if ((transaction.entryType === "expense" || transaction.entryType === "income") && !mapping.categoryAccount) {
    return "카테고리 매핑이 필요합니다.";
  }
  return null;
}

function manualReviewReason(transaction: NormalizedPyeonhanTransaction) {
  const category = normalize(`${transaction.sourceCategoryName ?? ""} ${transaction.sourceSubcategoryName ?? ""}`);
  if (/(환급|캐시백)/.test(category)) {
    return "환급/캐시백은 수입 의미가 섞여 있어 수동 정책 필요 상태로 유지합니다.";
  }
  if (transaction.entryType === "difference_income" || /민생지원쿠폰/.test(transaction.item)) {
    return "민생지원쿠폰 차액조정은 balance adjustment 또는 지원금/쿠폰 처리 정책 필요 상태입니다.";
  }
  return null;
}

function unresolvedMappings(
  transaction: NormalizedPyeonhanTransaction,
  mapping: ResolvedImportMapping,
): Array<Pick<ImportMappingGap, "mappingType" | "sourceKey">> {
  const gaps: Array<Pick<ImportMappingGap, "mappingType" | "sourceKey">> = [];
  if (!mapping.sourceAccount) gaps.push({ mappingType: "asset", sourceKey: transaction.sourceAssetName });
  if (transaction.entryType === "transfer" && !mapping.counterpartyAccount) {
    if (transaction.counterpartyAssetName) {
      gaps.push({ mappingType: "asset", sourceKey: transaction.counterpartyAssetName });
    }
  }
  if (transaction.entryType === "expense" && !mapping.categoryAccount) {
    gaps.push({ mappingType: "expense_category", sourceKey: categoryKey(transaction) });
  }
  if (transaction.entryType === "income" && !mapping.categoryAccount) {
    gaps.push({ mappingType: "income_category", sourceKey: categoryKey(transaction) });
  }
  return gaps;
}

function expectedSides(row: ReconciledImportRow) {
  const mapping = row.mapping;
  if (row.transaction.entryType === "expense") {
    return {
      leftType: "expenses",
      leftId: mapping.categoryAccount?.accountId,
      rightType: mapping.sourceAccount?.accountType,
      rightId: mapping.sourceAccount?.accountId,
    };
  }
  if (row.transaction.entryType === "income") {
    return {
      leftType: mapping.sourceAccount?.accountType,
      leftId: mapping.sourceAccount?.accountId,
      rightType: "income",
      rightId: mapping.categoryAccount?.accountId,
    };
  }
  return {
    leftType: mapping.counterpartyAccount?.accountType,
    leftId: mapping.counterpartyAccount?.accountId,
    rightType: mapping.sourceAccount?.accountType,
    rightId: mapping.sourceAccount?.accountId,
  };
}

function sameLedgerShape(row: ReconciledImportRow, entry: MirrorEntry, exact: boolean) {
  const sides = expectedSides(row);
  if (
    entry.occurredDate !== row.transaction.occurredDate
    || entry.amount !== row.transaction.postingAmount
    || entry.leftAccountType !== sides.leftType
    || entry.leftAccountId !== sides.leftId
    || entry.rightAccountType !== sides.rightType
    || entry.rightAccountId !== sides.rightId
  ) {
    return false;
  }
  return !exact || (
    normalize(entry.item) === normalize(row.transaction.item)
    && normalize(entry.memo) === normalize(row.transaction.memo)
  );
}

function emptyMapping(): ResolvedImportMapping {
  return { sourceAccount: null, counterpartyAccount: null, categoryAccount: null };
}

function benefitEventIntegrity(
  transaction: NormalizedPyeonhanTransaction,
  entry: MirrorEntry | undefined,
  expectedPerformanceAmount: number,
): ReconciledImportRow["benefitEventIntegrity"] {
  if (transaction.discountAmount <= 0 || !entry) return "not_applicable";
  if (!entry.benefitEventId) return "missing";
  return entry.benefitEventApprovalAmount === transaction.approvalAmount
    && entry.benefitEventPerformanceAmount === expectedPerformanceAmount
    && entry.benefitEventPostingAmount === transaction.postingAmount
    && entry.benefitEventDiscountAmount === transaction.discountAmount
    ? "matched"
    : "amount_mismatch";
}

function deleteCandidate(previous: PreviousImportRow): ReconciledImportRow {
  return {
    transaction: {
      sourceRowIndexes: [],
      occurredDate: "",
      entryType: "expense",
      sourceAssetName: "",
      counterpartyAssetName: null,
      sourceCategoryName: null,
      sourceSubcategoryName: null,
      item: "",
      memo: "",
      postingAmount: 0,
      approvalAmount: 0,
      discountAmount: 0,
      currency: "KRW",
      occurrenceIndex: 0,
      sourceIdentityKey: previous.sourceIdentityKey,
      sourceContentHash: previous.sourceContentHash,
      transferPairComplete: true,
    },
    status: "possible_delete",
    reason: "이전 import에는 있었지만 현재 export 범위에서 찾지 못했습니다.",
    matchedWhooingEntryId: previous.matchedWhooingEntryId,
    mapping: emptyMapping(),
    cardBenefitCandidate: null,
    cardBenefitStatus: "not_applicable",
    benefitEventIntegrity: "not_applicable",
    changes: [],
    mirrorChanges: [],
  };
}

export function reconcilePyeonhanTransactions({
  transactions,
  mappings,
  mirrorEntries,
  previousRows,
}: {
  transactions: NormalizedPyeonhanTransaction[];
  mappings: ImportMapping[];
  mirrorEntries: MirrorEntry[];
  previousRows: PreviousImportRow[];
}): PyeonhanReconciliationResult {
  const usedMirrorIds = new Set<number>();
  const previousByIdentity = new Map(previousRows.map((row) => [row.sourceIdentityKey, row]));
  const currentIdentities = new Set(transactions.map((row) => row.sourceIdentityKey));
  const missingPrevious = previousRows.filter((row) => !currentIdentities.has(row.sourceIdentityKey));
  const newTransactions = transactions.filter((row) => !previousByIdentity.has(row.sourceIdentityKey));
  const revisionCandidates = new Map(newTransactions.map((transaction) => [
    transaction.sourceIdentityKey,
    missingPrevious.filter((previous) => isRevisionCandidate(transaction, previous)),
  ]));
  const candidateUseCount = new Map<string, number>();
  revisionCandidates.forEach((candidates) => candidates.forEach((candidate) => {
    candidateUseCount.set(candidate.sourceIdentityKey, (candidateUseCount.get(candidate.sourceIdentityKey) ?? 0) + 1);
  }));
  const claimedPreviousIdentities = new Set<string>();
  const rows = transactions.map((transaction): ReconciledImportRow => {
    const mapping = resolveMapping(transaction, mappings);
    const cardBenefitCandidate = identifyPyeonhanCardBenefitCandidate(transaction);
    const base: ReconciledImportRow = {
      transaction,
      status: "review_required",
      reason: "검토가 필요합니다.",
      matchedWhooingEntryId: null,
      mapping,
      cardBenefitCandidate,
      cardBenefitStatus: transaction.discountAmount > 0
        ? cardBenefitCandidate ? "needs_review" : "rule_uncertain"
        : "not_applicable",
      benefitEventIntegrity: "not_applicable",
      changes: [],
      mirrorChanges: [],
    };
    const manualReason = manualReviewReason(transaction);
    if (manualReason) return { ...base, status: "review_required", reason: manualReason };
    const gap = mappingGap(transaction, mapping);
    if (gap) return { ...base, status: "mapping_required", reason: gap };
    if (transaction.entryType === "transfer" && !transaction.transferPairComplete) {
      return { ...base, reason: "이체 입금/출금 pair를 모두 찾지 못했습니다." };
    }
    const previous = previousByIdentity.get(transaction.sourceIdentityKey);
    const exactMirror = mirrorEntries.find((entry) => (
      !usedMirrorIds.has(entry.entryId) && sameLedgerShape(base, entry, true)
    ));
    const similarMirror = exactMirror ?? mirrorEntries.find((entry) => (
      !usedMirrorIds.has(entry.entryId) && sameLedgerShape(base, entry, false)
    ));

    if (previous && previous.sourceContentHash !== transaction.sourceContentHash) {
      const previousMirror = mirrorEntries.find((entry) => entry.entryId === previous.matchedWhooingEntryId);
      const evidence = similarMirror ?? previousMirror;
      if (evidence) usedMirrorIds.add(evidence.entryId);
      const conflict = similarMirror
        && previous.matchedWhooingEntryId !== null
        && similarMirror.entryId !== previous.matchedWhooingEntryId;
      return {
        ...base,
        status: conflict ? "conflict" : "possible_update",
        reason: conflict
          ? "이전 import와 다른 Whooing 거래가 함께 발견됐습니다."
          : "같은 source identity의 내용이 이전 import와 달라졌습니다.",
        matchedWhooingEntryId: evidence?.entryId ?? previous.matchedWhooingEntryId,
        changes: revisionChanges(previous, transaction),
        mirrorChanges: mirrorChanges(base, evidence),
      };
    }

    if (previous) {
      return {
        ...base,
        status: "duplicate",
        reason: "이전 import에서 이미 처리한 동일 거래입니다.",
        matchedWhooingEntryId: previous.matchedWhooingEntryId,
      };
    }

    const replacementCandidates = revisionCandidates.get(transaction.sourceIdentityKey) ?? [];
    if (replacementCandidates.length === 1
      && candidateUseCount.get(replacementCandidates[0].sourceIdentityKey) === 1) {
      const replacement = replacementCandidates[0];
      claimedPreviousIdentities.add(replacement.sourceIdentityKey);
      const previousMirror = mirrorEntries.find((entry) => entry.entryId === replacement.matchedWhooingEntryId);
      if (previousMirror) usedMirrorIds.add(previousMirror.entryId);
      return {
        ...base,
        status: "possible_update",
        reason: "유일하게 대응하는 이전 snapshot 거래와 내용이 달라졌습니다.",
        matchedWhooingEntryId: replacement.matchedWhooingEntryId,
        changes: revisionChanges(replacement, transaction),
        mirrorChanges: mirrorChanges(base, previousMirror),
      };
    }
    if (replacementCandidates.length > 0) {
      return {
        ...base,
        status: "conflict",
        reason: "이전 snapshot 거래와 대응 후보가 여러 건이어서 신규 등록 여부를 수동 확인해야 합니다.",
      };
    }

    if (transaction.discountAmount > 0) {
      if (similarMirror) usedMirrorIds.add(similarMirror.entryId);
      const eventIntegrity = benefitEventIntegrity(
        transaction,
        similarMirror,
        cardBenefitCandidate?.performanceAmount ?? transaction.approvalAmount,
      );
      return {
        ...base,
        cardBenefitStatus: eventIntegrity === "matched"
          ? "event_exists"
          : eventIntegrity === "amount_mismatch"
            ? "needs_review"
          : cardBenefitCandidate && similarMirror
            ? "rule_matched"
            : cardBenefitCandidate
              ? "needs_review"
              : "rule_uncertain",
        reason: eventIntegrity === "amount_mismatch"
          ? "기존 카드혜택 event의 승인·매입·할인 금액이 import와 일치하지 않습니다."
          : cardBenefitCandidate
            ? `카드혜택 ${cardBenefitCandidate.label} 후보입니다. 자동 등록 전 확인이 필요합니다.`
          : "할인 rule을 확정할 수 없어 자동 등록하지 않습니다.",
        matchedWhooingEntryId: similarMirror?.entryId ?? null,
        benefitEventIntegrity: eventIntegrity,
        mirrorChanges: mirrorChanges(base, similarMirror),
      };
    }

    if (exactMirror) {
      usedMirrorIds.add(exactMirror.entryId);
      return {
        ...base,
        status: "duplicate",
        reason: "동일한 Whooing mirror 거래가 있습니다.",
        matchedWhooingEntryId: exactMirror.entryId,
      };
    }
    if (similarMirror) {
      usedMirrorIds.add(similarMirror.entryId);
      return {
        ...base,
        status: "possible_update",
        reason: "날짜·금액·계정은 같지만 내용이 다른 Whooing 거래가 있습니다.",
        matchedWhooingEntryId: similarMirror.entryId,
        mirrorChanges: mirrorChanges(base, similarMirror),
      };
    }
    return { ...base, status: "auto_creatable", reason: "매핑이 완료된 신규 거래입니다." };
  });

  const possibleDeletes = previousRows
    .filter((previous) => (
      !currentIdentities.has(previous.sourceIdentityKey)
      && !claimedPreviousIdentities.has(previous.sourceIdentityKey)
    ))
    .map(deleteCandidate);
  const mappingGapCounts = new Map<string, ImportMappingGap>();
  rows.forEach((row) => {
    if (row.status !== "mapping_required") return;
    unresolvedMappings(row.transaction, row.mapping).forEach((gap) => {
      if (!gap.sourceKey) return;
      const key = `${gap.mappingType}:${normalize(gap.sourceKey)}`;
      const current = mappingGapCounts.get(key);
      mappingGapCounts.set(key, {
        ...gap,
        count: (current?.count ?? 0) + 1,
        amountTotal: (current?.amountTotal ?? 0) + row.transaction.postingAmount,
        entryTypes: [...new Set([...(current?.entryTypes ?? []), row.transaction.entryType])],
        suggestions: [],
      });
    });
  });
  const count = (status: ImportReconciliationStatus) => rows.filter((row) => row.status === status).length;

  return {
    rows,
    possibleDeletes,
    mappingGaps: [...mappingGapCounts.values()].map((gap) => ({
      ...gap,
      suggestions: mappingSuggestions(gap, mappings),
    })).sort((a, b) => (
      a.mappingType.localeCompare(b.mappingType) || a.sourceKey.localeCompare(b.sourceKey, "ko-KR")
    )),
    summary: {
      total: rows.length,
      autoCreatable: count("auto_creatable"),
      duplicates: count("duplicate"),
      mappingRequired: count("mapping_required"),
      reviewRequired: count("review_required"),
      possibleUpdates: count("possible_update"),
      possibleDeletes: possibleDeletes.length,
      conflicts: count("conflict"),
      benefitCandidates: rows.filter((row) => row.cardBenefitStatus === "rule_matched").length,
      benefitUncertain: rows.filter((row) => row.cardBenefitStatus === "rule_uncertain" || row.cardBenefitStatus === "needs_review").length,
      benefitExisting: rows.filter((row) => row.cardBenefitStatus === "event_exists").length,
      benefitEventMissing: rows.filter((row) => row.benefitEventIntegrity === "missing").length,
      benefitAmountMismatches: rows.filter((row) => row.benefitEventIntegrity === "amount_mismatch").length,
    },
  };
}
