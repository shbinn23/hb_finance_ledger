import { NextResponse } from "next/server";
import { getSlackLedgerEntryAccounts } from "@/server/whooing/account-repository";

export const runtime = "nodejs";

export async function GET() {
  const accounts = await getSlackLedgerEntryAccounts();

  return NextResponse.json({
    expenseCategories: accounts.expenseCategories,
    incomeCategories: accounts.incomeCategories,
    assetAccounts: accounts.assetAccounts,
    liabilityAccounts: accounts.liabilityAccounts,
    paymentAccounts: accounts.paymentAccounts,
    depositAccounts: accounts.assetAccounts,
    transferAccounts: accounts.assetAccounts,
    creditCardAccounts: accounts.creditCardAccounts,
    balanceAdjustmentAccounts: [...accounts.assetAccounts, ...accounts.liabilityAccounts],
    capitalAccounts: accounts.capitalAccounts,
    supportedTypes: ["expense", "income", "transfer", "card_payment", "balance_adjustment"],
    pendingTypes: [],
  });
}
