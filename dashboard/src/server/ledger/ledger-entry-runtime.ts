import {
  assetAccountExists,
  capitalAccountExists,
  creditCardAccountExists,
  expenseCategoryExists,
  incomeCategoryExists,
  ledgerPaymentAccountExists,
  liabilityAccountExists,
} from "../whooing/account-repository.ts";
import {
  buildCardBenefitMonthlyContext,
  getActiveCardBenefitRules,
  insertCardBenefitEvent,
} from "../card-benefits/repository.ts";
import { syncWhooingEntriesForDate } from "../whooing/sync-client.ts";
import { createWhooingEntry } from "../whooing/write-client.ts";
import { ledgerOperationStore } from "./ledger-operation-repository.ts";
import {
  createDashboardLedgerEntry,
  type DashboardLedgerEntryRequest,
} from "./ledger-entry-service.ts";

export function createRuntimeDashboardLedgerEntry(request: DashboardLedgerEntryRequest) {
  return createDashboardLedgerEntry({
    request,
    sectionId: process.env.WHOOING_SECTION_ID,
    dependencies: {
      assertExpenseCategory: expenseCategoryExists,
      assertPaymentAccount: ledgerPaymentAccountExists,
      assertIncomeCategory: incomeCategoryExists,
      assertAssetAccount: assetAccountExists,
      assertLiabilityAccount: liabilityAccountExists,
      assertCreditCardAccount: creditCardAccountExists,
      assertCapitalAccount: capitalAccountExists,
      getActiveCardBenefitRules,
      buildCardBenefitMonthlyContext,
      createEntry: createWhooingEntry,
      syncForDate: syncWhooingEntriesForDate,
      insertCardBenefitEvent,
      operationStore: ledgerOperationStore,
    },
  });
}
