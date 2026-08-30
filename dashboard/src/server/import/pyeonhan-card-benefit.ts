import type { NormalizedPyeonhanTransaction } from "./pyeonhan-types.ts";

export interface PyeonhanCardBenefitCandidate {
  ruleId: string;
  label: string;
  reason: string;
  discountRateBps: number;
  performanceAmount: number;
  confidence: number;
}

function compact(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

function exactRateDiscount(transaction: NormalizedPyeonhanTransaction, basisPoints: number) {
  return Math.floor(transaction.approvalAmount * basisPoints / 10_000) === transaction.discountAmount;
}

export function identifyPyeonhanCardBenefitCandidate(
  transaction: NormalizedPyeonhanTransaction,
): PyeonhanCardBenefitCandidate | null {
  if (transaction.entryType !== "expense" || transaction.discountAmount <= 0) return null;

  const asset = compact(transaction.sourceAssetName);
  const subcategory = compact(transaction.sourceSubcategoryName);
  const item = compact(transaction.item);
  const memo = compact(transaction.memo);

  if (
    (asset === "하나mg+s" || asset === "하나mgs")
    && subcategory === "구독"
    && /(구독|멤버십|와우)/.test(item)
    && exactRateDiscount(transaction, 5_000)
  ) {
    return {
      ruleId: "hana_mgs_subscription_50p",
      label: "하나 MG+S · 구독 50%",
      reason: "카드·구독 항목·정확한 50% 할인액이 일치합니다.",
      discountRateBps: 5_000,
      performanceAmount: transaction.approvalAmount,
      confidence: 1,
    };
  }

  if (asset === "신한레이디" && exactRateDiscount(transaction, 500)) {
    if (subcategory === "식비") {
      if (!/(점심|아워홈)/.test(`${item}${memo}`)) return null;
      return {
        ruleId: "shinhan_lady_lunch_5p",
        label: "신한 레이디 · 점심 5%",
        reason: "카드·식비 분류·정확한 5% 할인액이 일치합니다.",
        discountRateBps: 500,
        performanceAmount: transaction.approvalAmount,
        confidence: 1,
      };
    }
    if (subcategory === "병원·약국" || subcategory === "병원/약국") {
      return {
        ruleId: "shinhan_lady_medical_5p",
        label: "신한 레이디 · 병원/약국 5%",
        reason: "카드·병원/약국 분류·정확한 5% 할인액이 일치합니다.",
        discountRateBps: 500,
        performanceAmount: transaction.approvalAmount,
        confidence: 1,
      };
    }
  }

  return null;
}
