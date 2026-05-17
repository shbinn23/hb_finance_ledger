const HANA_MGS_CARD_ID = "x45";
const SHINHAN_LADY_CARD_ID = "x50";
const HANA_MGS_RULE_ID = "hana_mgs_simple_pay_10p";

export type CardBackfillEntry = {
  entryId: number;
  entryDay: number;
  entryDate: string;
  item: string;
  memo: string;
  postingAmount: number;
  expenseAccountId: string;
  cardAccountId: string;
  cardTitle: string;
  hasExistingBenefitEvent: boolean;
};

export type BackfillProposedRow = {
  whooingEntryId: number;
  entryDay: number;
  entryDate: string;
  item: string;
  cardAccountId: string;
  cardTitle: string;
  expenseAccountId: string;
  ruleId: string | null;
  paymentChannel: "general" | "simple_pay";
  approvalAmount: number;
  performanceAmount: number;
  eligibleDiscountAmount: number;
  appliedDiscountAmount: number;
  postingAmount: number;
  evaluationStatus: "applied" | "manual_backfill" | "no_benefit";
  evaluationReason: string;
};

type ShinhanReverseResult =
  | { status: "success"; approvalAmount: number; appliedDiscountAmount: number }
  | { status: "failed"; reason: "no_approval_candidate" | "ambiguous_approval" | "memo_approval_mismatch"; candidates: number[] };

type ShinhanBackfillResult =
  | { kind: "proposed"; row: BackfillProposedRow }
  | { kind: "failed"; entry: CardBackfillEntry; reason: string; candidates: number[] };

type MgsImageEvidence = {
  entryDay: number;
  merchant: string;
  approvalAmount: number;
  appliedDiscountAmount: number;
};

type MgsEvidenceMatch =
  | { status: "matched"; evidence: MgsImageEvidence; expectedPostingAmount: number }
  | {
      status: "reverse_calculated";
      evidence: MgsImageEvidence;
      expectedPostingAmount: number;
      approvalAmount: number;
      appliedDiscountAmount: number;
    }
  | { status: "not_found"; evidence: null; expectedPostingAmount: null };

export type BackfillDryRunReport = {
  totalCount: number;
  totalPostingAmount: number;
  cardSummaries: {
    cardAccountId: string;
    cardTitle: string;
    count: number;
    postingTotal: number;
  }[];
  skippedExistingEventCount: number;
  proposedRows: BackfillProposedRow[];
  shinhanLady: {
    success: BackfillProposedRow[];
    failed: { entry: CardBackfillEntry; reason: string; candidates: number[] }[];
  };
  mgs: {
    matched: BackfillProposedRow[];
    reverseCalculated: BackfillProposedRow[];
    noBenefit: BackfillProposedRow[];
  };
  otherNoBenefit: BackfillProposedRow[];
  confirmationRequired: string[];
};

export const HANA_MGS_IMAGE_EVIDENCE: MgsImageEvidence[] = [
  { entryDay: 20260512, merchant: "몰테일(카카오페이)_나이스", approvalAmount: 159_000, appliedDiscountAmount: 10_845 },
  { entryDay: 20260510, merchant: "인터넷상거래_TOSS", approvalAmount: 19_000, appliedDiscountAmount: 1_900 },
  { entryDay: 20260510, merchant: "쿠팡이츠_KCP", approvalAmount: 10_900, appliedDiscountAmount: 1_090 },
  { entryDay: 20260509, merchant: "쿠팡이츠_KCP", approvalAmount: 10_900, appliedDiscountAmount: 1_090 },
  { entryDay: 20260506, merchant: "원더베이프", approvalAmount: 80_000, appliedDiscountAmount: 8_000 },
  { entryDay: 20260505, merchant: "박물관주유소", approvalAmount: 70_756, appliedDiscountAmount: 7_075 },
];

export function reverseFivePercentApproval(postingAmount: number, memo: string): ShinhanReverseResult {
  const candidates = approvalCandidatesForFivePercentPosting(postingAmount);
  if (candidates.length === 0) {
    return { status: "failed", reason: "no_approval_candidate", candidates };
  }

  const memoApproval = approvalAmountFromMemo(memo);
  if (memoApproval !== null) {
    const valid = candidates.includes(memoApproval);
    if (!valid) {
      return { status: "failed", reason: "memo_approval_mismatch", candidates };
    }

    return {
      status: "success",
      approvalAmount: memoApproval,
      appliedDiscountAmount: memoApproval - postingAmount,
    };
  }

  if (candidates.length !== 1) {
    return { status: "failed", reason: "ambiguous_approval", candidates };
  }

  return {
    status: "success",
    approvalAmount: candidates[0],
    appliedDiscountAmount: candidates[0] - postingAmount,
  };
}

export function proposeShinhanLadyBackfill(entry: CardBackfillEntry): ShinhanBackfillResult {
  const reversed = reverseFivePercentApproval(entry.postingAmount, entry.memo);
  if (reversed.status !== "success") {
    return { kind: "failed", entry, reason: reversed.reason, candidates: reversed.candidates };
  }

  return {
    kind: "proposed",
    row: {
      whooingEntryId: entry.entryId,
      entryDay: entry.entryDay,
      entryDate: entry.entryDate,
      item: entry.item,
      cardAccountId: entry.cardAccountId,
      cardTitle: entry.cardTitle,
      expenseAccountId: entry.expenseAccountId,
      ruleId: null,
      paymentChannel: "general",
      approvalAmount: reversed.approvalAmount,
      performanceAmount: reversed.approvalAmount,
      eligibleDiscountAmount: reversed.appliedDiscountAmount,
      appliedDiscountAmount: reversed.appliedDiscountAmount,
      postingAmount: entry.postingAmount,
      evaluationStatus: "manual_backfill",
      evaluationReason: "shinhan_lady_manual_5p_backfill",
    },
  };
}

export function matchMgsEvidence(entry: CardBackfillEntry): MgsEvidenceMatch {
  const evidenceForDay = HANA_MGS_IMAGE_EVIDENCE.filter((item) => item.entryDay === entry.entryDay);
  const exact = evidenceForDay.find((item) => imageEvidencePostingAmount(item) === entry.postingAmount);
  if (exact) {
    return {
      status: "matched",
      evidence: exact,
      expectedPostingAmount: imageEvidencePostingAmount(exact),
    };
  }

  const close = evidenceForDay.find((item) => Math.abs(imageEvidencePostingAmount(item) - entry.postingAmount) <= 1);
  if (close) {
    const reversed = reverseRateApproval(entry.postingAmount, 1_000);
    if (reversed.length === 1) {
      return {
        status: "reverse_calculated",
        evidence: close,
        expectedPostingAmount: imageEvidencePostingAmount(close),
        approvalAmount: reversed[0],
        appliedDiscountAmount: reversed[0] - entry.postingAmount,
      };
    }

    return {
      status: "not_found",
      evidence: null,
      expectedPostingAmount: null,
    };
  }

  return { status: "not_found", evidence: null, expectedPostingAmount: null };
}

export function buildBackfillDryRun(entries: CardBackfillEntry[]): BackfillDryRunReport {
  const proposedRows: BackfillProposedRow[] = [];
  const shinhanSuccess: BackfillProposedRow[] = [];
  const shinhanFailed: { entry: CardBackfillEntry; reason: string; candidates: number[] }[] = [];
  const mgsMatched: BackfillProposedRow[] = [];
  const mgsReverseCalculated: BackfillProposedRow[] = [];
  const mgsNoBenefit: BackfillProposedRow[] = [];
  const otherNoBenefit: BackfillProposedRow[] = [];

  const processableEntries = entries.filter((entry) => !entry.hasExistingBenefitEvent);

  for (const entry of processableEntries) {
    if (entry.cardAccountId === SHINHAN_LADY_CARD_ID) {
      const result = proposeShinhanLadyBackfill(entry);
      if (result.kind === "proposed") {
        proposedRows.push(result.row);
        shinhanSuccess.push(result.row);
      } else {
        shinhanFailed.push({
          entry: result.entry,
          reason: result.reason,
          candidates: result.candidates,
        });
      }
      continue;
    }

    if (entry.cardAccountId === HANA_MGS_CARD_ID) {
      const match = matchMgsEvidence(entry);
      if (match.status === "matched") {
        const row = proposedMgsBenefitRow(
          entry,
          match.evidence.approvalAmount,
          match.evidence.appliedDiscountAmount,
          "hana_mgs_image_backfill",
        );
        proposedRows.push(row);
        mgsMatched.push(row);
      } else if (match.status === "reverse_calculated") {
        const row = proposedMgsBenefitRow(
          entry,
          match.approvalAmount,
          match.appliedDiscountAmount,
          "mgs_backfill_reverse_calculated_from_posting",
        );
        proposedRows.push(row);
        mgsReverseCalculated.push(row);
      } else {
        const row = proposedNoBenefitRow(entry, "no_benefit_backfill");
        proposedRows.push(row);
        mgsNoBenefit.push(row);
      }
      continue;
    }

    const row = proposedNoBenefitRow(entry, "no_benefit_backfill");
    proposedRows.push(row);
    otherNoBenefit.push(row);
  }

  return {
    totalCount: entries.length,
    totalPostingAmount: sum(entries.map((entry) => entry.postingAmount)),
    cardSummaries: cardSummaries(entries),
    skippedExistingEventCount: entries.length - processableEntries.length,
    proposedRows,
    shinhanLady: {
      success: shinhanSuccess,
      failed: shinhanFailed,
    },
    mgs: {
      matched: mgsMatched,
      reverseCalculated: mgsReverseCalculated,
      noBenefit: mgsNoBenefit,
    },
    otherNoBenefit,
    confirmationRequired: confirmationMessages(shinhanFailed),
  };
}

function approvalCandidatesForFivePercentPosting(postingAmount: number) {
  const candidates: number[] = [];
  const maxApproval = Math.ceil(postingAmount / 0.95) + 2;
  for (let approvalAmount = postingAmount; approvalAmount <= maxApproval; approvalAmount += 1) {
    if (approvalAmount - Math.floor(approvalAmount * 0.05) === postingAmount) {
      candidates.push(approvalAmount);
    }
  }
  return candidates;
}

function reverseRateApproval(postingAmount: number, bps: number) {
  const rate = bps / 10_000;
  const candidates: number[] = [];
  const maxApproval = Math.ceil(postingAmount / (1 - rate)) + 2;
  for (let approvalAmount = postingAmount; approvalAmount <= maxApproval; approvalAmount += 1) {
    if (approvalAmount - Math.floor((approvalAmount * bps) / 10_000) === postingAmount) {
      candidates.push(approvalAmount);
    }
  }
  return candidates;
}

function approvalAmountFromMemo(memo: string) {
  const match = memo.match(/approval=(\d+)/);
  return match ? Number(match[1]) : null;
}

function imageEvidencePostingAmount(evidence: MgsImageEvidence) {
  return evidence.approvalAmount - evidence.appliedDiscountAmount;
}

function proposedMgsBenefitRow(
  entry: CardBackfillEntry,
  approvalAmount: number,
  appliedDiscountAmount: number,
  evaluationReason: string,
): BackfillProposedRow {
  return {
    whooingEntryId: entry.entryId,
    entryDay: entry.entryDay,
    entryDate: entry.entryDate,
    item: entry.item,
    cardAccountId: entry.cardAccountId,
    cardTitle: entry.cardTitle,
    expenseAccountId: entry.expenseAccountId,
    ruleId: HANA_MGS_RULE_ID,
    paymentChannel: "simple_pay",
    approvalAmount,
    performanceAmount: approvalAmount,
    eligibleDiscountAmount: appliedDiscountAmount,
    appliedDiscountAmount,
    postingAmount: entry.postingAmount,
    evaluationStatus: "applied",
    evaluationReason,
  };
}

function proposedNoBenefitRow(entry: CardBackfillEntry, evaluationReason: string): BackfillProposedRow {
  return {
    whooingEntryId: entry.entryId,
    entryDay: entry.entryDay,
    entryDate: entry.entryDate,
    item: entry.item,
    cardAccountId: entry.cardAccountId,
    cardTitle: entry.cardTitle,
    expenseAccountId: entry.expenseAccountId,
    ruleId: null,
    paymentChannel: "general",
    approvalAmount: entry.postingAmount,
    performanceAmount: entry.postingAmount,
    eligibleDiscountAmount: 0,
    appliedDiscountAmount: 0,
    postingAmount: entry.postingAmount,
    evaluationStatus: "no_benefit",
    evaluationReason,
  };
}

function cardSummaries(entries: CardBackfillEntry[]) {
  const byCard = new Map<string, { cardAccountId: string; cardTitle: string; count: number; postingTotal: number }>();
  for (const entry of entries) {
    const current = byCard.get(entry.cardAccountId) ?? {
      cardAccountId: entry.cardAccountId,
      cardTitle: entry.cardTitle,
      count: 0,
      postingTotal: 0,
    };
    current.count += 1;
    current.postingTotal += entry.postingAmount;
    byCard.set(entry.cardAccountId, current);
  }

  return [...byCard.values()].sort((left, right) => right.postingTotal - left.postingTotal);
}

function confirmationMessages(
  shinhanFailed: { entry: CardBackfillEntry; reason: string; candidates: number[] }[],
) {
  return [
    ...shinhanFailed.map((item) => (
      `신한 레이디 entry_id=${item.entry.entryId} ${item.entry.entryDate} ` +
      `${item.entry.item}: 역산 실패(${item.reason}) candidates=${item.candidates.join(",") || "-"}`
    )),
  ];
}

export function formatBackfillDryRunReport(report: BackfillDryRunReport) {
  const lines = [
    "# 2026-05 card_benefit_events backfill dry-run",
    "",
    "주의: 이 리포트는 DB write 없이 생성됐고 insert/apply를 수행하지 않았습니다.",
    "",
    "## 1. 2026-05 카드 지출 전체",
    `- 전체 건수: ${report.totalCount}건`,
    `- 매입금액 합계: ${formatWon(report.totalPostingAmount)}`,
    `- 기존 app.card_benefit_events 연결로 skip: ${report.skippedExistingEventCount}건`,
    "",
    "## 2. 카드별 건수/매입금액",
    ...report.cardSummaries.map((row) => (
      `- ${row.cardTitle} (${row.cardAccountId}): ${row.count}건 / ${formatWon(row.postingTotal)}`
    )),
    "",
    "## 3. proposed backfill rows",
    `- proposed: ${report.proposedRows.length}건`,
    `- 확인 필요로 proposed 제외: ${report.confirmationRequired.length}건`,
    "",
    "## 4. 신한 레이디 역산",
    `- 성공: ${report.shinhanLady.success.length}건`,
    ...report.shinhanLady.success.map((row) => (
      `  - entry_id=${row.whooingEntryId} ${row.entryDate} ${row.item}: ` +
      `approval=${formatWon(row.approvalAmount)}, discount=${formatWon(row.appliedDiscountAmount)}, ` +
      `posting=${formatWon(row.postingAmount)}`
    )),
    `- 실패: ${report.shinhanLady.failed.length}건`,
    ...report.shinhanLady.failed.map((item) => (
      `  - entry_id=${item.entry.entryId} ${item.entry.entryDate} ${item.entry.item}: ` +
      `${item.reason}, candidates=${item.candidates.join(",") || "-"}`
    )),
    "",
    "## 5. MG+S 이미지 할인건 매칭",
    `- exact matched: ${report.mgs.matched.length}건`,
    ...report.mgs.matched.map((row) => (
      `  - entry_id=${row.whooingEntryId} ${row.entryDate} ${row.item}: ` +
      `approval=${formatWon(row.approvalAmount)}, discount=${formatWon(row.appliedDiscountAmount)}, ` +
      `posting=${formatWon(row.postingAmount)}`
    )),
    `- reverse calculated: ${report.mgs.reverseCalculated.length}건`,
    ...report.mgs.reverseCalculated.map((row) => (
      `  - entry_id=${row.whooingEntryId} ${row.entryDate} ${row.item}: ` +
      `approval=${formatWon(row.approvalAmount)}, discount=${formatWon(row.appliedDiscountAmount)}, ` +
      `posting=${formatWon(row.postingAmount)}, reason=${row.evaluationReason}`
    )),
    "",
    "## 6. MG+S 이미지 외 no_benefit",
    `- ${report.mgs.noBenefit.length}건 / ${formatWon(sum(report.mgs.noBenefit.map((row) => row.postingAmount)))}`,
    ...report.mgs.noBenefit.map((row) => (
      `  - entry_id=${row.whooingEntryId} ${row.entryDate} ${row.item}: ${formatWon(row.postingAmount)}`
    )),
    "",
    "## 7. 나머지 카드 no_benefit 요약",
    ...cardSummaryFromRows(report.otherNoBenefit).map((row) => (
      `- ${row.cardTitle} (${row.cardAccountId}): ${row.count}건 / ${formatWon(row.postingTotal)}`
    )),
    "",
    "## 8. apply 전 확인 필요",
    ...(report.confirmationRequired.length > 0
      ? report.confirmationRequired.map((item) => `- ${item}`)
      : ["- 없음"]),
  ];

  return lines.join("\n");
}

function cardSummaryFromRows(rows: BackfillProposedRow[]) {
  const entries = rows.map((row) => ({
    entryId: row.whooingEntryId,
    entryDay: row.entryDay,
    entryDate: row.entryDate,
    item: row.item,
    memo: "",
    postingAmount: row.postingAmount,
    cardAccountId: row.cardAccountId,
    cardTitle: row.cardTitle,
    expenseAccountId: row.expenseAccountId,
    hasExistingBenefitEvent: false,
  }));
  return cardSummaries(entries);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function formatWon(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}
