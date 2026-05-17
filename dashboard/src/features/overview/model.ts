import { won } from "@/lib/format";
import type {
  AccountBalance,
  CategorySlice,
  FixedExpenseOverview,
  OverviewViewModel,
  SpendingPoint,
  SummaryMetric,
  TransactionRow,
} from "./types";
import type { MlForecastResult } from "@/server/ml/client";
import type { FixedExpenseScheduleRow } from "@/lib/fixed-expense-schedule";
import { buildSpendingSeries, projectSpendingMonthEnd } from "./spending-series";

export interface OverviewSource {
  asOf: string;
  entryCount: number;
  monthLabel: string;
  monthShortLabel: string;
  assetTotal: number;
  liabilityTotal: number;
  dailyExpenses: Array<{ day: number; amount: number }>;
  baseline: Array<{ day: number; amount: number }>;
  categories: Array<{ name: string; amount: number }>;
  currentExpenseByCategory: Array<{ category: string; amount: number }>;
  accounts: AccountBalance[];
  transactions: TransactionRow[];
}

const categoryTones = [
  "var(--ruby)",
  "var(--primary)",
  "var(--magenta)",
  "var(--green)",
  "var(--ink-muted)",
];
const monthlyIncome = 3_110_000;
const monthlySavingTarget = 1_000_000;

function buildCategories(categories: OverviewSource["categories"]): CategorySlice[] {
  const total = categories.reduce((sum, category) => sum + category.amount, 0);
  return categories.slice(0, 5).map((category, index) => ({
    name: category.name,
    amount: category.amount,
    share: total === 0 ? 0 : (category.amount / total) * 100,
    tone: categoryTones[index] ?? "var(--ink-muted)",
  }));
}

function actualProjectionFinal(spending: SpendingPoint[]) {
  return spending.findLast((point) => point.actualProjection !== null)?.actualProjection ?? null;
}

function calculateReservedFixedTotal(schedule: FixedExpenseScheduleRow[]) {
  return schedule.reduce((sum, row) => (
    sum + (row.currentAmount > 0 ? row.currentAmount : row.expectedAmount)
  ), 0);
}

function calculateCurrentVariableSpend(currentExpenseByCategory: OverviewSource["currentExpenseByCategory"]) {
  return currentExpenseByCategory
    .filter((row) => row.category === "floating" || row.category === "normal")
    .reduce((sum, row) => sum + row.amount, 0);
}

function buildSummary(
  source: OverviewSource,
  spending: SpendingPoint[],
  fixedExpenseSchedule: FixedExpenseScheduleRow[],
  mlForecast?: MlForecastResult | null,
): SummaryMetric[] {
  const netWorth = source.assetTotal - source.liabilityTotal;
  const currentSpend = source.dailyExpenses.reduce((sum, point) => sum + point.amount, 0);
  const lastDay = Math.max(1, ...source.dailyExpenses.map((point) => point.day));
  const fallbackMonthTotal = mlForecast?.projectedFinal ?? projectSpendingMonthEnd(currentSpend, lastDay);
  const projectedActualMonthTotal = actualProjectionFinal(spending) ?? fallbackMonthTotal;
  const reservedFixedTotal = calculateReservedFixedTotal(fixedExpenseSchedule);
  const variableSpendPool = monthlyIncome - monthlySavingTarget - reservedFixedTotal;
  const currentVariableSpend = calculateCurrentVariableSpend(source.currentExpenseByCategory);
  const availableResource = variableSpendPool - currentVariableSpend;

  return [
    {
      id: "net-worth",
      label: "순자산",
      value: won(netWorth),
      detail: "후잉 자산 - 부채 기준",
      tone: "stable",
    },
    {
      id: "month-spend",
      label: `${source.monthShortLabel} 지출`,
      value: won(currentSpend),
      detail: "후잉-native expense total",
      tone: "stable",
    },
    {
      id: "forecast",
      label: "월말 예상",
      value: won(projectedActualMonthTotal),
      detail: mlForecast ? `ML 예상 ${won(mlForecast.projectedFinal)}` : `현재 속도 기준 ${won(fallbackMonthTotal)} 예상`,
      tone: projectedActualMonthTotal > 2_600_000 ? "watch" : "stable",
    },
    {
      id: "available-resource",
      label: "가용 리소스",
      value: won(availableResource),
      detail: availableResource >= 0
        ? `월말까지 변동지출 여유 ${won(availableResource)}`
        : `변동지출 리소스 ${won(Math.abs(availableResource))} 초과`,
      tone: availableResource < 0 ? "over" : "stable",
    },
    {
      id: "sync",
      label: "동기화",
      value: `${source.entryCount.toLocaleString("ko-KR")}건`,
      detail: "후잉 API mirror 기준",
      tone: "stable",
    },
  ];
}

function dDayLabel(daysRemaining: number) {
  if (daysRemaining === 0) return "오늘";
  if (daysRemaining > 0) return `D-${daysRemaining}`;
  return `D+${Math.abs(daysRemaining)}`;
}

function buildFixedExpenseOverview(schedule: FixedExpenseScheduleRow[]): FixedExpenseOverview {
  const processedCount = schedule.filter((row) => row.status === "processed").length;
  const scheduledCount = schedule.filter((row) => row.status === "scheduled").length;
  const overdueCount = schedule.filter((row) => row.status === "overdue").length;
  const next = schedule.find((row) => row.status !== "processed");

  return {
    processedCount,
    scheduledCount,
    overdueCount,
    nextLabel: next ? `${next.itemName} ${dDayLabel(next.daysRemaining)}` : "모두 처리완료",
    nextDetail: next ? `${next.accountName} · ${next.statusLabel}` : `${processedCount}개 항목 완료`,
  };
}

export function buildOverviewViewModel(
  source: OverviewSource,
  mlForecast?: MlForecastResult | null,
  fixedExpenseSchedule: FixedExpenseScheduleRow[] = [],
): OverviewViewModel {
  const netWorth = source.assetTotal - source.liabilityTotal;
  const spending = buildSpendingSeries(source.dailyExpenses, source.baseline, mlForecast);

  return {
    asOf: source.asOf,
    monthLabel: source.monthLabel,
    netWorth,
    assetTotal: source.assetTotal,
    liabilityTotal: source.liabilityTotal,
    syncState: "후잉 본계정 기준",
    forecastSource: mlForecast ? "ml" : "fallback",
    summary: buildSummary(source, spending, fixedExpenseSchedule, mlForecast),
    spending,
    categories: buildCategories(source.categories),
    accounts: source.accounts,
    transactions: source.transactions,
    fixedExpense: buildFixedExpenseOverview(fixedExpenseSchedule),
    insights: [
      {
        title: "후잉 동기화 기준 정상",
        body: "로컬 mirror가 후잉 API entry_id를 기준으로 관리됩니다.",
        tone: "stable",
      },
      {
        title: mlForecast ? "ML 월말 예측 관찰" : "월말 예측 관찰",
        body: mlForecast
          ? "Chronos 기반 ML 엔진의 월말 예측과 신뢰구간을 우선 반영했습니다."
          : "현재 일평균 지출 속도를 기준으로 월말 예상치를 계산했습니다.",
        tone: "watch",
      },
      {
        title: "자산 구조 추적",
        body: "주요 자산과 부채를 후잉 계정 잔액 기준으로 정렬했습니다.",
        tone: "stable",
      },
    ],
  };
}
