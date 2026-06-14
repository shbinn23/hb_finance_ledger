export type StatementDataQuality = "structured" | "partial_estimate" | "legacy_estimate" | "no_data";
export type BenefitCapAutoStatus = "ready" | "unknown" | "not_applicable";

export interface CardStatementEstimateInput {
  structuredApprovalTotal: number;
  structuredPostingTotal: number;
  structuredDiscountTotal: number;
  legacyPostingTotal: number;
}

export interface CardStatementEstimate extends CardStatementEstimateInput {
  approvalEstimateTotal: number;
  statementEstimate: number;
  effectiveSpend: number;
  statementVsEffectiveDelta: number;
  dataQuality: StatementDataQuality;
}

export interface CardPerformanceEstimateInput {
  structuredPerformanceTotal: number;
  structuredApprovalTotal: number;
  structuredPostingTotal: number;
  structuredDiscountTotal: number;
  legacyPostingTotal: number;
}

export interface CardPerformanceEstimate extends CardPerformanceEstimateInput {
  performanceEstimate: number;
  legacyPerformanceEstimateTotal: number;
  dataQuality: StatementDataQuality;
}

export interface BenefitCapTier {
  performanceThreshold: number;
  monthlyCapAmount: number;
}

export interface BenefitCapStatusInput {
  monthlyCapTiers: BenefitCapTier[];
  previousMonthStructuredPerformance: number;
  currentDiscountUsed: number;
}

export interface BenefitCapStatus {
  autoStatus: BenefitCapAutoStatus;
  autoMonthlyCapAmount: number | null;
  remainingCap: number | null;
  usageRate: number | null;
}

export function savingRate(appliedDiscountAmount: number, approvalAmount: number) {
  if (approvalAmount <= 0) return 0;
  return Math.round((appliedDiscountAmount / approvalAmount) * 1000) / 10;
}

export function calculateCardStatementEstimate(
  input: CardStatementEstimateInput,
): CardStatementEstimate {
  const approvalEstimateTotal = input.structuredApprovalTotal + input.legacyPostingTotal;
  const statementEstimate = input.structuredPostingTotal + input.legacyPostingTotal;
  const effectiveSpend = statementEstimate;
  const statementVsEffectiveDelta = statementEstimate - effectiveSpend;
  const dataQuality = statementDataQuality(input.structuredApprovalTotal, input.legacyPostingTotal);

  return {
    ...input,
    approvalEstimateTotal,
    statementEstimate,
    effectiveSpend,
    statementVsEffectiveDelta,
    dataQuality,
  };
}

export function calculateCardPerformanceEstimate(
  input: CardPerformanceEstimateInput,
): CardPerformanceEstimate {
  const legacyPerformanceEstimateTotal = input.legacyPostingTotal;
  const performanceEstimate = input.structuredPerformanceTotal + legacyPerformanceEstimateTotal;

  return {
    ...input,
    performanceEstimate,
    legacyPerformanceEstimateTotal,
    dataQuality: statementDataQuality(input.structuredPerformanceTotal, input.legacyPostingTotal),
  };
}

export function calculateBenefitCapStatus(input: BenefitCapStatusInput): BenefitCapStatus {
  if (input.monthlyCapTiers.length === 0) {
    return {
      autoStatus: "not_applicable",
      autoMonthlyCapAmount: null,
      remainingCap: null,
      usageRate: null,
    };
  }

  const autoMonthlyCapAmount = resolveCapFromTiers(
    input.monthlyCapTiers,
    input.previousMonthStructuredPerformance,
  );
  if (autoMonthlyCapAmount === null) {
    return {
      autoStatus: "unknown",
      autoMonthlyCapAmount: null,
      remainingCap: null,
      usageRate: null,
    };
  }

  return {
    autoStatus: "ready",
    autoMonthlyCapAmount,
    remainingCap: Math.max(0, autoMonthlyCapAmount - input.currentDiscountUsed),
    usageRate: Math.round((input.currentDiscountUsed / autoMonthlyCapAmount) * 100),
  };
}

function statementDataQuality(structuredApprovalTotal: number, legacyPostingTotal: number): StatementDataQuality {
  if (structuredApprovalTotal > 0 && legacyPostingTotal <= 0) return "structured";
  if (structuredApprovalTotal > 0 && legacyPostingTotal > 0) return "partial_estimate";
  if (structuredApprovalTotal <= 0 && legacyPostingTotal > 0) return "legacy_estimate";
  return "no_data";
}

function resolveCapFromTiers(tiers: BenefitCapTier[], performanceAmount: number) {
  const matched = [...tiers]
    .sort((left, right) => left.performanceThreshold - right.performanceThreshold)
    .filter((tier) => performanceAmount >= tier.performanceThreshold)
    .at(-1);

  return matched?.monthlyCapAmount ?? null;
}
