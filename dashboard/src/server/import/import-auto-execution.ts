interface AutomationRow {
  importRowId?: number | null;
  status: string;
  transaction: {
    entryType: string;
    item?: string;
    sourceCategoryName?: string | null;
    sourceSubcategoryName?: string | null;
  };
  cardBenefitStatus: string;
  cardBenefitCandidate: { ruleId: string } | null;
}

function isReviewOnlyTransaction(row: AutomationRow) {
  const text = [
    row.transaction.item,
    row.transaction.sourceCategoryName,
    row.transaction.sourceSubcategoryName,
  ].filter(Boolean).join(" ");
  return row.transaction.entryType === "difference_income"
    || /(환급|캐시백|민생지원쿠폰)/.test(text);
}

function emptyResult() {
  return {
    safeEligibleCount: 0,
    executedCount: 0,
    createdLedgerEntries: 0,
    createdTransfers: 0,
    createdBenefitEvents: 0,
    updatedEntries: 0,
    blockedReviewOnlyCount: 0,
    blockedDangerousCount: 0,
    failedCount: 0,
    operationIds: [] as string[],
    completedCreateRowIds: [] as number[],
    completedBenefitRowIds: [] as number[],
    existingBenefitRowIds: [] as number[],
  };
}

export async function executeSafeImportAutomation(input: {
  enabled: boolean;
  rows: AutomationRow[];
  executeCreates: (rowIds: number[]) => Promise<{
    created: number;
    failed: number;
    results: Array<{ rowId: number; operationKey?: string | null; status: string; syncStatus?: string }>;
  }>;
  executeBenefit: (input: { importRowId: number; ruleId: string }) => Promise<{
    ok: boolean;
    status: string;
    operationKey?: string;
  }>;
}) {
  const summary = emptyResult();
  summary.blockedDangerousCount = input.rows.filter((row) => (
    row.status === "conflict" || row.status === "possible_delete"
  )).length;
  summary.blockedReviewOnlyCount = input.rows.filter((row) => (
    row.status === "possible_update"
    || row.status === "review_required"
    || row.status === "mapping_required"
    || row.cardBenefitStatus === "rule_uncertain"
    || row.cardBenefitStatus === "needs_review"
    || isReviewOnlyTransaction(row)
  )).length;
  if (!input.enabled) return summary;

  const createRows = input.rows.filter((row) => (
    row.status === "auto_creatable" && row.importRowId && !isReviewOnlyTransaction(row)
  ));
  const benefitRows = input.rows.filter((row) => (
    row.cardBenefitStatus === "rule_matched"
    && row.cardBenefitCandidate
    && row.importRowId
    && ["auto_creatable", "duplicate", "created", "updated"].includes(row.status)
  ));
  summary.safeEligibleCount = createRows.length + benefitRows.length;
  if (createRows.length > 0) {
    const createResult = await input.executeCreates(createRows.map((row) => row.importRowId as number));
    summary.createdLedgerEntries = createResult.created;
    const transferRowIds = new Set(createRows
      .filter((row) => row.transaction.entryType === "transfer")
      .map((row) => row.importRowId));
    summary.createdTransfers = createResult.results.filter((result) => (
      result.status === "created" && transferRowIds.has(result.rowId)
    )).length;
    summary.failedCount += createResult.failed;
    summary.completedCreateRowIds.push(...createResult.results
      .filter((result) => result.status === "created" || result.status === "reused")
      .map((result) => result.rowId));
    summary.operationIds.push(...createResult.results.flatMap((row) => row.operationKey ? [row.operationKey] : []));
  }
  for (const row of benefitRows) {
    if (row.status === "auto_creatable" && !summary.completedCreateRowIds.includes(row.importRowId as number)) {
      continue;
    }
    const result = await input.executeBenefit({
      importRowId: row.importRowId as number,
      ruleId: row.cardBenefitCandidate?.ruleId ?? "",
    });
    if (result.ok && (result.status === "created" || result.status === "event_exists")) {
      if (result.status === "created") {
        summary.createdBenefitEvents += 1;
        summary.completedBenefitRowIds.push(row.importRowId as number);
      } else {
        summary.existingBenefitRowIds.push(row.importRowId as number);
      }
    } else {
      summary.failedCount += 1;
    }
    if (result.operationKey) summary.operationIds.push(result.operationKey);
  }
  summary.executedCount = summary.createdLedgerEntries + summary.createdBenefitEvents;
  return summary;
}
