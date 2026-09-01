import type { CardBenefitRule } from "../../lib/card-benefits/types.ts";
import type { NormalizedPyeonhanTransaction } from "./pyeonhan-types.ts";

export type BenefitAmountSource = "excel" | "rule_reconstructed";
export type BenefitDiscountSource = "none" | "excel_difference" | "rule_reconstructed";

export interface BenefitReplayEvent {
  occurredDate: string;
  ruleId: string;
  cardAccountId: string;
  appliedDiscountAmount: number;
}

export interface BenefitReconstructionRow {
  transaction: NormalizedPyeonhanTransaction;
  mappedCard: { accountType: string; accountId: string } | null;
}

export interface BenefitReconstructionResult extends BenefitReconstructionRow {
  status: "unchanged" | "reconstructed" | "review";
  selectedRuleId: string | null;
  approvalSource: BenefitAmountSource;
  discountSource: BenefitDiscountSource;
  reason: string;
  confidence: number;
}

function capKey(rule: CardBenefitRule) {
  return rule.capUsageRuleId || rule.ruleId;
}

function monthOf(date: string) {
  return date.slice(0, 7);
}

function ruleContextMatches(transaction: NormalizedPyeonhanTransaction, rule: CardBenefitRule) {
  const evidence = `${transaction.sourceSubcategoryName ?? ""} ${transaction.item} ${transaction.memo}`
    .replace(/\s+/g, "")
    .toLocaleLowerCase("ko-KR");
  if (rule.ruleId.includes("subscription")) return /(구독|멤버십|와우)/.test(evidence);
  if (rule.ruleId === "shinhan_lady_lunch_5p") return /(점심|아워홈)/.test(evidence);
  if (rule.ruleId === "shinhan_lady_medical_5p") return /(병원|약국)/.test(evidence);
  if (rule.ruleId === "shinhan_lady_shopping_3p") return /(쇼핑|백화점|마트)/.test(evidence);
  if (rule.paymentChannel === "simple_pay") {
    return /(kcp|kicc|toss|카카오페이|네이버페이|나이스|nice)/.test(evidence);
  }
  return true;
}

function inverseApprovalCandidates(postingAmount: number, rateBps: number, remainingCap: number) {
  if (rateBps <= 0 || rateBps >= 10_000 || remainingCap <= 0) return [];
  const uncappedMaximum = Math.ceil(postingAmount * 10_000 / (10_000 - rateBps)) + 2;
  const uncappedPosting = (approval: number) => approval - Math.floor(approval * rateBps / 10_000);
  const boundary = (target: number, strict: boolean) => {
    let low = postingAmount + 1;
    let high = uncappedMaximum;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const value = uncappedPosting(middle);
      if (strict ? value > target : value >= target) high = middle;
      else low = middle + 1;
    }
    return low;
  };
  const first = boundary(postingAmount, false);
  const afterLast = boundary(postingAmount, true);
  const candidates: number[] = [];
  for (let approval = first; approval < afterLast; approval += 1) {
    const theoretical = Math.floor(approval * rateBps / 10_000);
    if (!Number.isFinite(remainingCap) || theoretical < remainingCap) candidates.push(approval);
  }
  if (Number.isFinite(remainingCap)) {
    const cappedApproval = postingAmount + remainingCap;
    if (Math.floor(cappedApproval * rateBps / 10_000) >= remainingCap) {
      candidates.push(cappedApproval);
    }
  }
  return [...new Set(candidates)];
}

function sameDayAmbiguousRows(rows: BenefitReconstructionRow[], rules: CardBenefitRule[]) {
  const counts = new Map<string, number>();
  rows.forEach(({ transaction, mappedCard }) => {
    if (!mappedCard || transaction.entryType !== "expense") return;
    const keys = new Set(rules.filter((rule) => (
      rule.status === "active"
      && rule.cardAccountId === mappedCard.accountId
      && rule.monthlyCapTiers.length > 0
      && ruleContextMatches(transaction, rule)
    )).map((rule) => `${transaction.occurredDate}:${mappedCard.accountId}:${capKey(rule)}`));
    keys.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1));
  });
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

export function reconstructPyeonhanBenefitAmounts({
  rows,
  rules,
  monthlyCaps,
  existingEvents,
}: {
  rows: BenefitReconstructionRow[];
  rules: CardBenefitRule[];
  monthlyCaps: Record<string, number | null>;
  existingEvents: BenefitReplayEvent[];
}): BenefitReconstructionResult[] {
  const capUsed = new Map<string, number>();
  const uncertainUsageKeys = new Set<string>();
  const orderedEvents = [...existingEvents].sort((left, right) => left.occurredDate.localeCompare(right.occurredDate));
  const firstTransactionDate = rows.reduce(
    (first, row) => first === null || row.transaction.occurredDate < first ? row.transaction.occurredDate : first,
    null as string | null,
  );
  orderedEvents.forEach((event) => {
    if (firstTransactionDate === null || event.occurredDate < firstTransactionDate) return;
    const eventRule = rules.find((rule) => (
      rule.ruleId === event.ruleId && rule.cardAccountId === event.cardAccountId
    ));
    if (eventRule) uncertainUsageKeys.add(`${monthOf(event.occurredDate)}:${capKey(eventRule)}`);
  });
  let eventIndex = 0;
  const ambiguous = sameDayAmbiguousRows(rows, rules);
  const ordered = rows.map((row, index) => ({ row, index })).sort((left, right) => (
    left.row.transaction.occurredDate.localeCompare(right.row.transaction.occurredDate)
    || (left.row.transaction.sourceRowIndexes[0] ?? 0) - (right.row.transaction.sourceRowIndexes[0] ?? 0)
  ));
  const results: BenefitReconstructionResult[] = new Array(rows.length);

  ordered.forEach(({ row, index }) => {
    const { transaction, mappedCard } = row;
    while (orderedEvents[eventIndex]?.occurredDate < transaction.occurredDate) {
      const event = orderedEvents[eventIndex];
      const eventRule = rules.find((candidate) => (
        candidate.ruleId === event.ruleId && candidate.cardAccountId === event.cardAccountId
      ));
      if (eventRule) {
        const key = `${monthOf(event.occurredDate)}:${capKey(eventRule)}`;
        capUsed.set(key, (capUsed.get(key) ?? 0) + event.appliedDiscountAmount);
      }
      eventIndex += 1;
    }
    const excelDiscount = transaction.approvalAmount - transaction.postingAmount;
    const cardRules = mappedCard?.accountType === "liabilities"
      ? rules.filter((rule) => rule.status === "active" && rule.cardAccountId === mappedCard.accountId)
      : [];
    const eligibleRules = cardRules.filter((rule) => (
        rule.status === "active"
        && ruleContextMatches(transaction, rule)
      ));
    if (excelDiscount > 0) {
      const matchingRules = eligibleRules.filter((rule) => {
        const month = monthOf(transaction.occurredDate);
        const monthlyCap = rule.monthlyCapTiers.length > 0
          ? monthlyCaps[`${month}:${rule.ruleId}`]
          : Number.POSITIVE_INFINITY;
        if (monthlyCap === undefined || monthlyCap === null) return false;
        const usageKey = `${month}:${capKey(rule)}`;
        const remainingCap = Number.isFinite(monthlyCap)
          ? Math.max(0, monthlyCap - (capUsed.get(usageKey) ?? 0))
          : Number.POSITIVE_INFINITY;
        return Math.min(
          Math.floor(transaction.approvalAmount * rule.discountRateBps / 10_000),
          remainingCap,
        ) === excelDiscount;
      });
      if (matchingRules.length === 1) {
        const usageKey = `${monthOf(transaction.occurredDate)}:${capKey(matchingRules[0])}`;
        capUsed.set(usageKey, (capUsed.get(usageKey) ?? 0) + excelDiscount);
      } else if (matchingRules.length > 1) {
        matchingRules.forEach((rule) => {
          uncertainUsageKeys.add(`${monthOf(transaction.occurredDate)}:${capKey(rule)}`);
        });
      } else {
        cardRules.filter((rule) => rule.monthlyCapTiers.length > 0).forEach((rule) => {
          uncertainUsageKeys.add(`${monthOf(transaction.occurredDate)}:${capKey(rule)}`);
        });
      }
      results[index] = {
        ...row,
        status: "unchanged",
        selectedRuleId: null,
        approvalSource: "excel",
        discountSource: "excel_difference",
        reason: "Excel 승인금액과 KRW 차이를 사용했습니다.",
        confidence: 1,
      };
      return;
    }
    if (transaction.entryType !== "expense" || !mappedCard || mappedCard.accountType !== "liabilities") {
      results[index] = {
        ...row,
        status: "unchanged",
        selectedRuleId: null,
        approvalSource: "excel",
        discountSource: "none",
        reason: "카드 할인 복원 대상이 아닙니다.",
        confidence: 1,
      };
      return;
    }

    const orderIsAmbiguous = eligibleRules.some((rule) => (
      ambiguous.has(`${transaction.occurredDate}:${mappedCard.accountId}:${capKey(rule)}`)
    ));
    if (orderIsAmbiguous) {
      results[index] = {
        ...row,
        status: "review",
        selectedRuleId: null,
        approvalSource: "excel",
        discountSource: "none",
        reason: "같은 날짜의 한도 민감 거래 순서를 확정할 수 없어 자동 복원하지 않았습니다.",
        confidence: 0,
      };
      return;
    }
    if (eligibleRules.some((rule) => uncertainUsageKeys.has(`${monthOf(transaction.occurredDate)}:${capKey(rule)}`))) {
      results[index] = {
        ...row,
        status: "review",
        selectedRuleId: null,
        approvalSource: "excel",
        discountSource: "none",
        reason: "앞선 거래의 공유 한도 rule을 확정할 수 없어 잔여 한도 replay가 불확실합니다.",
        confidence: 0,
      };
      return;
    }

    const candidates = eligibleRules.flatMap((rule) => {
      const month = monthOf(transaction.occurredDate);
      const monthlyCap = rule.monthlyCapTiers.length > 0
        ? monthlyCaps[`${month}:${rule.ruleId}`]
        : Number.POSITIVE_INFINITY;
      if (monthlyCap === undefined || monthlyCap === null) return [];
      const usageKey = `${month}:${capKey(rule)}`;
      const remainingCap = Number.isFinite(monthlyCap)
        ? Math.max(0, monthlyCap - (capUsed.get(usageKey) ?? 0))
        : Number.POSITIVE_INFINITY;
      return inverseApprovalCandidates(transaction.postingAmount, rule.discountRateBps, remainingCap)
        .filter((approvalAmount) => rule.minApprovalAmount === null || approvalAmount >= rule.minApprovalAmount)
        .map((approvalAmount) => ({ rule, approvalAmount, remainingCap, usageKey }));
    });
    const uniqueCandidate = candidates.length === 1 ? candidates[0] : null;
    const uniquelyProvesCapExhaustion = uniqueCandidate !== null
      && Number.isFinite(uniqueCandidate.remainingCap)
      && uniqueCandidate.approvalAmount - transaction.postingAmount === uniqueCandidate.remainingCap;
    if (!uniqueCandidate || !uniquelyProvesCapExhaustion) {
      results[index] = {
        ...row,
        status: candidates.length > 0 ? "review" : "unchanged",
        selectedRuleId: null,
        approvalSource: "excel",
        discountSource: "none",
        reason: candidates.length > 1
          ? `승인금액 복원 후보가 ${candidates.length}개여서 자동 복원하지 않았습니다.`
          : candidates.length === 1
            ? "역산 후보는 있지만 잔여 한도 소진이 증명되지 않아 자동 복원하지 않았습니다."
          : "유일한 카드 할인 복원 근거가 없습니다.",
        confidence: candidates.length > 0 ? 0 : 1,
      };
      return;
    }

    const candidate = uniqueCandidate;
    const discountAmount = candidate.approvalAmount - transaction.postingAmount;
    const reconstructed = {
      ...transaction,
      approvalAmount: candidate.approvalAmount,
      discountAmount,
    };
    capUsed.set(candidate.usageKey, (capUsed.get(candidate.usageKey) ?? 0) + discountAmount);
    results[index] = {
      transaction: reconstructed,
      mappedCard,
      status: "reconstructed",
      selectedRuleId: candidate.rule.ruleId,
      approvalSource: "rule_reconstructed",
      discountSource: "rule_reconstructed",
      reason: Number.isFinite(candidate.remainingCap)
        ? `${candidate.rule.name}와 거래 직전 잔여 한도 ${candidate.remainingCap.toLocaleString("ko-KR")}원으로 승인금액을 복원했습니다.`
        : `${candidate.rule.name} ${candidate.rule.discountRateBps / 100}%로 승인금액을 복원했습니다.`,
      confidence: 1,
    };
  });
  return results;
}
