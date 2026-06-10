import { NextRequest, NextResponse } from "next/server";
import { createDashboardLedgerEntry, type DashboardLedgerEntryRequest } from "@/server/ledger/ledger-entry-service";
import {
  expenseCategoryExists,
  ledgerPaymentAccountExists,
} from "@/server/whooing/account-repository";
import {
  buildCardBenefitMonthlyContext,
  getActiveCardBenefitRules,
  insertCardBenefitEvent,
} from "@/server/card-benefits/repository";
import { syncWhooingEntriesForDate } from "@/server/whooing/sync-client";
import { createWhooingEntry } from "@/server/whooing/write-client";

export const runtime = "nodejs";

const sectionId = process.env.WHOOING_SECTION_ID;

export async function POST(request: NextRequest) {
  let payload: DashboardLedgerEntryRequest;
  try {
    payload = await request.json() as DashboardLedgerEntryRequest;
  } catch {
    return NextResponse.json({
      ok: false,
      reason: "invalid_request",
      message: "요청 본문이 올바르지 않습니다.",
      fieldErrors: {},
    }, { status: 400 });
  }

  const result = await createDashboardLedgerEntry({
    request: payload,
    sectionId,
    dependencies: {
      assertExpenseCategory: expenseCategoryExists,
      assertPaymentAccount: ledgerPaymentAccountExists,
      getActiveCardBenefitRules,
      buildCardBenefitMonthlyContext,
      createEntry: createWhooingEntry,
      syncForDate: syncWhooingEntriesForDate,
      insertCardBenefitEvent,
    },
  });

  if (!result.ok) {
    const status = result.reason === "whooing_failed" ? 502 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
