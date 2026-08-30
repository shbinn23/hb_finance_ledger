export type ImportMappingType = "asset" | "expense_category" | "income_category";

type ImportAutomationEnv = Record<string, string | undefined>;

export interface ImportMappingGapInput {
  mappingType: ImportMappingType;
  sourceKey: string;
  count: number;
  amountTotal: number;
  entryTypes: string[];
}

export function getImportAutomationPolicy(env: ImportAutomationEnv = process.env) {
  const dryRunOnly = env.GMAIL_IMPORT_DRY_RUN_ONLY?.toLowerCase() !== "false";
  const safeOnly = env.GMAIL_IMPORT_AUTO_EXECUTE_SAFE_ONLY?.toLowerCase() === "true";
  return {
    dryRunOnly,
    safeOnly,
    autoExecuteEnabled: !dryRunOnly
      && safeOnly
      && env.GMAIL_IMPORT_AUTO_EXECUTE_ENABLED?.toLowerCase() === "true",
    accountCreateEnabled: env.GMAIL_IMPORT_ACCOUNT_CREATE_ENABLED?.toLowerCase() === "true",
    accountCreateRequiresApproval: true,
  };
}

function accountTypeForMapping(mappingType: ImportMappingType) {
  if (mappingType === "expense_category") return "expenses";
  if (mappingType === "income_category") return "income";
  return "assets";
}

export function buildImportAccountCandidate(gap: ImportMappingGapInput, sectionId: string) {
  const title = gap.sourceKey.trim();
  const cardLike = gap.mappingType === "asset" && /(신용|체크)?카드|credit/i.test(title);
  const blockedReason = !sectionId
    ? "Whooing section을 확인할 수 없습니다."
    : !title || title.length > 30
      ? "계정 이름은 1~30자여야 합니다."
      : cardLike
        ? "카드 계정은 결제일 등 추가 정보가 필요해 자동 생성하지 않습니다."
        : null;
  return {
    ...gap,
    recommendedAccountType: accountTypeForMapping(gap.mappingType),
    recommendedSectionId: sectionId,
    recommendedTitle: title,
    canCreate: blockedReason === null,
    blockedReason,
  };
}
