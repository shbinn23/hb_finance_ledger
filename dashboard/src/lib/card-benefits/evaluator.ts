import type {
  CardBenefitEvaluationInput,
  CardBenefitEvaluationResult,
  CardBenefitMonthlyCapTier,
} from "./types";

function noBenefitResult(
  input: CardBenefitEvaluationInput,
  reason: string,
  overrides: Partial<CardBenefitEvaluationResult> = {},
): CardBenefitEvaluationResult {
  return {
    ruleId: null,
    paymentChannel: null,
    eligible: false,
    reason,
    approvalAmount: input.approvalAmount,
    performanceAmount: input.approvalAmount,
    eligibleDiscountAmount: 0,
    appliedDiscountAmount: 0,
    postingAmount: input.approvalAmount,
    monthlyCapAmount: null,
    capUsedBefore: 0,
    capUsedAfter: 0,
    ...overrides,
  };
}

export function resolveMonthlyCap(
  tiers: CardBenefitMonthlyCapTier[],
  performanceAmount: number,
): number | null {
  const matched = [...tiers]
    .sort((left, right) => left.performanceThreshold - right.performanceThreshold)
    .filter((tier) => performanceAmount >= tier.performanceThreshold)
    .at(-1);

  return matched?.monthlyCapAmount ?? null;
}

export function toBpsDiscountAmount(amount: number, bps: number) {
  return Math.floor((amount * bps) / 10_000);
}

export function evaluateCardBenefit(input: CardBenefitEvaluationInput): CardBenefitEvaluationResult {
  if (!Number.isInteger(input.approvalAmount) || input.approvalAmount <= 0) {
    return noBenefitResult(input, "invalid_approval_amount");
  }

  if (!input.selectedRuleId || input.selectedRuleId === "none") {
    return noBenefitResult(input, "no_selected_rule");
  }

  const rule = input.rules.find((item) => item.ruleId === input.selectedRuleId);
  if (!rule) {
    return noBenefitResult(input, "rule_not_found");
  }

  const ruleMetadata = {
    ruleId: rule.ruleId,
    paymentChannel: rule.paymentChannel,
  };

  if (rule.status !== "active") {
    return noBenefitResult(input, "disabled_rule", ruleMetadata);
  }

  if (rule.cardAccountType !== input.cardAccountType || rule.cardAccountId !== input.cardAccountId) {
    return noBenefitResult(input, "card_account_mismatch", ruleMetadata);
  }

  if (rule.minApprovalAmount !== null && input.approvalAmount < rule.minApprovalAmount) {
    return noBenefitResult(input, "below_min_approval_amount", ruleMetadata);
  }

  const requiresMonthlyCap = rule.monthlyCapTiers.length > 0;
  const monthlyCapAmount = resolveMonthlyCap(
    rule.monthlyCapTiers,
    input.monthlyContext.performanceAmount,
  );
  const hasMonthlyCap = monthlyCapAmount !== null;
  if (requiresMonthlyCap && monthlyCapAmount === null) {
    return noBenefitResult(input, "automatic_cap_unavailable", ruleMetadata);
  }

  const capUsedBefore = input.monthlyContext.capUsedByRule[rule.ruleId] ?? 0;
  const remainingCap = hasMonthlyCap ? Math.max(0, monthlyCapAmount - capUsedBefore) : Number.POSITIVE_INFINITY;
  if (remainingCap <= 0) {
    return noBenefitResult(input, "monthly_cap_exhausted", {
      ...ruleMetadata,
      monthlyCapAmount,
      capUsedBefore,
      capUsedAfter: capUsedBefore,
    });
  }

  const eligibleDiscountAmount = toBpsDiscountAmount(input.approvalAmount, rule.discountRateBps);
  const appliedDiscountAmount = Math.min(eligibleDiscountAmount, remainingCap);
  const capUsedAfter = capUsedBefore + appliedDiscountAmount;

  return {
    ruleId: rule.ruleId,
    paymentChannel: rule.paymentChannel,
    eligible: appliedDiscountAmount > 0,
    reason: appliedDiscountAmount > 0 ? "eligible" : "no_discount_amount",
    approvalAmount: input.approvalAmount,
    performanceAmount: input.approvalAmount,
    eligibleDiscountAmount,
    appliedDiscountAmount,
    postingAmount: input.approvalAmount - appliedDiscountAmount,
    monthlyCapAmount,
    capUsedBefore,
    capUsedAfter: hasMonthlyCap ? capUsedAfter : capUsedBefore,
  };
}
