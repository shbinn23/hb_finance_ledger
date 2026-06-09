import { NextRequest, NextResponse } from "next/server";
import { registerCardBillPayment, type CardBillPaymentRequest } from "@/features/cards/bill-payment-action";
import {
  assetAccountExists,
  countCardBillRepaymentMatches,
  creditCardAccountExists,
} from "@/server/card-benefits/repository";
import { syncWhooingEntriesForDate } from "@/server/whooing/sync-client";
import { createWhooingEntry } from "@/server/whooing/write-client";
import { getWhooingCreditCardBillRows } from "@/server/whooing/bill-repository";

export const runtime = "nodejs";

const sectionId = process.env.WHOOING_SECTION_ID;

export async function POST(request: NextRequest) {
  let payload: CardBillPaymentRequest;
  try {
    payload = await request.json() as CardBillPaymentRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  const result = await registerCardBillPayment({
    request: payload,
    sectionId,
    dependencies: {
      getBillRows: getWhooingCreditCardBillRows,
      assertAssetAccount: assetAccountExists,
      assertCreditCardAccount: creditCardAccountExists,
      countDuplicateRepayments: countCardBillRepaymentMatches,
      createEntry: createWhooingEntry,
      syncForDate: syncWhooingEntriesForDate,
    },
  });

  if (!result.ok) {
    const status = result.reason === "duplicate_repayment" ? 409 : 400;
    return NextResponse.json({ ok: false, error: result.message, reason: result.reason }, { status });
  }

  return NextResponse.json(result);
}
