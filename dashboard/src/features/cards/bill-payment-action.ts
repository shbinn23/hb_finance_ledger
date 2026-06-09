type WhooingEntryPayload = {
  section_id: string;
  entry_date: string;
  l_account: "liabilities";
  l_account_id: string;
  r_account: "assets";
  r_account_id: string;
  item: string;
  money: number;
  memo: string;
};

interface CreditCardBillRow {
  accountId: string;
  amount: number;
  startUseDate: number;
  endUseDate: number;
  payDate: number | null;
}

export interface CardBillPaymentRequest {
  billMonth: string;
  cardAccountId: string;
  assetAccountId: string;
  amount: number;
  payDate: string;
}

export interface RegisterCardBillPaymentDependencies {
  getBillRows: (billMonth: string) => Promise<CreditCardBillRow[]>;
  assertAssetAccount: (assetAccountId: string) => Promise<boolean>;
  assertCreditCardAccount: (cardAccountId: string) => Promise<boolean>;
  countDuplicateRepayments: (input: {
    billMonth: string;
    cardAccountId: string;
    amount: number;
  }) => Promise<number>;
  createEntry: (payload: WhooingEntryPayload) => Promise<unknown>;
  syncForDate: (payDate: string) => Promise<unknown>;
}

export type RegisterCardBillPaymentResult =
  | {
    ok: true;
    entryId: number | null;
    syncStatus: "synced" | "pending";
  }
  | {
    ok: false;
    reason:
      | "invalid_request"
      | "invalid_account"
      | "bill_not_found"
      | "bill_amount_mismatch"
      | "duplicate_repayment"
      | "whooing_failed";
    message: string;
  };

export function buildCardBillPaymentEntryMemo({
  billMonth,
  cardAccountId,
  useStartDate,
  useEndDate,
}: {
  billMonth: string;
  cardAccountId: string;
  useStartDate: number;
  useEndDate: number;
}) {
  return [
    "[CARD_BILL]",
    `bill_month=${billMonth.replace("-", "")};`,
    `card=${cardAccountId};`,
    `use_period=${useStartDate}-${useEndDate}`,
  ].join(" ");
}

export function buildCardBillPaymentEntryPayload({
  sectionId,
  payDate,
  cardAccountId,
  assetAccountId,
  amount,
  billMonth,
  useStartDate,
  useEndDate,
}: {
  sectionId: string;
  payDate: string;
  cardAccountId: string;
  assetAccountId: string;
  amount: number;
  billMonth: string;
  useStartDate: number;
  useEndDate: number;
}): WhooingEntryPayload {
  return {
    section_id: sectionId,
    entry_date: payDate.replaceAll("-", ""),
    l_account: "liabilities",
    l_account_id: cardAccountId,
    r_account: "assets",
    r_account_id: assetAccountId,
    item: "카드대금 상환",
    money: amount,
    memo: buildCardBillPaymentEntryMemo({ billMonth, cardAccountId, useStartDate, useEndDate }),
  };
}

export async function registerCardBillPayment({
  request,
  sectionId,
  dependencies,
}: {
  request: CardBillPaymentRequest;
  sectionId: string | undefined;
  dependencies: RegisterCardBillPaymentDependencies;
}): Promise<RegisterCardBillPaymentResult> {
  if (!isValidRequest(request) || !sectionId) {
    return { ok: false, reason: "invalid_request", message: "상환 요청값이 올바르지 않습니다." };
  }

  const [isAssetAccount, isCreditCardAccount] = await Promise.all([
    dependencies.assertAssetAccount(request.assetAccountId),
    dependencies.assertCreditCardAccount(request.cardAccountId),
  ]);
  if (!isAssetAccount || !isCreditCardAccount) {
    return { ok: false, reason: "invalid_account", message: "카드 또는 출금계좌가 올바르지 않습니다." };
  }

  const bill = (await dependencies.getBillRows(request.billMonth))
    .find((row) => row.accountId === request.cardAccountId);
  if (!bill) {
    return { ok: false, reason: "bill_not_found", message: "후잉 Bill에서 해당 카드 청구액을 찾지 못했습니다." };
  }
  if (Math.round(bill.amount) !== Math.round(request.amount)) {
    return { ok: false, reason: "bill_amount_mismatch", message: "요청 금액이 후잉 Bill 청구액과 다릅니다." };
  }

  const duplicateCount = await dependencies.countDuplicateRepayments({
    billMonth: request.billMonth,
    cardAccountId: request.cardAccountId,
    amount: request.amount,
  });
  if (duplicateCount > 0) {
    return { ok: false, reason: "duplicate_repayment", message: "이미 같은 카드대금 상환 거래가 있습니다." };
  }

  const payload = buildCardBillPaymentEntryPayload({
    sectionId,
    payDate: request.payDate,
    cardAccountId: request.cardAccountId,
    assetAccountId: request.assetAccountId,
    amount: request.amount,
    billMonth: request.billMonth,
    useStartDate: bill.startUseDate,
    useEndDate: bill.endUseDate,
  });

  try {
    const response = await dependencies.createEntry(payload);
    let syncStatus: "synced" | "pending" = "synced";
    try {
      await dependencies.syncForDate(request.payDate);
    } catch {
      syncStatus = "pending";
    }

    return {
      ok: true,
      entryId: extractEntryId(response),
      syncStatus,
    };
  } catch {
    return { ok: false, reason: "whooing_failed", message: "후잉 카드대금 상환 등록에 실패했습니다." };
  }
}

function isValidRequest(request: CardBillPaymentRequest) {
  return /^\d{4}-\d{2}$/.test(request.billMonth)
    && /^\d{4}-\d{2}-\d{2}$/.test(request.payDate)
    && /^x\d+/.test(request.cardAccountId)
    && /^x\d+/.test(request.assetAccountId)
    && Number.isInteger(request.amount)
    && request.amount > 0;
}

function extractEntryId(response: unknown): number | null {
  const value = response as {
    results?: {
      entry_id?: unknown;
      id?: unknown;
      rows?: Array<{ entry_id?: unknown }>;
    } | Array<{ entry_id?: unknown }>;
  };
  const candidates = [
    Array.isArray(value.results) ? value.results[0]?.entry_id : undefined,
    Array.isArray(value.results) ? undefined : value.results?.entry_id,
    Array.isArray(value.results) ? undefined : value.results?.id,
    Array.isArray(value.results) ? undefined : value.results?.rows?.[0]?.entry_id,
  ];
  const entryId = candidates.map(Number).find((candidate) => Number.isInteger(candidate) && candidate > 0);
  return entryId ?? null;
}
