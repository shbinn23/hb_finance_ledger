import { won, wonCompact } from "@/lib/format";
import type {
  AccountBalance,
  CategorySlice,
  OverviewViewModel,
  SpendingPoint,
  SummaryMetric,
  TransactionRow,
} from "./types";
import type { MlForecastResult } from "@/server/ml/client";

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

function cumulative(points: Array<{ day: number; amount: number }>) {
  let total = 0;
  return points
    .sort((a, b) => a.day - b.day)
    .map((point) => {
      total += point.amount;
      return { day: point.day, amount: total };
    });
}

function projectMonthEnd(current: number, lastDay: number, monthDays = 31) {
  if (lastDay <= 0) return 0;
  return Math.round((current / lastDay) * monthDays);
}

function buildSpending(
  dailyExpenses: Array<{ day: number; amount: number }>,
  baseline: Array<{ day: number; amount: number }>,
  mlForecast?: MlForecastResult | null,
): SpendingPoint[] {
  const actual = cumulative(dailyExpenses);
  const baselineByDay = new Map(cumulative(baseline).map((point) => [point.day, point.amount]));
  const last = actual.at(-1);
  const lastDay = last?.day ?? 0;

  if (mlForecast) {
    const actualByDay = new Map(actual.map((point) => [point.day, point.amount]));
    return mlForecast.series.map((point) => ({
      day: point.day,
      actual: actualByDay.get(point.day) ?? null,
      projected: point.projected,
      baseline: baselineByDay.get(point.day) ?? null,
      ai: point.ai,
      upper: point.upper,
      lower: point.lower,
    }));
  }

  const projectedFinal = projectMonthEnd(last?.amount ?? 0, lastDay);
  const projected: SpendingPoint[] = [];

  for (let day = Math.max(lastDay, 1); day <= 31; day += day === lastDay ? 3 : 3) {
    const ratio = day / 31;
    const amount = Math.round(projectedFinal * ratio);
    projected.push({
      day,
      actual: day <= lastDay ? actual.find((point) => point.day === day)?.amount ?? null : null,
      projected: amount,
      baseline: baselineByDay.get(day) ?? null,
      upper: Math.round(amount * 1.07),
      lower: Math.round(amount * 0.93),
    });
  }

  const byDay = new Map<number, SpendingPoint>();
  actual.forEach((point) => {
    byDay.set(point.day, {
      day: point.day,
      actual: point.amount,
      projected: null,
      baseline: baselineByDay.get(point.day) ?? null,
      upper: null,
      lower: null,
    });
  });
  projected.forEach((point) => {
    byDay.set(point.day, { ...byDay.get(point.day), ...point });
  });
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

function buildCategories(categories: OverviewSource["categories"]): CategorySlice[] {
  const total = categories.reduce((sum, category) => sum + category.amount, 0);
  return categories.slice(0, 5).map((category, index) => ({
    name: category.name,
    amount: category.amount,
    share: total === 0 ? 0 : (category.amount / total) * 100,
    tone: categoryTones[index] ?? "var(--ink-muted)",
  }));
}

function buildSummary(source: OverviewSource, mlForecast?: MlForecastResult | null): SummaryMetric[] {
  const netWorth = source.assetTotal - source.liabilityTotal;
  const currentSpend = source.dailyExpenses.reduce((sum, point) => sum + point.amount, 0);
  const lastDay = Math.max(1, ...source.dailyExpenses.map((point) => point.day));
  const expectedFinal = mlForecast?.projectedFinal ?? projectMonthEnd(currentSpend, lastDay);

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
      value: wonCompact(expectedFinal),
      detail: mlForecast ? `ML 기준 ${wonCompact(expectedFinal)} 예상` : `현재 속도 기준 ${wonCompact(expectedFinal)} 예상`,
      tone: expectedFinal > 2_600_000 ? "watch" : "stable",
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

export function buildOverviewViewModel(source: OverviewSource, mlForecast?: MlForecastResult | null): OverviewViewModel {
  const netWorth = source.assetTotal - source.liabilityTotal;

  return {
    asOf: source.asOf,
    monthLabel: source.monthLabel,
    netWorth,
    assetTotal: source.assetTotal,
    liabilityTotal: source.liabilityTotal,
    syncState: "후잉 본계정 기준",
    forecastSource: mlForecast ? "ml" : "fallback",
    summary: buildSummary(source, mlForecast),
    spending: buildSpending(source.dailyExpenses, source.baseline, mlForecast),
    categories: buildCategories(source.categories),
    accounts: source.accounts,
    transactions: source.transactions,
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
