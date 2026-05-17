export type PaymentChannel = "general" | "simple_pay";

export type CardBenefitRule = {
  ruleId: string;
  cardAccountType: "liabilities";
  cardAccountId: string;
  name: string;
  status: "active" | "disabled";
  priority: number;
  paymentChannel: PaymentChannel | null;
  minApprovalAmount: number | null;
  discountType: "rate";
  discountRateBps: number;
  monthlyCapTiers: CardBenefitMonthlyCapTier[];
  postingPolicy: "reduce_expense" | "memo_only" | "separate_income";
};

export type CardBenefitMonthlyCapTier = {
  performanceThreshold: number;
  monthlyCapAmount: number;
};

export type CardBenefitEvaluationInput = {
  occurredDate: string;
  selectedRuleId: string | null;
  cardAccountType: "liabilities";
  cardAccountId: string;
  expenseAccountId?: string;
  merchant: string;
  approvalAmount: number;
  rules: CardBenefitRule[];
  monthlyContext: {
    benefitMonth: string;
    performanceAmount: number;
    capUsedByRule: Record<string, number>;
  };
};

export type CardBenefitEvaluationResult = {
  ruleId: string | null;
  paymentChannel: PaymentChannel | null;
  eligible: boolean;
  reason: string;
  approvalAmount: number;
  performanceAmount: number;
  eligibleDiscountAmount: number;
  appliedDiscountAmount: number;
  postingAmount: number;
  monthlyCapAmount: number | null;
  capUsedBefore: number;
  capUsedAfter: number;
};
