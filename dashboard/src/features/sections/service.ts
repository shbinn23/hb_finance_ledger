import {
  getAccountAnalytics,
  getAvailableLedgerMonths,
  getCategoryAnalytics,
  getFixedExpenseSummary,
  getLedgerRows,
  getMerchantHabits,
  getMonthlyTrend,
  getPaymentMix,
  getWorkspaceContext,
} from "@/server/whooing/analytics-repository";
import { won, wonCompact } from "@/lib/format";
import type { SectionInsight, SectionKey, SectionMetric, SectionViewModel } from "./types";

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

function buildMetrics(key: SectionKey, model: Omit<SectionViewModel, "metrics" | "insights">): SectionMetric[] {
  const spend = currentMonthSpend(model.monthlyTrend);
  const previousSpend = previousMonthSpend(model.monthlyTrend);
  const avgSpend = average(model.monthlyTrend.slice(0, -1).map((row) => row.expenses));
  const assets = model.accounts.filter((account) => account.kind === "asset");
  const liabilities = model.accounts.filter((account) => account.kind === "liability");
  const assetTotal = assets.reduce((sum, account) => sum + account.amount, 0);
  const liabilityTotal = liabilities.reduce((sum, account) => sum + account.amount, 0);
  const categoryLeader = model.categories[0];
  const repeatedTotal = model.habits.reduce((sum, habit) => sum + habit.amount, 0);
  const spendRatio = ratio(spend, avgSpend);
  const fixedShare = ratio(model.fixedExpense.currentAmount, spend);
  const fixedTone = toneFromRatio(ratio(model.fixedExpense.currentAmount, model.fixedExpense.averageAmount));
  const ledgerSpendLabel = model.selectedLedgerMonth === currentMonthValue() ? "이번 달 지출" : "월 지출";
  const ledgerMonthDetail = model.context.monthShortLabel;

  const common: Record<SectionKey, SectionMetric[]> = {
    ledger: [
      { label: "거래 건수", value: `${model.ledger.length}건`, detail: `${ledgerMonthDetail} entries`, tone: "stable" },
      { label: ledgerSpendLabel, value: won(spend), detail: `${ledgerMonthDetail} expenses 계정 기준`, tone: "stable" },
      { label: "전월 대비", value: `${ratio(spend, previousSpend || spend)}%`, detail: `${ledgerMonthDetail} / 직전 월`, tone: toneFromRatio(ratio(spend, previousSpend || spend)) },
      { label: "동기화", value: `${model.context.entryCount.toLocaleString("ko-KR")}건`, detail: model.context.asOf, tone: "stable" },
    ],
    trend: [
      { label: "이번 달", value: won(spend), detail: model.context.monthLabel, tone: toneFromRatio(spendRatio) },
      { label: "최근 평균", value: won(avgSpend), detail: "이전 월 평균 지출", tone: "stable" },
      { label: "평균 대비", value: `${spendRatio}%`, detail: "현재 월 / 과거 평균", tone: toneFromRatio(spendRatio) },
      { label: "이번 달 수입", value: won(model.monthlyTrend.at(-1)?.income ?? 0), detail: "income 계정 기준", tone: "stable" },
    ],
    budget: [
      { label: "관리 카테고리", value: `${model.categories.length}개`, detail: "이번 달 지출 발생", tone: "stable" },
      { label: "최대 지출", value: categoryLeader ? won(categoryLeader.currentAmount) : "0원", detail: categoryLeader?.name ?? "없음", tone: "watch" },
      { label: "고정지출", value: won(model.fixedExpense.currentAmount), detail: `전체 지출의 ${fixedShare}%`, tone: fixedTone },
      { label: "평균 대비", value: `${spendRatio}%`, detail: "월 지출 전체 기준", tone: toneFromRatio(spendRatio) },
    ],
    assets: [
      { label: "총 자산", value: won(assetTotal), detail: `${assets.length}개 계정`, tone: "stable" },
      { label: "총 부채", value: won(liabilityTotal), detail: `${liabilities.length}개 계정`, tone: liabilityTotal > 0 ? "watch" : "stable" },
      { label: "순자산", value: won(assetTotal - liabilityTotal), detail: "자산 - 부채", tone: "stable" },
      { label: "카드 미결제", value: won(liabilities.filter((account) => account.category.includes("card")).reduce((sum, account) => sum + account.amount, 0)), detail: "credit/check card", tone: "watch" },
    ],
    analysis: [
      { label: "월 지출", value: won(spend), detail: `${model.context.monthShortLabel} 기준`, tone: toneFromRatio(spendRatio) },
      { label: "상위 카테고리", value: categoryLeader?.name ?? "없음", detail: categoryLeader ? won(categoryLeader.currentAmount) : "지출 없음", tone: "watch" },
      { label: "고정지출", value: wonCompact(model.fixedExpense.currentAmount), detail: `steady ${model.fixedExpense.transactionCount}건`, tone: fixedTone },
      { label: "반복 지출", value: wonCompact(repeatedTotal), detail: `${model.habits.length}개 패턴`, tone: repeatedTotal > spend * 0.35 ? "watch" : "stable" },
    ],
    habits: [
      { label: "반복 상호", value: `${model.habits.length}개`, detail: "최근 6개월 2회 이상", tone: "stable" },
      { label: "반복 합계", value: wonCompact(repeatedTotal), detail: "반복 상호 총액", tone: repeatedTotal > spend * 0.35 ? "watch" : "stable" },
      { label: "최다 반복", value: model.habits[0]?.name ?? "없음", detail: model.habits[0] ? `${model.habits[0].count}회` : "패턴 없음", tone: "watch" },
      { label: "주 결제수단", value: model.paymentMix[0]?.name ?? "없음", detail: model.paymentMix[0] ? `${model.paymentMix[0].count}건` : "이번 달 없음", tone: "neutral" },
    ],
  };

  return common[key];
}

function buildInsights(key: SectionKey, model: Omit<SectionViewModel, "metrics" | "insights">): SectionInsight[] {
  const spend = currentMonthSpend(model.monthlyTrend);
  const avgSpend = average(model.monthlyTrend.slice(0, -1).map((row) => row.expenses));
  const leader = model.categories[0];
  const payment = model.paymentMix[0];
  const habit = model.habits[0];
  const spendRatio = ratio(spend, avgSpend);
  const fixedShare = ratio(model.fixedExpense.currentAmount, spend);
  const fixedAvgRatio = ratio(model.fixedExpense.currentAmount, model.fixedExpense.averageAmount);
  const fixedLeaders = model.fixedExpense.topAccounts.map((account) => account.name).join("·");

  return [
    {
      title: `${model.context.monthShortLabel} 지출 속도`,
      body: `${model.context.monthShortLabel} 지출은 과거 평균의 ${spendRatio}%입니다. 평균 대비 105% 이상이면 관찰 대상으로 분류합니다.`,
      tone: toneFromRatio(spendRatio),
    },
    {
      title: "고정지출 구조",
      body: model.fixedExpense.currentAmount > 0
        ? `${model.context.monthShortLabel} 고정지출은 ${won(model.fixedExpense.currentAmount)}로 전체 지출의 ${fixedShare}%입니다. 주요 항목은 ${fixedLeaders || "집계 없음"}입니다.`
        : `${model.context.monthShortLabel} steady 계정으로 분류된 고정지출이 아직 없습니다.`,
      tone: fixedAvgRatio >= 115 || fixedShare >= 70 ? "watch" : "stable",
    },
    {
      title: leader ? `${leader.name} 비중 확인` : "카테고리 지출 없음",
      body: leader
        ? `${leader.name} 카테고리가 ${won(leader.currentAmount)}로 가장 큽니다. 과거 평균은 ${won(leader.averageAmount)}입니다.`
        : `${model.context.monthShortLabel} 후잉 expenses 계정 거래가 아직 없습니다.`,
      tone: leader && leader.currentAmount > Math.max(leader.averageAmount * 1.3, 100_000) ? "watch" : "stable",
    },
    {
      title: payment ? `${payment.name} 집중도` : "결제수단 데이터 없음",
      body: payment
        ? `${payment.name}에서 ${payment.count}건, ${won(payment.amount)}가 발생했습니다. 카드/계좌별 분산 상태를 확인하세요.`
        : `${model.context.monthShortLabel} 지출 결제수단이 아직 집계되지 않았습니다.`,
      tone: payment && payment.amount > spend * 0.45 ? "watch" : "stable",
    },
    {
      title: habit ? `${habit.name} 반복 패턴` : `${key} 화면 기준`,
      body: habit
        ? `${habit.name}은 최근 기간 ${habit.count}회 반복되었고 누적 ${won(habit.amount)}입니다. 마지막 발생일은 ${habit.lastDate}입니다.`
        : "반복 상호는 최근 6개월 2회 이상 발생한 지출만 표시합니다.",
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
  options: { ledgerMonth?: string | null } = {},
): Promise<SectionViewModel> {
  const ledgerMonths = key === "ledger" ? await getAvailableLedgerMonths() : [];
  const selectedLedgerMonth = key === "ledger" ? resolveLedgerMonth(ledgerMonths, options.ledgerMonth) : null;
  const basisMonth = selectedLedgerMonth;

  const [context, monthlyTrend, categories, accounts, ledger, paymentMix, habits, fixedExpense] = await Promise.all([
    getWorkspaceContext(basisMonth),
    getMonthlyTrend(basisMonth),
    getCategoryAnalytics(basisMonth),
    getAccountAnalytics(),
    getLedgerRows(key === "ledger"
      ? { limit: null, month: selectedLedgerMonth }
      : { limit: 40 }),
    getPaymentMix(basisMonth),
    getMerchantHabits(basisMonth),
    getFixedExpenseSummary(basisMonth),
  ]);

  const base = {
    key,
    context,
    header: sectionMeta[key],
    monthlyTrend,
    categories,
    accounts,
    ledger,
    ledgerMonths,
    selectedLedgerMonth,
    paymentMix,
    habits,
    fixedExpense,
  };

  return {
    ...base,
    metrics: buildMetrics(key, base),
    insights: buildInsights(key, base),
  };
}
