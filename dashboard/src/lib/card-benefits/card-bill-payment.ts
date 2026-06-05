export type CardBillPaymentStatus = "ready" | "asset_required" | "registered" | "needs_review" | "no_bill";

export interface CardBillRow {
  cardAccountId: string;
  cardName: string;
  billAmount: number;
  useStartDate: number;
  useEndDate: number;
  payDate: number | null;
}

export interface CardBillRecommendedAccount {
  cardAccountId: string;
  assetAccountId: string;
  assetName: string;
}

export interface CardBillRepaymentMatch {
  cardAccountId: string;
  billAmount: number;
  matchCount: number;
}

export interface CardBillPaymentRow extends CardBillRow {
  billMonth: string;
  recommendedAssetAccountId: string | null;
  recommendedAssetName: string | null;
  repaymentStatus: CardBillPaymentStatus;
  statusReason: string;
}

export interface BuildCardBillPaymentRowsInput {
  billMonth: string;
  billRows: CardBillRow[];
  recommendedAccounts: CardBillRecommendedAccount[];
  repaymentMatches: CardBillRepaymentMatch[];
}

export function buildCardBillPaymentRows(input: BuildCardBillPaymentRowsInput): CardBillPaymentRow[] {
  const recommendations = new Map(input.recommendedAccounts.map((account) => [account.cardAccountId, account]));
  const matchCounts = new Map(input.repaymentMatches.map((match) => [repaymentKey(match.cardAccountId, match.billAmount), match.matchCount]));

  return input.billRows.map((bill) => {
    const recommendation = recommendations.get(bill.cardAccountId);
    const matchCount = matchCounts.get(repaymentKey(bill.cardAccountId, bill.billAmount)) ?? 0;
    const status = repaymentStatus({ billAmount: bill.billAmount, matchCount, hasRecommendation: Boolean(recommendation) });

    return {
      ...bill,
      billMonth: input.billMonth,
      recommendedAssetAccountId: recommendation?.assetAccountId ?? null,
      recommendedAssetName: recommendation?.assetName ?? null,
      repaymentStatus: status,
      statusReason: repaymentStatusReason(status, matchCount),
    };
  });
}

function repaymentKey(cardAccountId: string, billAmount: number) {
  return `${cardAccountId}:${Math.round(billAmount)}`;
}

function repaymentStatus({
  billAmount,
  matchCount,
  hasRecommendation,
}: {
  billAmount: number;
  matchCount: number;
  hasRecommendation: boolean;
}): CardBillPaymentStatus {
  if (billAmount <= 0) return "no_bill";
  if (matchCount > 1) return "needs_review";
  if (matchCount === 1) return "registered";
  if (!hasRecommendation) return "asset_required";
  return "ready";
}

function repaymentStatusReason(status: CardBillPaymentStatus, matchCount: number) {
  if (status === "no_bill") return "청구금액이 없습니다.";
  if (status === "needs_review") return `동일 금액 상환 후보가 ${matchCount.toLocaleString("ko-KR")}건 있습니다.`;
  if (status === "registered") return "동일 금액 상환 거래가 있습니다.";
  if (status === "asset_required") return "추천 출금계좌가 없습니다.";
  return "등록 가능";
}
