import type { CardBenefitEvaluationInput } from "@/lib/card-benefits/types";

export function entryDateRangeForBenefitMonth(benefitMonth: string) {
  if (!/^\d{4}-\d{2}$/.test(benefitMonth)) {
    throw new Error("benefitMonth must be YYYY-MM");
  }

  const [year, month] = benefitMonth.split("-").map(Number);
  const startDate = year * 10_000 + month * 100 + 1;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = nextYear * 10_000 + nextMonth * 100 + 1;

  return { startDate, endDate };
}

export function monthlyContextFromAutomaticPerformance({
  benefitMonth,
  performanceAmount,
  capUsedByRule,
}: {
  benefitMonth: string;
  performanceAmount: number;
  capUsedByRule: Record<string, number>;
}): CardBenefitEvaluationInput["monthlyContext"] {
  return {
    benefitMonth,
    performanceAmount,
    capUsedByRule,
  };
}
