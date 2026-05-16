import {
  getAccountAnalytics,
  getAvailableLedgerMonths,
  getCategoryAnalytics,
  getFixedExpenseSchedule,
  getFixedExpenseSummary,
  getLedgerRows,
  getMerchantHabits,
  getMonthlyTrend,
  getPaymentMix,
  getPeriodAggregate,
  getWorkspaceContext,
} from "@/server/whooing/analytics-repository";
import { getOverviewViewModel } from "@/features/overview/service";
import { won, wonCompact } from "@/lib/format";
import { buildFixedExpenseSchedule, referenceDayForMonth } from "@/lib/fixed-expense-schedule";
import { buildPeriodOptions, resolvePeriod, type PeriodQuery } from "@/lib/period-filter";
import type {
  RightInsightPanelCard,
  RightInsightVisual,
  SectionInsight,
  SectionKey,
  SectionMetric,
  SectionViewModel,
} from "./types";

const sectionMeta: Record<SectionKey, SectionViewModel["header"]> = {
  ledger: {
    eyebrow: "Ledger",
    title: "후잉 원장",
    description: "후잉 entry_id를 기준으로 지출, 수입, 이체, 카드정산 흐름을 한 번에 검토합니다.",
    badge: "원본 mirror",
  },
  trend: {
    eyebrow: "Monthly Trend",
    title: "지출 추이",
    description: "월별 지출, 수입, 카드정산의 방향성을 비교해 현금흐름의 압력을 봅니다.",
    badge: "12개월",
  },
  budget: {
    eyebrow: "Budget Signal",
    title: "예산 관리",
    description: "별도 예산 테이블을 만들지 않고 후잉 카테고리의 과거 평균 대비 현재 월 사용액을 추적합니다.",
    badge: "평균 대비",
  },
  assets: {
    eyebrow: "Balance Sheet",
    title: "자산·카드",
    description: "후잉의 자산과 부채 계정 잔액을 그대로 계산해 계정별 비중과 카드 미결제를 확인합니다.",
    badge: "후잉 잔액",
  },
  analysis: {
    eyebrow: "AI-ready Analysis",
    title: "지출 분석",
    description: "아직 ML 모델을 붙이지 않고도 설명 가능한 규칙 기반 인사이트를 먼저 제공합니다.",
    badge: "rule-based",
  },
  habits: {
    eyebrow: "Habit Loop",
    title: "습관 관리",
    description: "반복 상호명과 결제 수단을 기준으로 자주 새는 지출을 찾아냅니다.",
    badge: "반복 패턴",
  },
};
const monthlyIncome = 3_110_000;
const monthlySavingTarget = 1_000_000;
const periodFilterKeys = new Set<SectionKey>(["ledger", "trend", "budget", "analysis", "habits"]);

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function ratio(current: number, baseline: number) {
  if (baseline <= 0) return 0;
  return Math.round((current / baseline) * 100);
}

function toneFromRatio(value: number) {
  if (value >= 130) return "over";
  if (value >= 105) return "watch";
  return "stable";
}

function currentMonthSpend(monthlyTrend: SectionViewModel["monthlyTrend"]) {
  return monthlyTrend.at(-1)?.expenses ?? 0;
}

function previousMonthSpend(monthlyTrend: SectionViewModel["monthlyTrend"]) {
  return monthlyTrend.at(-2)?.expenses ?? 0;
}

function currentMonthLabel(monthlyTrend: SectionViewModel["monthlyTrend"]) {
  return monthlyTrend.at(-1)?.label ?? "";
}

function monthlyAverageSpend(monthlyTrend: SectionViewModel["monthlyTrend"]) {
  return average(monthlyTrend.map((row) => row.expenses));
}

function historicalAverageSpend(monthlyTrend: SectionViewModel["monthlyTrend"]) {
  return average(monthlyTrend.slice(0, -1).map((row) => row.expenses));
}

function isPeriodAggregate(model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">) {
  return Boolean(model.selectedPeriod && model.selectedPeriod.mode !== "month");
}

function selectedExpenseTotal(model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">) {
  return model.periodAggregate.expenses;
}

function selectedIncomeTotal(model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">) {
  return model.periodAggregate.income;
}

function selectedCardPaymentTotal(model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">) {
  return model.periodAggregate.cardPayment;
}

function parseDisplayDate(value: string) {
  const match = value.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!match) return null;
  return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00+09:00`);
}

function ymdNumberToDate(value: number) {
  const text = String(value);
  return new Date(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00+09:00`);
}

function dateRangeDayCount(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

function recentLedgerCount(rows: SectionViewModel["ledger"]) {
  const datedRows = rows
    .map((row) => ({ row, date: parseDisplayDate(row.date) }))
    .filter((entry): entry is { row: SectionViewModel["ledger"][number]; date: Date } => entry.date !== null);
  const latest = datedRows.reduce<Date | null>((max, entry) => (
    max === null || entry.date > max ? entry.date : max
  ), null);

  if (!latest) return 0;

  const windowStart = new Date(latest);
  windowStart.setDate(latest.getDate() - 6);
  return datedRows.filter((entry) => entry.date >= windowStart && entry.date <= latest).length;
}

function periodDayCount(model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">) {
  if (model.selectedPeriod?.startDate && model.selectedPeriod.endDate) {
    return dateRangeDayCount(ymdNumberToDate(model.selectedPeriod.startDate), ymdNumberToDate(model.selectedPeriod.endDate));
  }

  if (model.selectedPeriod?.mode === "all") {
    const expenseDates = model.ledger
      .filter((row) => row.kind === "expense")
      .map((row) => parseDisplayDate(row.date))
      .filter((date): date is Date => date !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    const first = expenseDates[0];
    const last = expenseDates.at(-1);
    if (!first || !last) return 0;
    return dateRangeDayCount(first, last) + 1;
  }

  const month = currentMonthLabel(model.monthlyTrend);
  const match = month.match(/^(\d{4})\.(\d{2})$/);
  if (!match) return 0;
  return new Date(Number(match[1]), Number(match[2]), 0).getDate();
}

function noSpendDayCount(model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">) {
  const expenseDays = new Set(model.ledger
    .filter((row) => row.kind === "expense")
    .map((row) => row.date));
  return Math.max(0, periodDayCount(model) - expenseDays.size);
}

function reservedFixedTotal(schedule: SectionViewModel["fixedExpenseSchedule"]) {
  return schedule.reduce((sum, row) => (
    sum + (row.currentAmount > 0 ? row.currentAmount : row.expectedAmount)
  ), 0);
}

function currentVariableSpend(categories: SectionViewModel["categories"]) {
  return categories
    .filter((category) => category.categoryType === "floating" || category.categoryType === "normal")
    .reduce((sum, category) => sum + category.currentAmount, 0);
}

function availableResource(model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">) {
  return monthlyIncome - monthlySavingTarget - reservedFixedTotal(model.fixedExpenseSchedule) - currentVariableSpend(model.categories);
}

function observationSignalCount(categories: SectionViewModel["categories"]) {
  return categories.filter((category) => (
    category.averageAmount > 0 && category.currentAmount > Math.max(category.averageAmount * 1.3, 100_000)
  )).length;
}

function buildMetrics(
  key: SectionKey,
  model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">,
  options: { trendProjectionMetric?: SectionMetric | null } = {},
): SectionMetric[] {
  const spend = currentMonthSpend(model.monthlyTrend);
  const displaySpend = selectedExpenseTotal(model);
  const incomeTotal = selectedIncomeTotal(model);
  const cardPaymentTotal = selectedCardPaymentTotal(model);
  const previousSpend = previousMonthSpend(model.monthlyTrend);
  const avgSpend = historicalAverageSpend(model.monthlyTrend);
  const trendMonthlyAverage = monthlyAverageSpend(model.monthlyTrend);
  const assets = model.accounts.filter((account) => account.kind === "asset");
  const liabilities = model.accounts.filter((account) => account.kind === "liability");
  const assetTotal = assets.reduce((sum, account) => sum + account.amount, 0);
  const liabilityTotal = liabilities.reduce((sum, account) => sum + account.amount, 0);
  const categoryLeader = model.categories[0];
  const repeatedTotal = model.habits.reduce((sum, habit) => sum + habit.amount, 0);
  const spendRatio = isPeriodAggregate(model) ? 100 : ratio(displaySpend, avgSpend);
  const fixedShare = ratio(model.fixedExpense.currentAmount, displaySpend);
  const fixedTone = toneFromRatio(ratio(model.fixedExpense.currentAmount, model.fixedExpense.averageAmount));
  const periodLabel = model.selectedPeriod?.label ?? model.context.monthShortLabel;
  const isMonthlyPeriod = model.selectedPeriod?.mode === "month";
  const ledgerSpend = model.ledger
    .filter((row) => row.kind === "expense")
    .reduce((sum, row) => sum + row.amount, 0);
  const ledgerPeriodDetail = model.selectedPeriod?.label ?? model.context.monthShortLabel;
  const ledgerSpendLabel = isMonthlyPeriod && model.selectedPeriod?.month === currentMonthValue()
    ? "이번 달 지출"
    : isMonthlyPeriod
      ? "선택 월 지출"
      : "표시 지출";
  const ledgerComparisonMetric: SectionMetric = isMonthlyPeriod ? {
    label: "전월 대비",
    value: `${ratio(spend, previousSpend || spend)}%`,
    detail: `${model.context.monthShortLabel} / 직전 월`,
    tone: toneFromRatio(ratio(spend, previousSpend || spend)),
  } : {
    label: "표시 한도",
    value: "500건",
    detail: `${ledgerPeriodDetail} 최신순`,
    tone: "neutral",
  };
  const trendComparisonMetric: SectionMetric = isMonthlyPeriod ? {
    label: "평균 대비",
    value: `${spendRatio}%`,
    detail: "선택 월 / 과거 월평균",
    tone: toneFromRatio(spendRatio),
  } : {
    label: "집계 월수",
    value: `${model.monthlyTrend.length}개월`,
    detail: `${periodLabel} 월별 집계`,
    tone: "stable",
  };
  const budgetComparisonMetric: SectionMetric = isMonthlyPeriod ? {
    label: "평균 대비",
    value: `${spendRatio}%`,
    detail: `${periodLabel} 비용 구조`,
    tone: toneFromRatio(spendRatio),
  } : {
    label: "집계 월수",
    value: `${model.monthlyTrend.length}개월`,
    detail: `${periodLabel} 월별 비용 구조`,
    tone: "stable",
  };
  const resource = availableResource(model);
  const debtRatio = ratio(liabilityTotal, assetTotal);
  const signals = observationSignalCount(model.categories);

  const common: Record<SectionKey, SectionMetric[]> = {
    ledger: [
      {
        label: isMonthlyPeriod ? "거래 건수" : "표시 거래",
        value: `${model.ledger.length}건`,
        detail: isMonthlyPeriod ? `${ledgerPeriodDetail} entries` : `${ledgerPeriodDetail} 최신순 최대 500건`,
        tone: "stable",
      },
      {
        label: ledgerSpendLabel,
        value: won(ledgerSpend),
        detail: isMonthlyPeriod ? `${ledgerPeriodDetail} expenses 계정 기준` : "표시 거래 expenses 계정 기준",
        tone: "stable",
      },
      ledgerComparisonMetric,
      { label: "동기화", value: `${model.context.entryCount.toLocaleString("ko-KR")}건`, detail: model.context.asOf, tone: "stable" },
      { label: "최근 입력", value: `${recentLedgerCount(model.ledger)}건`, detail: "최근 7일 원장 기준", tone: "stable" },
    ],
    trend: [
      { label: isMonthlyPeriod ? "이번 달" : "선택 기간", value: won(displaySpend), detail: periodLabel, tone: toneFromRatio(spendRatio) },
      { label: "월 평균", value: won(trendMonthlyAverage), detail: `${periodLabel} 월별 평균`, tone: "stable" },
      trendComparisonMetric,
      { label: "수입", value: won(incomeTotal), detail: `${periodLabel} income 계정 기준`, tone: "stable" },
      options.trendProjectionMetric ?? { label: "카드정산", value: won(cardPaymentTotal), detail: `${periodLabel} liabilities→assets`, tone: cardPaymentTotal > 0 ? "watch" : "stable" },
    ],
    budget: [
      { label: "관리 카테고리", value: `${model.categories.length}개`, detail: `${periodLabel} 지출 발생`, tone: "stable" },
      { label: "최대 지출", value: categoryLeader ? won(categoryLeader.currentAmount) : "0원", detail: categoryLeader?.name ?? "없음", tone: "watch" },
      { label: "고정지출", value: won(model.fixedExpense.currentAmount), detail: `전체 지출의 ${fixedShare}%`, tone: fixedTone },
      budgetComparisonMetric,
      isMonthlyPeriod ? {
        label: "가용 리소스",
        value: won(resource),
        detail: resource >= 0 ? "월말까지 변동지출 여유" : `저축 목표 방어에 ${won(Math.abs(resource))} 부족`,
        tone: resource < 0 ? "over" : "stable",
      } : {
        label: "선택 기간 지출",
        value: won(displaySpend),
        detail: `${periodLabel} expenses 합계`,
        tone: toneFromRatio(spendRatio),
      },
    ],
    assets: [
      { label: "총 자산", value: won(assetTotal), detail: `${assets.length}개 계정`, tone: "stable" },
      { label: "총 부채", value: won(liabilityTotal), detail: `${liabilities.length}개 계정`, tone: liabilityTotal > 0 ? "watch" : "stable" },
      { label: "순자산", value: won(assetTotal - liabilityTotal), detail: "자산 - 부채", tone: "stable" },
      { label: "카드 미결제", value: won(liabilities.filter((account) => account.category.includes("card")).reduce((sum, account) => sum + account.amount, 0)), detail: "credit/check card", tone: "watch" },
      { label: "부채 비중", value: `${debtRatio}%`, detail: "총 자산 대비 부채", tone: debtRatio >= 30 ? "watch" : "stable" },
    ],
    analysis: [
      { label: isMonthlyPeriod ? "월 지출" : "선택 기간 지출", value: won(displaySpend), detail: `${periodLabel} 기준`, tone: toneFromRatio(spendRatio) },
      { label: "상위 카테고리", value: categoryLeader?.name ?? "없음", detail: categoryLeader ? won(categoryLeader.currentAmount) : "지출 없음", tone: "watch" },
      { label: "고정지출", value: wonCompact(model.fixedExpense.currentAmount), detail: `steady ${model.fixedExpense.transactionCount}건`, tone: fixedTone },
      { label: "반복 지출", value: wonCompact(repeatedTotal), detail: `${model.habits.length}개 패턴`, tone: repeatedTotal > displaySpend * 0.35 ? "watch" : "stable" },
      { label: "관찰 신호", value: `${signals}개`, detail: "평균 대비 관찰 대상", tone: signals > 0 ? "watch" : "stable" },
    ],
    habits: [
      { label: "반복 상호", value: `${model.habits.length}개`, detail: `${periodLabel} 2회 이상`, tone: "stable" },
      { label: "반복 합계", value: wonCompact(repeatedTotal), detail: "반복 상호 총액", tone: repeatedTotal > displaySpend * 0.35 ? "watch" : "stable" },
      { label: "최다 반복", value: model.habits[0]?.name ?? "없음", detail: model.habits[0] ? `${model.habits[0].count}회` : "패턴 없음", tone: "watch" },
      { label: "주 결제수단", value: model.paymentMix[0]?.name ?? "없음", detail: model.paymentMix[0] ? `${model.paymentMix[0].count}건` : `${periodLabel} 없음`, tone: "neutral" },
      { label: "무지출일", value: `${noSpendDayCount(model)}일`, detail: "선택 기간 기준", tone: noSpendDayCount(model) >= 5 ? "stable" : "watch" },
    ],
  };

  return common[key];
}

function ledgerQualityPanels(model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">): RightInsightPanelCard[] {
  const missingMemo = model.ledger.filter((row) => row.memo.length === 0).length;
  const highValue = model.ledger.filter((row) => row.amount >= 100_000).length;

  return [
    {
      eyebrow: "Ledger Quality",
      title: "최근 입력 품질",
      visuals: [
        {
          type: "progress",
          title: "메모 보강 필요",
          value: ratio(missingMemo, model.ledger.length),
          detail: missingMemo > 0 ? `${missingMemo}/${model.ledger.length}건 보강 대상` : "메모 누락 없음",
          tone: missingMemo > model.ledger.length * 0.25 ? "watch" : "stable",
        },
        {
          type: "bars",
          rows: [
            { label: "최근 거래", value: model.ledger.length, detail: `${model.ledger.length}건` },
            { label: "고액 거래", value: highValue, detail: `${highValue}건` },
            { label: "메모 누락", value: missingMemo, detail: `${missingMemo}건` },
          ],
        },
      ],
    },
    {
      eyebrow: "Payment Mix",
      title: "결제수단 분포",
      visuals: [
        {
          type: "bars",
          rows: model.paymentMix.slice(0, 5).map((row) => ({
            label: row.name,
            value: row.amount,
            detail: `${row.count}건`,
          })),
        },
      ],
    },
  ];
}

function trendPanels(model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">): RightInsightPanelCard[] {
  const spend = selectedExpenseTotal(model);
  const incomeTotal = selectedIncomeTotal(model);
  const cardPaymentTotal = selectedCardPaymentTotal(model);
  const avgSpend = historicalAverageSpend(model.monthlyTrend);
  const trendMonthlyAverage = monthlyAverageSpend(model.monthlyTrend);
  const spendRatio = isPeriodAggregate(model) ? 100 : ratio(spend, avgSpend);
  const monthDelta = currentMonthSpend(model.monthlyTrend) - previousMonthSpend(model.monthlyTrend);
  const periodLabel = model.selectedPeriod?.label ?? model.context.monthShortLabel;
  const speedVisuals: RightInsightVisual[] = isPeriodAggregate(model) ? [
    {
      type: "bars",
      rows: [
        { label: "기간 지출", value: spend, detail: won(spend) },
        { label: "월평균", value: trendMonthlyAverage, detail: won(trendMonthlyAverage) },
        { label: "카드정산", value: cardPaymentTotal, detail: won(cardPaymentTotal) },
      ],
    },
    {
      type: "sparkline",
      rows: model.monthlyTrend.map((row) => ({ label: row.label, value: row.expenses })),
    },
    {
      type: "note",
      text: `최근 월 지출은 직전 월 대비 ${monthDelta >= 0 ? "+" : ""}${won(monthDelta)}입니다.`,
    },
  ] : [
    {
      type: "bullet",
      title: `${periodLabel} 지출 속도`,
      value: `${spendRatio}%`,
      detail: "기준 100% · 관찰선 105%",
      percent: (spendRatio / 130) * 100,
      tone: toneFromRatio(spendRatio),
    },
    {
      type: "sparkline",
      rows: model.monthlyTrend.map((row) => ({ label: row.label, value: row.expenses })),
    },
    {
      type: "note",
      text: `직전 월 대비 ${monthDelta >= 0 ? "+" : ""}${won(monthDelta)}입니다.`,
    },
  ];

  return [
    {
      eyebrow: "Signals",
      title: "지출 속도 레이더",
      visuals: speedVisuals,
    },
    {
      eyebrow: "Pace",
      title: "현금흐름 압력",
      visuals: [
        {
          type: "bars",
          rows: [
            { label: `${periodLabel} 수입`, value: incomeTotal, detail: won(incomeTotal) },
            { label: `${periodLabel} 지출`, value: spend, detail: won(spend) },
            { label: "카드정산", value: cardPaymentTotal, detail: won(cardPaymentTotal) },
          ],
        },
      ],
    },
  ];
}

function budgetPanels(model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">): RightInsightPanelCard[] {
  if (model.selectedPeriod?.mode !== "month") {
    const periodLabel = model.selectedPeriod?.label ?? "선택 기간";
    const variableSpend = currentVariableSpend(model.categories);
    const spend = selectedExpenseTotal(model);

    return [
      {
        eyebrow: "Budget Signals",
        title: "선택 기간 비용 구조",
        visuals: [
          {
            type: "progress",
            title: "고정지출 비중",
            value: ratio(model.fixedExpense.currentAmount, spend),
            detail: `${periodLabel} steady ${won(model.fixedExpense.currentAmount)}`,
            tone: ratio(model.fixedExpense.currentAmount, spend) >= 70 ? "watch" : "stable",
          },
          {
            type: "bars",
            rows: [
              { label: "고정지출", value: model.fixedExpense.currentAmount, detail: won(model.fixedExpense.currentAmount) },
              { label: "변동/일반", value: variableSpend, detail: won(variableSpend) },
            ],
          },
          { type: "note", text: "월별 처리 예정일은 월 필터에서 확인하세요." },
        ],
      },
    ];
  }

  const processed = model.fixedExpenseSchedule.filter((row) => row.status === "processed").length;
  const fixedTotal = model.fixedExpenseSchedule.length;
  const variableSpend = currentVariableSpend(model.categories);
  const reservedFixed = reservedFixedTotal(model.fixedExpenseSchedule);
  const resource = availableResource(model);

  return [
    {
      eyebrow: "Budget Signals",
      title: "고정비 처리 현황",
      visuals: [
        {
          type: "progress",
          title: "처리율",
          value: ratio(processed, fixedTotal),
          detail: `${processed}/${fixedTotal || 0}개 처리 완료`,
          tone: ratio(processed, fixedTotal) >= 80 ? "stable" : "watch",
        },
        {
          type: "timeline",
          emptyText: "남은 고정지출 일정이 없습니다.",
          rows: model.fixedExpenseSchedule
            .filter((row) => row.status !== "processed")
            .slice(0, 5)
            .map((row) => ({
              marker: `${row.dueDay}일`,
              title: row.itemName,
              detail: `${row.paymentAccountName} · ${won(row.expectedAmount)}`,
              tone: row.status === "overdue" ? "over" : "watch",
            })),
        },
      ],
    },
    {
      eyebrow: "Resource",
      title: "저축 방어 여력",
      visuals: [
        {
          type: "bars",
          rows: [
            { label: "예약 고정비", value: reservedFixed, detail: won(reservedFixed) },
            { label: "변동지출", value: variableSpend, detail: won(variableSpend) },
            { label: "가용 리소스", value: Math.abs(resource), detail: resource >= 0 ? `${won(resource)} 여유` : `${won(Math.abs(resource))} 초과` },
          ],
        },
      ],
    },
  ];
}

function assetPanels(model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">): RightInsightPanelCard[] {
  const assets = model.accounts.filter((account) => account.kind === "asset");
  const liabilities = model.accounts.filter((account) => account.kind === "liability");
  const assetTotal = assets.reduce((sum, account) => sum + account.amount, 0);
  const liabilityTotal = liabilities.reduce((sum, account) => sum + account.amount, 0);
  const cardDebt = liabilities
    .filter((account) => account.category.includes("card"))
    .reduce((sum, account) => sum + account.amount, 0);

  return [
    {
      eyebrow: "Balance Mix",
      title: "자산 구성",
      visuals: [
        {
          type: "progress",
          title: "부채 부담률",
          value: ratio(liabilityTotal, assetTotal),
          detail: `자산 ${wonCompact(assetTotal)} · 부채 ${wonCompact(liabilityTotal)}`,
          tone: liabilityTotal > assetTotal * 0.3 ? "watch" : "stable",
        },
        {
          type: "bars",
          rows: assets.slice(0, 5).map((account) => ({
            label: account.name,
            value: account.amount,
            detail: account.category,
          })),
        },
      ],
    },
    {
      eyebrow: "Card Debt",
      title: "카드부채 사용도",
      visuals: [
        {
          type: "bars",
          rows: [
            { label: "카드 미결제", value: cardDebt, detail: won(cardDebt) },
            { label: "기타 부채", value: Math.max(0, liabilityTotal - cardDebt), detail: won(Math.max(0, liabilityTotal - cardDebt)) },
          ],
        },
      ],
    },
  ];
}

function weekdayRows(model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">) {
  const days = ["월", "화", "수", "목", "금", "토", "일"];
  const counts = Array.from({ length: 7 }, () => 0);
  model.ledger.forEach((row) => {
    const date = row.date.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
    if (!date) return;
    const weekday = new Date(`${date[1]}-${date[2]}-${date[3]}T00:00:00+09:00`).getDay();
    counts[weekday === 0 ? 6 : weekday - 1] += 1;
  });
  return days.map((day, index) => ({ label: day, value: counts[index] }));
}

function habitPanels(model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">): RightInsightPanelCard[] {
  const noSpendDays = noSpendDayCount(model);
  const elapsedDays = periodDayCount(model);
  const repeatedTotal = model.habits.reduce((sum, habit) => sum + habit.amount, 0);

  return [
    {
      eyebrow: "Habit Loop",
      title: "소비 리듬",
      visuals: [
        {
          type: "progress",
          title: "무지출일",
          value: ratio(noSpendDays, elapsedDays),
          detail: `${elapsedDays}일 중 ${noSpendDays}일 확보`,
          tone: noSpendDays >= 5 ? "stable" : "watch",
        },
        {
          type: "weekday",
          rows: weekdayRows(model),
        },
      ],
    },
    {
      eyebrow: "Repeated",
      title: "반복 패턴 집중도",
      visuals: [
        {
          type: "bars",
          rows: model.habits.slice(0, 5).map((habit) => ({
            label: habit.name,
            value: habit.amount,
            detail: `${habit.count}회 · ${habit.lastDate}`,
          })),
        },
        { type: "note", text: `반복 상호 누적 ${won(repeatedTotal)}입니다.` },
      ],
    },
  ];
}

function analysisPanels(model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">): RightInsightPanelCard[] {
  const volatileCategories = model.categories
    .filter((category) => category.averageAmount > 0)
    .map((category) => ({
      label: category.name,
      value: Math.abs(category.currentAmount - category.averageAmount),
      detail: `${ratio(category.currentAmount, category.averageAmount)}%`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const anomalyLike = model.categories.filter((category) => (
    category.averageAmount > 0 && category.currentAmount > Math.max(category.averageAmount * 1.3, 100_000)
  ));

  return [
    {
      eyebrow: "Rule Signals",
      title: "이상 신호 후보",
      visuals: [
        {
          type: "progress",
          title: "급등 카테고리",
          value: ratio(anomalyLike.length, model.categories.length),
          detail: anomalyLike.length > 0 ? `${anomalyLike.length}/${model.categories.length}개 관찰 대상` : "급등 신호 없음",
          tone: anomalyLike.length > 0 ? "watch" : "stable",
        },
        { type: "bars", rows: volatileCategories },
      ],
    },
    {
      eyebrow: "Payment Risk",
      title: "집중 결제수단",
      visuals: [
        {
          type: "bars",
          rows: model.paymentMix.slice(0, 5).map((row) => ({
            label: row.name,
            value: row.amount,
            detail: `${row.count}건`,
          })),
        },
      ],
    },
  ];
}

function buildRightInsightPanels(
  key: SectionKey,
  model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">,
): RightInsightPanelCard[] {
  const panelBuilders: Record<SectionKey, Array<RightInsightPanelCard>> = {
    ledger: ledgerQualityPanels(model),
    trend: trendPanels(model),
    budget: budgetPanels(model),
    assets: assetPanels(model),
    analysis: analysisPanels(model),
    habits: habitPanels(model),
  };

  return panelBuilders[key];
}

async function getTrendProjectionMetric(): Promise<SectionMetric | null> {
  try {
    const overview = await getOverviewViewModel();
    const forecast = overview.summary.find((metric) => metric.id === "forecast");
    if (!forecast) return null;

    return {
      label: "실지출 예상",
      value: forecast.value,
      detail: "현재 지출 + ML 잔여 예측",
      tone: forecast.tone,
    };
  } catch {
    return null;
  }
}

function buildInsights(key: SectionKey, model: Omit<SectionViewModel, "metrics" | "insights" | "rightInsightPanels">): SectionInsight[] {
  const spend = selectedExpenseTotal(model);
  const avgSpend = historicalAverageSpend(model.monthlyTrend);
  const trendMonthlyAverage = monthlyAverageSpend(model.monthlyTrend);
  const leader = model.categories[0];
  const payment = model.paymentMix[0];
  const habit = model.habits[0];
  const spendRatio = isPeriodAggregate(model) ? 100 : ratio(spend, avgSpend);
  const fixedShare = ratio(model.fixedExpense.currentAmount, spend);
  const fixedAvgRatio = ratio(model.fixedExpense.currentAmount, model.fixedExpense.averageAmount);
  const fixedLeaders = model.fixedExpense.topAccounts.map((account) => account.name).join("·");

  const periodLabel = model.selectedPeriod?.label ?? model.context.monthShortLabel;
  const spendSignalBody = isPeriodAggregate(model)
    ? `${periodLabel} 지출 합계는 ${won(spend)}이고 월평균은 ${won(trendMonthlyAverage)}입니다.`
    : `${periodLabel} 지출은 기준 평균의 ${spendRatio}%입니다. 평균 대비 105% 이상이면 관찰 대상으로 분류합니다.`;

  return [
    {
      title: `${periodLabel} 지출 속도`,
      body: spendSignalBody,
      tone: toneFromRatio(spendRatio),
    },
    {
      title: "고정지출 구조",
      body: model.fixedExpense.currentAmount > 0
        ? `${periodLabel} 고정지출은 ${won(model.fixedExpense.currentAmount)}로 전체 지출의 ${fixedShare}%입니다. 주요 항목은 ${fixedLeaders || "집계 없음"}입니다.`
        : `${periodLabel} steady 계정으로 분류된 고정지출이 아직 없습니다.`,
      tone: fixedAvgRatio >= 115 || fixedShare >= 70 ? "watch" : "stable",
    },
    {
      title: leader ? `${leader.name} 비중 확인` : "카테고리 지출 없음",
      body: leader
        ? `${leader.name} 카테고리가 ${won(leader.currentAmount)}로 가장 큽니다. 과거 평균은 ${won(leader.averageAmount)}입니다.`
        : `${periodLabel} 후잉 expenses 계정 거래가 아직 없습니다.`,
      tone: leader && leader.currentAmount > Math.max(leader.averageAmount * 1.3, 100_000) ? "watch" : "stable",
    },
    {
      title: payment ? `${payment.name} 집중도` : "결제수단 데이터 없음",
      body: payment
        ? `${payment.name}에서 ${payment.count}건, ${won(payment.amount)}가 발생했습니다. 카드/계좌별 분산 상태를 확인하세요.`
        : `${periodLabel} 지출 결제수단이 아직 집계되지 않았습니다.`,
      tone: payment && payment.amount > spend * 0.45 ? "watch" : "stable",
    },
    {
      title: habit ? `${habit.name} 반복 패턴` : `${key} 화면 기준`,
      body: habit
        ? `${habit.name}은 선택 기간 ${habit.count}회 반복되었고 누적 ${won(habit.amount)}입니다. 마지막 발생일은 ${habit.lastDate}입니다.`
        : "반복 상호는 선택 기간 2회 이상 발생한 지출만 표시합니다.",
      tone: habit && habit.amount > 100_000 ? "watch" : "stable",
    },
  ];
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function resolveLedgerMonth(months: SectionViewModel["ledgerMonths"], requestedMonth?: string | null) {
  if (months.length === 0) return null;

  if (requestedMonth && months.some((month) => month.value === requestedMonth)) {
    return requestedMonth;
  }

  const currentMonth = currentMonthValue();
  return months.some((month) => month.value === currentMonth) ? currentMonth : months[0].value;
}

export async function getSectionViewModel(
  key: SectionKey,
  options: { ledgerMonth?: string | null; periodQuery?: PeriodQuery } = {},
): Promise<SectionViewModel> {
  const supportsPeriodFilter = periodFilterKeys.has(key);
  const ledgerMonths = supportsPeriodFilter ? await getAvailableLedgerMonths() : [];
  const periodOptions = supportsPeriodFilter ? buildPeriodOptions(ledgerMonths) : { years: [], months: [] };
  const selectedPeriod = supportsPeriodFilter
    ? resolvePeriod(options.periodQuery ?? { period: "month", month: options.ledgerMonth ?? undefined }, periodOptions)
    : null;
  const selectedLedgerMonth = supportsPeriodFilter
    ? selectedPeriod?.month ?? (key === "ledger" ? resolveLedgerMonth(ledgerMonths, options.ledgerMonth) : null)
    : null;
  const basisMonth = selectedPeriod?.mode === "month" ? selectedPeriod.month ?? selectedLedgerMonth : null;
  const trendProjectionMetric = key === "trend" && selectedPeriod?.mode === "month" && selectedPeriod.month === currentMonthValue()
    ? await getTrendProjectionMetric()
    : null;

  const [
    context,
    periodAggregate,
    monthlyTrend,
    categories,
    accounts,
    ledger,
    paymentMix,
    habits,
    fixedExpense,
    fixedExpenseScheduleSource,
  ] = await Promise.all([
    getWorkspaceContext(basisMonth),
    getPeriodAggregate(basisMonth, selectedPeriod),
    getMonthlyTrend(basisMonth, selectedPeriod),
    getCategoryAnalytics(basisMonth, selectedPeriod),
    getAccountAnalytics(),
    getLedgerRows(key === "ledger"
      ? { limit: selectedPeriod?.mode === "month" ? null : 500, period: selectedPeriod }
      : key === "habits"
        ? { limit: null, period: selectedPeriod }
        : key === "analysis"
          ? { limit: 500, period: selectedPeriod }
          : { limit: 40 }),
    getPaymentMix(basisMonth, selectedPeriod),
    getMerchantHabits(basisMonth, selectedPeriod),
    getFixedExpenseSummary(basisMonth, selectedPeriod),
    getFixedExpenseSchedule(basisMonth),
  ]);
  const fixedExpenseSchedule = buildFixedExpenseSchedule(
    fixedExpenseScheduleSource.rows,
    referenceDayForMonth(fixedExpenseScheduleSource.targetMonth),
  );

  const base = {
    key,
    context,
    header: sectionMeta[key],
    periodAggregate,
    monthlyTrend,
    categories,
    accounts,
    ledger,
    ledgerMonths,
    selectedLedgerMonth,
    periodOptions,
    selectedPeriod,
    paymentMix,
    habits,
    fixedExpense,
    fixedExpenseSchedule,
  };

  return {
    ...base,
    metrics: buildMetrics(key, base, { trendProjectionMetric }),
    insights: buildInsights(key, base),
    rightInsightPanels: buildRightInsightPanels(key, base),
  };
}
