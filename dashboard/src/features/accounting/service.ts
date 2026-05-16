import {
  getAvailableAccountingMonths,
  getAccountingAssetDeltaRows,
  getAccountingCashFlowRows,
  getAccountingDrillDownEntries,
  getAccountingKindDistributionRows,
  getAccountingLiabilityDeltaRows,
  getAccountingProfitLossRows,
} from "@/server/whooing/accounting-repository";
import { buildPeriodOptions, resolvePeriod, type PeriodQuery } from "@/lib/period-filter";
import { buildAccountingViewModel } from "./model";

export async function getAccountingViewModel(options: { periodQuery?: PeriodQuery } = {}) {
  const accountingMonths = await getAvailableAccountingMonths();
  const periodOptions = buildPeriodOptions(accountingMonths);
  const selectedPeriod = resolvePeriod(options.periodQuery ?? { period: "month" }, periodOptions);
  const selectedMonth = selectedPeriod.month ?? accountingMonths[0]?.value ?? "";
  const selectedMonthLabel = selectedPeriod.label;
  const [
    profitLossRows,
    rawCashFlowRows,
    assetDeltaRows,
    liabilityDeltaRows,
    rawKindDistributionRows,
    drillDownEntries,
  ] = await Promise.all([
    getAccountingProfitLossRows(selectedPeriod),
    getAccountingCashFlowRows(selectedPeriod),
    getAccountingAssetDeltaRows(selectedPeriod),
    getAccountingLiabilityDeltaRows(selectedPeriod),
    getAccountingKindDistributionRows(selectedPeriod),
    getAccountingDrillDownEntries(selectedPeriod),
  ]);

  return buildAccountingViewModel({
    accountingMonths,
    selectedMonth,
    selectedMonthLabel,
    periodOptions,
    selectedPeriod,
    profitLossRows,
    rawCashFlowRows,
    assetDeltaRows,
    liabilityDeltaRows,
    rawKindDistributionRows,
    drillDownEntries,
  });
}
