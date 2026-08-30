export type BenefitApprovalStatus =
  | "created"
  | "event_exists"
  | "rejected"
  | "failed";

export interface BenefitApprovalMirrorEntry {
  sectionId: string;
  entryId: number;
  entryDate: number;
  leftAccountType: string;
  leftAccountId: string;
  rightAccountType: string;
  rightAccountId: string;
  amount: number;
}

export interface BenefitApprovalRule {
  ruleId: string;
  cardAccountType: "liabilities";
  cardAccountId: string;
  paymentChannel: "general" | "simple_pay" | null;
  discountRateBps: number;
  performanceAmountPolicy: "approval_amount" | "posting_amount";
}

export interface BenefitApprovalCandidate {
  importRowId: number;
  benefitStatus: string;
  candidateRuleId: string | null;
  sourceIdentityKey: string;
  occurrenceIndex: number;
  occurredDate: string;
  item: string;
  memo: string;
  approvalAmount: number;
  postingAmount: number;
  discountAmount: number;
  mappedCardAccountType: string | null;
  mappedCardAccountId: string | null;
  matchedWhooingEntryId: number | null;
  mirrorEntry: BenefitApprovalMirrorEntry | null;
  rule: BenefitApprovalRule;
  existingEventId: string | null;
}

export interface ImportBenefitEventInsert {
  sectionId: string;
  whooingEntryId: number;
  entryDate: number;
  ruleId: string;
  cardAccountType: "liabilities";
  cardAccountId: string;
  expenseAccountId: string;
  merchant: string;
  paymentChannel: "general" | "simple_pay";
  approvalAmount: number;
  performanceAmount: number;
  eligibleDiscountAmount: number;
  appliedDiscountAmount: number;
  postingAmount: number;
  capUsedBefore: null;
  capUsedAfter: null;
  evaluationStatus: string;
  evaluationReason: string;
  idempotencyKey: string;
}

export interface BenefitApprovalDependencies {
  getCandidate: (importRowId: number) => Promise<BenefitApprovalCandidate | null>;
  createEvent: (event: ImportBenefitEventInsert) => Promise<string | null>;
  updateBenefitStatus: (input: {
    importRowId: number;
    status: "needs_review" | "approved" | "event_exists" | "created" | "failed";
    eventId?: string | null;
    reason: string;
  }) => Promise<void>;
}

export interface BenefitApprovalResult {
  ok: boolean;
  status: BenefitApprovalStatus;
  benefitStatus: string;
  eventId: string | null;
  message: string;
}

function rejected(message: string): BenefitApprovalResult {
  return { ok: false, status: "rejected", benefitStatus: "needs_review", eventId: null, message };
}

function compactDate(value: string) {
  return Number(value.replaceAll("-", ""));
}

export async function approvePyeonhanBenefitCandidate(
  input: { importRowId: number; ruleId: string },
  dependencies: BenefitApprovalDependencies,
): Promise<BenefitApprovalResult> {
  const candidate = await dependencies.getCandidate(input.importRowId);
  if (!candidate) return rejected("카드혜택 import row를 찾을 수 없습니다.");
  if (candidate.candidateRuleId !== input.ruleId) return rejected("검토 저장된 rule과 요청 rule이 다릅니다.");
  if (candidate.existingEventId) {
    await dependencies.updateBenefitStatus({
      importRowId: input.importRowId,
      status: "event_exists",
      eventId: candidate.existingEventId,
      reason: "동일한 Whooing 거래에 카드혜택 event가 이미 있습니다.",
    });
    return {
      ok: true,
      status: "event_exists",
      benefitStatus: "event_exists",
      eventId: candidate.existingEventId,
      message: "기존 카드혜택 event가 있어 중복 생성하지 않았습니다.",
    };
  }
  const mirror = candidate.mirrorEntry;
  if (!mirror || candidate.matchedWhooingEntryId !== mirror.entryId) {
    return rejected("매칭된 Whooing mirror 거래를 확인할 수 없습니다.");
  }
  if (
    candidate.approvalAmount <= 0
    || candidate.postingAmount <= 0
    || candidate.approvalAmount < candidate.postingAmount
    || candidate.discountAmount !== candidate.approvalAmount - candidate.postingAmount
  ) {
    return rejected("승인금액·매입금액·할인금액 무결성 검증에 실패했습니다.");
  }
  if (
    candidate.mappedCardAccountType !== "liabilities"
    || candidate.mappedCardAccountId !== mirror.rightAccountId
    || mirror.rightAccountType !== "liabilities"
    || mirror.leftAccountType !== "expenses"
    || mirror.amount !== candidate.postingAmount
    || mirror.entryDate !== compactDate(candidate.occurredDate)
  ) {
    return rejected("카드 mapping과 Whooing 거래의 날짜·계정·매입금액이 일치하지 않습니다.");
  }
  const rule = candidate.rule;
  if (
    rule.ruleId !== input.ruleId
    || rule.cardAccountType !== candidate.mappedCardAccountType
    || rule.cardAccountId !== candidate.mappedCardAccountId
  ) {
    return rejected("선택한 카드혜택 rule이 거래 카드와 일치하지 않습니다.");
  }
  const eligibleDiscountAmount = Math.floor(candidate.approvalAmount * rule.discountRateBps / 10_000);
  if (eligibleDiscountAmount !== candidate.discountAmount) {
    return rejected("저장된 할인액이 선택한 rule의 할인율과 일치하지 않습니다.");
  }

  const performanceAmount = rule.performanceAmountPolicy === "posting_amount"
    ? candidate.postingAmount
    : candidate.approvalAmount;
  const idempotencyKey = `pyeonhan-benefit:${candidate.sourceIdentityKey}:${candidate.occurrenceIndex}`;
  await dependencies.updateBenefitStatus({
    importRowId: input.importRowId,
    status: "approved",
    reason: "운영자가 카드혜택 후보를 승인했습니다.",
  });
  try {
    const eventId = await dependencies.createEvent({
      sectionId: mirror.sectionId,
      whooingEntryId: mirror.entryId,
      entryDate: mirror.entryDate,
      ruleId: rule.ruleId,
      cardAccountType: "liabilities",
      cardAccountId: rule.cardAccountId,
      expenseAccountId: mirror.leftAccountId,
      merchant: candidate.item,
      paymentChannel: rule.paymentChannel ?? "general",
      approvalAmount: candidate.approvalAmount,
      performanceAmount,
      eligibleDiscountAmount,
      appliedDiscountAmount: candidate.discountAmount,
      postingAmount: candidate.postingAmount,
      capUsedBefore: null,
      capUsedAfter: null,
      evaluationStatus: "import_approved",
      evaluationReason: `pyeonhan_import:${candidate.sourceIdentityKey}`,
      idempotencyKey,
    });
    if (!eventId) {
      await dependencies.updateBenefitStatus({
        importRowId: input.importRowId,
        status: "event_exists",
        reason: "동시 승인 또는 기존 event로 인해 중복 insert를 건너뛰었습니다.",
      });
      return {
        ok: true,
        status: "event_exists",
        benefitStatus: "event_exists",
        eventId: null,
        message: "동일 카드혜택 event가 있어 중복 생성하지 않았습니다.",
      };
    }
    await dependencies.updateBenefitStatus({
      importRowId: input.importRowId,
      status: "created",
      eventId,
      reason: "카드혜택 event 생성 완료",
    });
    return {
      ok: true,
      status: "created",
      benefitStatus: "created",
      eventId,
      message: "카드혜택 event를 생성했습니다. 후잉 원장은 변경하지 않았습니다.",
    };
  } catch {
    await dependencies.updateBenefitStatus({
      importRowId: input.importRowId,
      status: "failed",
      reason: "카드혜택 event 생성 실패",
    });
    return {
      ok: false,
      status: "failed",
      benefitStatus: "failed",
      eventId: null,
      message: "카드혜택 event 생성에 실패했습니다. 후잉 원장은 변경되지 않았습니다.",
    };
  }
}
