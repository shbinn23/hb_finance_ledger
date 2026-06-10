import { NextResponse } from "next/server";
import { getSlackLedgerEntryAccounts } from "@/server/whooing/account-repository";

export const runtime = "nodejs";

export async function GET() {
  const accounts = await getSlackLedgerEntryAccounts();

  return NextResponse.json({
    expenseCategories: accounts.expenseCategories,
    paymentAccounts: accounts.paymentAccounts,
    supportedTypes: ["expense"],
    pendingTypes: ["income", "transfer", "card_payment", "balance_adjustment"],
  });
}
