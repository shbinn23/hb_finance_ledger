import type { CardBenefitRule } from "../../lib/card-benefits/types.ts";
import type { ImportActionRow } from "./import-action-service.ts";
import { resolvePyeonhanCardBenefitCandidates } from "./pyeonhan-card-benefit.ts";

export type ImportBenefitSelectionAction = "register_and_apply" | "benefit_only";

export interface ImportBenefitSelectionDependencies {
  getRow: (rowId: number) => Promise<ImportActionRow | null>;
  getRules: () => Promise<CardBenefitRule[]>;
  saveSelection: (input: { rowId: number; ruleId: string; reason: string }) => Promise<void>;
  executeCreates: (rowIds: number[]) => Promise<{
    created: number;
    reused: number;
    failed: number;
    results: Array<{
      rowId: number;
      status: string;
      entryId: number | null;
      syncStatus: string;
      message: string;
    }>;
  }>;
  executeBenefit: (input: { importRowId: number; ruleId: string }) => Promise<{
    ok: boolean;
    status: string;
    benefitStatus?: string;
    eventId?: string | null;
    message: string;
  }>;
}

export interface ImportBenefitSelectionResult {
  ok: boolean;
  status: "created" | "pending" | "rejected" | "failed";
  ledgerStatus: "created" | "existing" | "not_started";
  benefitStatus: string;
  message: string;
}

function rejected(message: string): ImportBenefitSelectionResult {
  return {
    ok: false,
    status: "rejected",
    ledgerStatus: "not_started",
    benefitStatus: "rule_selection_required",
    message,
  };
}

export async function executeImportBenefitSelection(
  input: {
    importRowId: number;
    selectedRuleId: string;
    action: ImportBenefitSelectionAction;
  },
  dependencies: ImportBenefitSelectionDependencies,
): Promise<ImportBenefitSelectionResult> {
  const [row, rules] = await Promise.all([
    dependencies.getRow(input.importRowId),
    dependencies.getRules(),
  ]);
  if (!row || row.entryType !== "expense") return rejected("카드 지출 import row를 찾을 수 없습니다.");
  if (
    row.approvalAmount <= row.postingAmount
    || row.discountAmount !== row.approvalAmount - row.postingAmount
    || row.sourceAccountType !== "liabilities"
    || !row.sourceAccountId
  ) {
    return rejected("카드와 승인·매입·할인 금액을 검증할 수 없습니다.");
  }

  const resolution = resolvePyeonhanCardBenefitCandidates({
    sourceRowIndexes: [],
    occurredDate: row.occurredDate,
    entryType: "expense",
    sourceAssetName: "",
    counterpartyAssetName: null,
    sourceCategoryName: null,
    sourceSubcategoryName: null,
    item: row.item,
    memo: row.memo,
    postingAmount: row.postingAmount,
    approvalAmount: row.approvalAmount,
    discountAmount: row.discountAmount,
    currency: "KRW",
    occurrenceIndex: 1,
    sourceIdentityKey: row.sourceIdentityKey,
    sourceContentHash: row.sourceContentHash,
    transferPairComplete: true,
  }, {
    accountType: row.sourceAccountType,
    accountId: row.sourceAccountId,
  }, rules);
  if (!resolution.candidates.some((candidate) => candidate.ruleId === input.selectedRuleId)) {
    return rejected("선택한 rule이 현재 카드·할인율·최소 승인금액 조건과 일치하지 않습니다.");
  }
  if (input.action === "benefit_only" && !row.matchedWhooingEntryId) {
    return rejected("혜택만 반영하려면 연결된 Whooing 거래가 필요합니다.");
  }
  if (
    input.action === "register_and_apply"
    && !row.matchedWhooingEntryId
    && row.status !== "auto_creatable"
  ) {
    return rejected("신규 원장 등록이 가능한 상태가 아닙니다.");
  }

  await dependencies.saveSelection({
    rowId: row.id,
    ruleId: input.selectedRuleId,
    reason: "사용자가 금액 기준 후보에서 카드혜택 rule을 선택했습니다.",
  });

  let ledgerStatus: ImportBenefitSelectionResult["ledgerStatus"] = row.matchedWhooingEntryId
    ? "existing"
    : "not_started";
  if (input.action === "register_and_apply" && !row.matchedWhooingEntryId) {
    const create = await dependencies.executeCreates([row.id]);
    const result = create.results.find((candidate) => candidate.rowId === row.id);
    if (!result || create.failed > 0 || !["created", "reused"].includes(result.status)) {
      return {
        ok: false,
        status: "failed",
        ledgerStatus: "not_started",
        benefitStatus: "pending",
        message: result?.message ?? "Whooing 원장 등록에 실패했습니다.",
      };
    }
    ledgerStatus = "created";
    if (result.syncStatus === "pending") {
      return {
        ok: true,
        status: "pending",
        ledgerStatus,
        benefitStatus: "pending",
        message: "원장 등록은 완료됐지만 mirror 동기화 후 카드혜택 반영이 필요합니다. 다시 원장을 등록하지 마세요.",
      };
    }
  }

  const benefit = await dependencies.executeBenefit({
    importRowId: row.id,
    ruleId: input.selectedRuleId,
  });
  if (!benefit.ok && ledgerStatus === "created") {
    return {
      ok: true,
      status: "pending",
      ledgerStatus,
      benefitStatus: "failed",
      message: `원장 등록은 완료됐지만 카드혜택 반영은 실패했습니다. ${benefit.message}`,
    };
  }
  return {
    ok: benefit.ok,
    status: benefit.ok ? "created" : "failed",
    ledgerStatus: ledgerStatus === "not_started" ? "existing" : ledgerStatus,
    benefitStatus: benefit.benefitStatus ?? benefit.status,
    message: benefit.message,
  };
}
