import type { NormalizedPyeonhanTransaction } from "./pyeonhan-types.ts";
import type { CardBenefitRule } from "../../lib/card-benefits/types.ts";

export interface PyeonhanCardBenefitCandidate {
  ruleId: string;
  label: string;
  reason: string;
  discountRateBps: number;
  performanceAmount: number;
  confidence: number;
  matchKind?: "exact" | "cap_limited";
}

export type ImportBenefitResolutionStatus =
  | "not_applicable"
  | "rule_matched"
  | "rule_selection_required"
  | "rule_unknown";

export interface ImportMappedCard {
  accountType: string;
  accountId: string;
}

export interface PyeonhanCardBenefitResolution {
  status: ImportBenefitResolutionStatus;
  selectedRuleId: string | null;
  candidates: PyeonhanCardBenefitCandidate[];
}

function compact(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

function exactRateDiscount(transaction: NormalizedPyeonhanTransaction, basisPoints: number) {
  return Math.floor(transaction.approvalAmount * basisPoints / 10_000) === transaction.discountAmount;
}

function candidateFromRule(
  transaction: NormalizedPyeonhanTransaction,
  rule: CardBenefitRule,
  matchKind: "exact" | "cap_limited",
): PyeonhanCardBenefitCandidate {
  return {
    ruleId: rule.ruleId,
    label: rule.name,
    reason: matchKind === "exact"
      ? `카드와 실제 할인액이 ${rule.discountRateBps / 100}% rule에 일치합니다.`
      : `기록된 할인액이 ${rule.discountRateBps / 100}% 이론 할인보다 작아 한도 소진 후보입니다.`,
    discountRateBps: rule.discountRateBps,
    performanceAmount: transaction.approvalAmount,
    confidence: matchKind === "exact" ? 1 : 0.7,
    matchKind,
  };
}

export function resolvePyeonhanCardBenefitCandidates(
  transaction: NormalizedPyeonhanTransaction,
  mappedCard: ImportMappedCard | null,
  rules: CardBenefitRule[],
): PyeonhanCardBenefitResolution {
  if (
    transaction.entryType !== "expense"
    || transaction.approvalAmount <= transaction.postingAmount
    || transaction.discountAmount !== transaction.approvalAmount - transaction.postingAmount
  ) {
    return { status: "not_applicable", selectedRuleId: null, candidates: [] };
  }
  if (!mappedCard || mappedCard.accountType !== "liabilities") {
    return { status: "rule_unknown", selectedRuleId: null, candidates: [] };
  }

  const eligibleRules = rules.filter((rule) => (
    rule.status === "active"
    && rule.cardAccountType === mappedCard.accountType
    && rule.cardAccountId === mappedCard.accountId
    && (rule.minApprovalAmount === null || transaction.approvalAmount >= rule.minApprovalAmount)
  )).sort((left, right) => left.priority - right.priority || left.ruleId.localeCompare(right.ruleId));
  const exact = eligibleRules
    .filter((rule) => exactRateDiscount(transaction, rule.discountRateBps))
    .map((rule) => candidateFromRule(transaction, rule, "exact"));
  if (exact.length === 1) {
    return { status: "rule_matched", selectedRuleId: exact[0].ruleId, candidates: exact };
  }
  if (exact.length > 1) {
    return { status: "rule_selection_required", selectedRuleId: null, candidates: exact };
  }

  const capLimited = eligibleRules.filter((rule) => {
    const theoretical = Math.floor(transaction.approvalAmount * rule.discountRateBps / 10_000);
    return rule.monthlyCapTiers.length > 0
      && transaction.discountAmount > 0
      && transaction.discountAmount < theoretical;
  }).map((rule) => candidateFromRule(transaction, rule, "cap_limited"));
  return capLimited.length > 0
    ? { status: "rule_selection_required", selectedRuleId: null, candidates: capLimited }
    : { status: "rule_unknown", selectedRuleId: null, candidates: [] };
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
