import type { RiskLevel } from "@/features/overview/types";
import type { AccountingTransactionKind } from "@/lib/accounting/transaction-kind";
import type { PeriodOptions, ResolvedPeriod } from "@/lib/period-filter";

export interface AccountingMetric {
  label: string;
  value: string;
  detail: string;
  tone: RiskLevel;
}

export interface AccountingMonthOption {
  value: string;
  label: string;
}

export interface ProfitLossRow {
  ym: string;
  income: number;
  expenses: number;
  profitLoss: number;
}

export interface CashFlowRow {
  key: string;
  activity: string;
  label: string;
  txCount: number;
  amount: number;
  netCashFlow: number;
  includedInNetCashFlow: boolean;
  detail: string;
}

export interface AccountDeltaRow {
  accountId: string;
  title: string;
  inflow: number;
  outflow: number;
  netDelta: number;
  txCount: number;
  lastDate: string;
}

export interface LiabilityDeltaRow {
  accountId: string;
  title: string;
  liabilityIncrease: number;
  liabilityDecrease: number;
  netDelta: number;
  status: string;
  txCount: number;
  lastDate: string;
}

export interface KindDistributionRow {
  kind: AccountingTransactionKind;
  label: string;
  description: string;
  lAccount: string;
  rAccount: string;
  txCount: number;
  amount: number;
}

export interface AccountingDrillDownEntry {
  entryId: string;
  entryDate: string;
  item: string;
  money: number;
  memo: string;
  flowKey: string;
  lAccount: string;
  lAccountId: string;
  lAccountTitle: string;
  rAccount: string;
  rAccountId: string;
  rAccountTitle: string;
}

export interface AccountingViewModel {
  metrics: AccountingMetric[];
  accountingMonths: AccountingMonthOption[];
  selectedMonth: string;
  selectedMonthLabel: string;
  periodOptions: PeriodOptions;
  selectedPeriod: ResolvedPeriod;
  profitLossRows: ProfitLossRow[];
  cashFlowRows: CashFlowRow[];
  assetDeltaRows: AccountDeltaRow[];
  liabilityDeltaRows: LiabilityDeltaRow[];
  kindDistribution: KindDistributionRow[];
  drillDownEntries: AccountingDrillDownEntry[];
  checks: {
    entriesCount: number;
    classifiedCount: number;
    unknownCount: number;
    unknownAmount: number;
  };
}
