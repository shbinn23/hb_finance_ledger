import { won } from "@/lib/format";
import { classifyTransactionKind } from "@/lib/accounting/transaction-kind";
import type { PeriodOptions, ResolvedPeriod } from "@/lib/period-filter";
import type {
  AccountingMetric,
  AccountingMonthOption,
  AccountingViewModel,
  AccountDeltaRow,
  AccountingDrillDownEntry,
  CashFlowRow,
  KindDistributionRow,
  LiabilityDeltaRow,
  ProfitLossRow,
} from "./types";

interface RawCashFlowRow {
  key: string;
  txCount: number;
  amount: number;
  netCashFlow: number;
}

interface RawKindDistributionRow {
  lAccount: string;
  rAccount: string;
  txCount: number;
  amount: number;
}

type RawLiabilityDeltaRow = Omit<LiabilityDeltaRow, "status">;

const cashFlowMeta: Record<
  string,
  { activity: string; label: string; detail: string; includedInNetCashFlow: boolean }
> = {
  income_inflow: {
    activity: "영업/수입",
    label: "수입 유입",
    detail: "assets -> income",
    includedInNetCashFlow: true,
  },
  direct_expense_outflow: {
    activity: "영업/지출",
    label: "직접 지출",
    detail: "expenses -> assets",
    includedInNetCashFlow: true,
  },
  liability_payment_outflow: {
    activity: "상환",
    label: "카드/부채 상환",
    detail: "liabilities -> assets",
    includedInNetCashFlow: true,
  },
  debt_financing_inflow: {
    activity: "재무",
    label: "부채 조달",
    detail: "assets -> liabilities",
    includedInNetCashFlow: true,
  },
  internal_transfer: {
    activity: "내부이체",
    label: "내부 이체",
    detail: "assets -> assets, 순현금흐름 제외",
    includedInNetCashFlow: false,
  },
  capital_adjustment: {
    activity: "자본조정",
    label: "자본/기초 조정",
    detail: "capital 조합, 순현금흐름 제외",
    includedInNetCashFlow: false,
  },
  other: {
    activity: "기타",
    label: "기타",
    detail: "분류 필요",
    includedInNetCashFlow: false,
  },
};

function toneFromSigned(value: number): AccountingMetric["tone"] {
  if (value < 0) return "watch";
  return "stable";
}

function buildMetrics(
  profitLossRows: ProfitLossRow[],
  cashFlowRows: CashFlowRow[],
  assetDeltaRows: AccountDeltaRow[],
  liabilityDeltaRows: LiabilityDeltaRow[],
  checks: AccountingViewModel["checks"],
  selectedPeriod: ResolvedPeriod,
): AccountingMetric[] {
  const profitLossTotal = profitLossRows.reduce((sum, row) => sum + row.profitLoss, 0);
  const netCashFlow = cashFlowRows.reduce((sum, row) => sum + row.netCashFlow, 0);
  const assetDelta = assetDeltaRows.reduce((sum, row) => sum + row.netDelta, 0);
  const liabilityDelta = liabilityDeltaRows.reduce((sum, row) => sum + row.netDelta, 0);

  return [
    {
      label: "기간손익",
      value: won(profitLossTotal),
      detail: `${selectedPeriod.label} 합계`,
      tone: toneFromSigned(profitLossTotal),
    },
    {
      label: "순현금흐름",
      value: won(netCashFlow),
      detail: "내부이체/자본조정 제외",
      tone: toneFromSigned(netCashFlow),
    },
    {
      label: "자산증감",
      value: won(assetDelta),
      detail: "assets 계정 순증감",
      tone: toneFromSigned(assetDelta),
    },
    {
      label: "부채증감",
      value: won(liabilityDelta),
      detail: "liabilities 계정 순증감",
      tone: liabilityDelta > 0 ? "watch" : "stable",
    },
    {
      label: "검산 상태",
      value: checks.unknownCount > 0 ? "주의" : "정상",
      detail:
        checks.unknownCount > 0
          ? `미분류 ${checks.unknownCount.toLocaleString("ko-KR")}건 확인 필요`
          : "모든 거래 조합 분류 완료",
      tone: checks.unknownCount > 0 ? "watch" : "stable",
    },
  ];
}

function mapCashFlowRows(rows: RawCashFlowRow[]): CashFlowRow[] {
  return rows.map((row) => {
    const meta = cashFlowMeta[row.key] ?? cashFlowMeta.other;
    return {
      key: row.key,
      activity: meta.activity,
      label: meta.label,
      detail: meta.detail,
      txCount: row.txCount,
      amount: row.amount,
      netCashFlow: row.netCashFlow,
      includedInNetCashFlow: meta.includedInNetCashFlow,
    };
  });
}

function mapLiabilityDeltaRows(rows: RawLiabilityDeltaRow[]): LiabilityDeltaRow[] {
  return rows.map((row) => ({
    ...row,
    status: liabilityStatus(row.netDelta),
  }));
}

function liabilityStatus(netDelta: number) {
  if (netDelta > 0) return "부채 증가";
  if (netDelta < 0) return "상환 우위";
  return "변동 없음";
}

function mapKindDistribution(rows: RawKindDistributionRow[]): KindDistributionRow[] {
  return rows.map((row) => {
    const kind = classifyTransactionKind(row.lAccount, row.rAccount);
    return {
      kind: kind.kind,
      label: kind.label,
      description: kind.description,
      lAccount: row.lAccount,
      rAccount: row.rAccount,
      txCount: row.txCount,
      amount: row.amount,
    };
  });
}

export function buildAccountingViewModel({
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
}: {
  accountingMonths: AccountingMonthOption[];
  selectedMonth: string;
  selectedMonthLabel: string;
  periodOptions: PeriodOptions;
  selectedPeriod: ResolvedPeriod;
  profitLossRows: ProfitLossRow[];
  rawCashFlowRows: RawCashFlowRow[];
  assetDeltaRows: AccountDeltaRow[];
  liabilityDeltaRows: RawLiabilityDeltaRow[];
  rawKindDistributionRows: RawKindDistributionRow[];
  drillDownEntries: AccountingDrillDownEntry[];
}): AccountingViewModel {
  const cashFlowRows = mapCashFlowRows(rawCashFlowRows);
  const mappedLiabilityDeltaRows = mapLiabilityDeltaRows(liabilityDeltaRows);
  const kindDistribution = mapKindDistribution(rawKindDistributionRows);
  const unknownRows = kindDistribution.filter((row) => row.kind === "unknown");
  const entriesCount = kindDistribution.reduce((sum, row) => sum + row.txCount, 0);
  const unknownCount = unknownRows.reduce((sum, row) => sum + row.txCount, 0);
  const checks = {
    entriesCount,
    classifiedCount: entriesCount - unknownCount,
    unknownCount,
    unknownAmount: unknownRows.reduce((sum, row) => sum + row.amount, 0),
  };

  return {
    metrics: buildMetrics(
      profitLossRows,
      cashFlowRows,
      assetDeltaRows,
      mappedLiabilityDeltaRows,
      checks,
      selectedPeriod,
    ),
    accountingMonths,
    selectedMonth,
    selectedMonthLabel,
    periodOptions,
    selectedPeriod,
    profitLossRows,
    cashFlowRows,
    assetDeltaRows,
    liabilityDeltaRows: mappedLiabilityDeltaRows,
    kindDistribution,
    drillDownEntries,
    checks,
  };
}
