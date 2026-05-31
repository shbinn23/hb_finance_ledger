import { formatDisplayDate, won, wonCompact } from "@/lib/format";
import { getWhooingOverviewSource } from "@/server/whooing/repository";
import { getWhooingAnomalyTaskRows, getWhooingForecastTaskSource } from "@/server/whooing/ml-task-repository";
import {
  getAvailableLedgerMonths,
  getFixedExpenseSchedule,
  getMonthlyTrend,
  getPeriodAggregate,
} from "@/server/whooing/analytics-repository";
import { fetchMlAnomalies, fetchMlForecast, isMlEngineEnabled, type MlAnomalyResult, type MlForecastResult } from "@/server/ml/client";
import { buildSpendingSeries, projectSpendingMonthEnd } from "@/lib/financial-analysis/spending-series";
import { buildFixedExpenseSchedule, referenceDayForMonth, type FixedExpenseScheduleRow } from "@/lib/financial-analysis/fixed-expense-schedule";
import { calculateAvailableResource, calculateSavingDefenseBalance, FINANCIAL_PLAN } from "@/lib/financial-analysis/resource-reservation";
import { buildPeriodOptions, resolvePeriod, type PeriodQuery, type ResolvedPeriod } from "@/lib/period-filter";
import { buildAnomalyPayload, buildAnomalyTask, buildForecastPayload, buildForecastTask } from "./task-adapter";
import type { RightInsightChartRow, RightInsightPanelCard } from "@/features/sections/types";
import type { MlAnomalyRow, MlForecastPoint, MlInsightsViewModel, MlMetric, MlPeriodReport } from "./types";

const monthlyLimit = Number(process.env.MONTHLY_SPEND_LIMIT ?? 2_100_000);

function cumulative(points: Array<{ day: number; amount: number }>) {
  let total = 0;
  return points
    .sort((a, b) => a.day - b.day)
    .map((point) => {
      total += point.amount;
      return { day: point.day, amount: total };
    });
}

function toneFromProjection(projectedFinal: number): "stable" | "watch" | "over" {
  if (projectedFinal >= monthlyLimit * 1.08) return "over";
  if (projectedFinal >= monthlyLimit) return "watch";
  return "stable";
}

function toneFromConfidence(errorRate: number): "stable" | "watch" | "over" {
  if (errorRate >= 20) return "over";
  if (errorRate >= 10) return "watch";
  return "stable";
}

function actualProjectionFinal(points: MlForecastPoint[]) {
  return points.findLast((point) => point.actualProjection !== null)?.actualProjection ?? null;
}

function observedForecastPoint(points: MlForecastPoint[]) {
  return points.findLast((point) => point.actual !== null && point.projected !== null) ?? null;
}

function ratioPercent(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function signedWonCompact(value: number) {
  if (value === 0) return wonCompact(0);
  return `${value > 0 ? "+" : "-"}${wonCompact(Math.abs(value))}`;
}

function calculateCurrentVariableSpend(currentExpenseByCategory: Array<{ category: string; amount: number }>) {
  return currentExpenseByCategory
    .filter((row) => row.category === "floating" || row.category === "normal")
    .reduce((sum, row) => sum + row.amount, 0);
}

function summarizeFixedReservation(schedule: FixedExpenseScheduleRow[]) {
  return schedule.reduce((summary, row) => {
    if (row.currentAmount > 0) {
      summary.currentFixedAmount += row.currentAmount;
    } else {
      summary.remainingFixedScheduledAmount += row.expectedAmount;
    }

    return summary;
  }, { currentFixedAmount: 0, remainingFixedScheduledAmount: 0 });
}

function remainingDaysInMonth(today: string) {
  const [year, month, day] = today.split("-").map(Number);
  if (!year || !month || !day) return 0;

  const daysInMonth = new Date(year, month, 0).getDate();
  return Math.max(0, daysInMonth - day);
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function lastDateOfMonth(month: string) {
  const [year, monthValue] = month.split("-").map(Number);
  const day = new Date(year, monthValue, 0).getDate();
  return `${year}-${String(monthValue).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function forecastReferenceDate(period: ResolvedPeriod) {
  if (period.mode !== "month" || !period.month) {
    return undefined;
  }

  return period.month === currentMonthValue()
    ? undefined
    : lastDateOfMonth(period.month);
}

function dailyAvailableResource(availableResource: number, remainingDays: number) {
  if (remainingDays <= 0) return availableResource;
  return Math.trunc(availableResource / remainingDays);
}

function mergeForecast(
  actualDaily: Array<{ day: number; amount: number }>,
  baseline: Array<{ day: number; amount: number }>,
  forecast: MlForecastResult | null,
): { points: MlForecastPoint[]; projectedFinal: number; source: "ml" | "fallback" } {
  const actual = cumulative(actualDaily);
  const currentSpend = actual.at(-1)?.amount ?? 0;
  const lastDay = Math.max(1, actual.at(-1)?.day ?? 1);
  const points = buildSpendingSeries(actualDaily, baseline, forecast).map((point) => ({
    ...point,
    ai: point.ai ?? null,
  }));

  if (!forecast) {
    return {
      source: "fallback",
      projectedFinal: projectSpendingMonthEnd(currentSpend, lastDay),
      points,
    };
  }

  return {
    source: "ml",
    projectedFinal: forecast.projectedFinal,
    points,
  };
}

function buildMetrics(
  projectedFinal: number,
  anomalyCount: number,
  source: "ml" | "fallback",
  forecastConfidence: MlMetric | null,
  resourceDailyAmount: number,
  forecastLabel = "월말 예측",
  forecastDetail?: string,
): MlMetric[] {
  const delta = projectedFinal - monthlyLimit;

  return [
    {
      label: forecastLabel,
      value: wonCompact(projectedFinal),
      detail: forecastDetail ?? (source === "ml" ? "ML 원본 forecast" : "linear fallback"),
      tone: toneFromProjection(projectedFinal),
    },
    {
      label: "예산 차이",
      value: wonCompact(Math.abs(delta)),
      detail: delta > 0 ? "월 지출 한도 기준 부족" : "월 지출 한도 기준 여유",
      tone: delta > 0 ? "over" : "stable",
    },
    {
      label: "이상 후보",
      value: `${anomalyCount}건`,
      detail: "IsolationForest flagged",
      tone: anomalyCount > 0 ? "watch" : "stable",
    },
    {
      label: "일 가용",
      value: won(resourceDailyAmount),
      detail: "가용 리소스 / 남은 일수",
      tone: resourceDailyAmount < 0 ? "over" : resourceDailyAmount < 30_000 ? "watch" : "stable",
    },
    forecastConfidence ?? {
      label: "예측 신뢰도",
      value: "-",
      detail: source === "ml" ? "실제 누적과 ML 예상 오차 계산 대기" : "ML 예상 없음",
      tone: "stable",
    },
  ];
}

function buildPeriodReportMetrics(params: {
  period: ResolvedPeriod;
  expenses: number;
  transactionCount: number;
  anomalyCount: number;
  inputRows: number;
  monthCount: number;
}): MlMetric[] {
  const average = params.monthCount > 0 ? Math.round(params.expenses / params.monthCount) : 0;

  return [
    {
      label: "기간 지출",
      value: wonCompact(params.expenses),
      detail: `${params.period.label} expenses 합계`,
      tone: params.expenses > monthlyLimit * Math.max(1, params.monthCount) ? "watch" : "stable",
    },
    {
      label: "월평균",
      value: wonCompact(average),
      detail: params.monthCount > 0 ? `${params.monthCount}개월 기준` : "월별 지출 데이터 없음",
      tone: average > monthlyLimit ? "watch" : "stable",
    },
    {
      label: "이상 후보",
      value: `${params.anomalyCount}건`,
      detail: "선택 기간 anomaly rows",
      tone: params.anomalyCount > 0 ? "watch" : "stable",
    },
    {
      label: "지출 거래",
      value: `${params.transactionCount}건`,
      detail: "선택 기간 expenses 거래",
      tone: "stable",
    },
    {
      label: "모델 입력",
      value: `${params.inputRows}건`,
      detail: "기간 리포트 입력 rows",
      tone: params.inputRows > 0 ? "stable" : "watch",
    },
  ];
}

function buildForecastConfidence(points: MlForecastPoint[]): MlMetric | null {
  const point = points.findLast((row) => row.actual !== null && row.projected !== null);
  if (!point || point.projected === null || point.projected <= 0 || point.actual === null) return null;

  const actual = point.actual;
  const projected = point.projected;
  const errorAmount = actual - projected;
  const errorRate = Math.round((Math.abs(errorAmount) / projected) * 100);
  const confidence = Math.max(0, 100 - errorRate);

  return {
    label: "예측 신뢰도",
    value: `${confidence}%`,
    detail: `실제 누적과 ML 예상 오차 ${errorRate}%`,
    tone: toneFromConfidence(errorRate),
  };
}

function buildRiskDriverRows(anomalies: MlAnomalyResult[]): RightInsightChartRow[] {
  const rows = (anomalies.some((row) => row.isAnomaly)
    ? anomalies.filter((row) => row.isAnomaly)
    : anomalies
  )
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .map((row) => ({
      label: row.category,
      value: row.amount,
      detail: `${row.description} · ${won(row.amount)}`,
    }));

  return rows;
}

function buildCoachBody(
  source: "ml" | "fallback",
  projectedFinal: number,
  actualProjection: number,
  anomalyCount: number,
  tone: "stable" | "watch" | "over",
  engineEnabled: boolean,
) {
  if (source !== "ml") {
    return engineEnabled
      ? "ML 엔진 응답이 없어 현재 누적 지출의 일평균으로 월말 예상치를 계산했습니다."
      : "퍼블리싱 안정성을 위해 Chronos 자동 실행을 꺼두고, 현재 누적 지출의 일평균으로 월말 예상치를 표시합니다.";
  }

  const delta = actualProjection - projectedFinal;
  const projectionText = delta >= 0
    ? `실지출 예상은 ${won(actualProjection)}으로, 순수 ML 예상보다 ${won(Math.abs(delta))} 빠릅니다.`
    : `실지출 예상은 ${won(actualProjection)}으로, 순수 ML 예상보다 ${won(Math.abs(delta))} 낮습니다.`;
  const actionText = anomalyCount > 0
    ? `이상 후보 ${anomalyCount}건을 먼저 확인하세요.`
    : tone === "over"
      ? "남은 기간에는 선택 지출 속도를 낮추는 것이 좋습니다."
      : "고정비는 이미 예측에 반영되어 있으니 선택 지출만 점검하세요.";

  return `${projectionText} ${actionText}`;
}

function buildMlRightInsightPanels(params: {
  points: MlForecastPoint[];
  anomalies: MlAnomalyResult[];
  source: "ml" | "fallback";
  forecast: MlForecastResult | null;
  forecastActualLength: number;
  fixedProfileCount: number;
  anomalyCandidateCount: number;
  projectedFinal: number;
  actualProjection: number;
  savingDefenseBalance: number;
  tone: "stable" | "watch" | "over";
  engineEnabled: boolean;
}): RightInsightPanelCard[] {
  const observed = observedForecastPoint(params.points);
  const actual = observed?.actual ?? 0;
  const projected = observed?.projected ?? 0;
  const actualDelta = actual - projected;
  const actualRatio = ratioPercent(actual, projected);
  const riskDrivers = buildRiskDriverRows(params.anomalies);
  const flaggedCount = params.anomalies.filter((row) => row.isAnomaly).length;
  const inputDetail = [
    `actual ${params.forecastActualLength}일`,
    `fixed ${params.fixedProfileCount}개`,
    `anomaly ${params.anomalyCandidateCount}건`,
    params.source === "ml" ? "fallback 없음" : "fallback 사용",
  ].join(" · ");
  const projectionDelta = params.actualProjection - params.projectedFinal;
  const savingDefenseText = params.savingDefenseBalance < 0
    ? `저축 방어 기준 ${won(Math.abs(params.savingDefenseBalance))} 부족합니다.`
    : `저축 방어 기준 ${won(params.savingDefenseBalance)} 여유가 있습니다.`;

  return [
    {
      eyebrow: "Model Boundary",
      title: "모델 경계",
      visuals: [
        {
          type: "note",
          text: "모델은 반복 패턴과 고정비 fixed profile을 기준으로 월말 지출을 추정합니다. 이벤트성 지출, 누락 거래, 아직 입력되지 않은 거래는 변동 요인입니다.",
        },
      ],
    },
    {
      eyebrow: "Actual vs ML",
      title: "실제 vs ML",
      visuals: [
        {
          type: "bullet",
          title: observed ? `${observed.day}일 누적 비교` : "누적 비교 대기",
          value: observed ? `${actualRatio}%` : "-",
          detail: observed
            ? `실제 ${wonCompact(actual)} · ML ${wonCompact(projected)} · ${signedWonCompact(actualDelta)}`
            : "실제와 ML 예상이 겹치는 관측일이 아직 없습니다.",
          percent: projected > 0 ? actualRatio * 0.8 : 0,
          tone: actualDelta > 0 ? "watch" : "stable",
        },
      ],
    },
    {
      eyebrow: "Risk Drivers",
      title: "위험 원인",
      visuals: riskDrivers.length > 0
        ? [{ type: "bars", rows: riskDrivers }]
        : [{ type: "note", text: "관찰 가능한 위험 원인이 충분하지 않습니다." }],
    },
    {
      eyebrow: "Model Inputs",
      title: "모델 입력",
      visuals: [
        {
          type: "progress",
          title: params.source === "ml" ? "입력 신뢰 상태" : "fallback 상태",
          value: params.source === "ml" ? 100 : 35,
          detail: inputDetail,
          tone: params.source === "ml" ? "stable" : "watch",
        },
      ],
    },
    {
      eyebrow: "Action Guide",
      title: "다음 행동",
      visuals: [
        {
          type: "note",
          text: projectionDelta > 0
            ? `실지출 예상이 ML보다 ${won(Math.abs(projectionDelta))} 빠릅니다. ${savingDefenseText} 이상 후보 ${flaggedCount}건을 우선 확인하세요.`
            : `실지출 예상이 ML 범위 안에 있습니다. ${savingDefenseText} 고정비는 예측에 반영되어 있습니다.`,
        },
      ],
    },
  ];
}

function buildMlPeriodRightInsightPanels(params: {
  period: ResolvedPeriod;
  expenses: number;
  anomalies: MlAnomalyResult[];
  monthlyTrend: Array<{ label: string; expenses: number }>;
  inputRows: number;
  engineEnabled: boolean;
}): RightInsightPanelCard[] {
  const flaggedCount = params.anomalies.filter((row) => row.isAnomaly).length;
  const riskDrivers = buildRiskDriverRows(params.anomalies);
  const monthCount = params.monthlyTrend.length;
  const trendRows = params.monthlyTrend.map((row) => ({
    label: row.label,
    value: row.expenses,
    detail: won(row.expenses),
  }));

  return [
    {
      eyebrow: "Period Boundary",
      title: "기간 경계",
      visuals: [
        {
          type: "note",
          text: `${params.period.label}은 월말 forecast가 아니라 실제 지출과 이상 후보 중심으로 해석합니다. 선택 기간의 저장된 ML 예측 이력이 없습니다.`,
        },
      ],
    },
    {
      eyebrow: "Anomaly Summary",
      title: "이상 후보 요약",
      visuals: riskDrivers.length > 0
        ? [{ type: "bars", rows: riskDrivers }]
        : [{ type: "note", text: "선택 기간에 표시할 이상 후보가 없습니다." }],
    },
    {
      eyebrow: "Data Quality",
      title: "데이터 품질",
      visuals: [
        {
          type: "progress",
          title: "기간 입력 커버리지",
          value: params.inputRows > 0 ? 100 : 0,
          detail: `${params.inputRows}개 입력 row · ${monthCount}개월 흐름`,
          tone: params.inputRows > 0 ? "stable" : "watch",
        },
      ],
    },
    {
      eyebrow: "Model Limit",
      title: "모델 한계",
      visuals: [
        {
          type: "note",
          text: params.engineEnabled
            ? "기간 모드에서는 forecast API를 호출하지 않습니다. 월말 예측은 월 선택에서만 해석합니다."
            : "ML 엔진 자동 실행이 꺼져 있어 기간 리포트는 저장된 거래 기준으로 표시합니다.",
        },
      ],
    },
    {
      eyebrow: "Action Guide",
      title: "다음 행동",
      visuals: [
        {
          type: "note",
          text: flaggedCount > 0
            ? `이상 후보 ${flaggedCount}건을 우선 확인하고, 월별 지출 흐름에서 급등한 달을 대조하세요.`
            : "기간 지출 흐름을 확인하고, 필요하면 월 모드로 전환해 월말 예측을 따로 보세요.",
        },
      ],
    },
    {
      eyebrow: "Actual Flow",
      title: "월별 실제 지출",
      visuals: trendRows.length > 0
        ? [{ type: "sparkline", rows: trendRows }]
        : [{ type: "note", text: "선택 기간의 월별 지출 데이터가 없습니다." }],
    },
  ];
}

function mapAnomalyRows(anomalies: MlAnomalyResult[]): MlAnomalyRow[] {
  return anomalies.slice(0, 14).map((row) => ({
    date: formatDisplayDate(row.date),
    description: row.description,
    category: row.category,
    amount: won(row.amount),
    score: `${Math.round(row.score)}점`,
    isAnomaly: row.isAnomaly,
  }));
}

async function buildMlPeriodReportViewModel(params: {
  selectedPeriod: ResolvedPeriod;
  periodOptions: ReturnType<typeof buildPeriodOptions>;
  engineEnabled: boolean;
}): Promise<MlInsightsViewModel> {
  const anomalyTask = buildAnomalyTask();
  const [periodAggregate, monthlyTrend, anomalyFeatureRows] = await Promise.all([
    getPeriodAggregate(null, params.selectedPeriod),
    getMonthlyTrend(null, params.selectedPeriod),
    getWhooingAnomalyTaskRows(anomalyTask.today, params.selectedPeriod),
  ]);
  const anomalies = await fetchMlAnomalies(buildAnomalyPayload(anomalyTask.today, anomalyFeatureRows));
  const flaggedCount = anomalies.filter((row) => row.isAnomaly).length;
  const periodReport: MlPeriodReport = {
    title: "월별 실제 지출",
    description: "기간 모드에서는 forecast를 월말 예측으로 표시하지 않고 실제 월별 지출 흐름을 보여줍니다.",
    monthlyTrend,
    emptyText: "선택 기간의 월별 지출 데이터가 없습니다.",
  };

  return {
    mode: "period-report",
    selectedPeriod: params.selectedPeriod,
    periodOptions: params.periodOptions,
    header: {
      title: "ML 인사이트",
      description: `${params.selectedPeriod.label} 기준의 기간 ML 리포트입니다. 이 기간은 실제 지출과 이상 후보 중심으로 표시합니다.`,
      badge: "기간 리포트",
    },
    source: "fallback",
    engineEnabled: params.engineEnabled,
    coach: {
      title: "기간 ML 리포트",
      body: "선택 기간의 저장된 ML 예측 이력이 없습니다. 이 기간은 실제 지출과 이상 후보 중심으로 표시합니다.",
      tone: flaggedCount > 0 ? "watch" : "stable",
    },
    metrics: buildPeriodReportMetrics({
      period: params.selectedPeriod,
      expenses: periodAggregate.expenses,
      transactionCount: periodAggregate.expenseTransactionCount,
      anomalyCount: flaggedCount,
      inputRows: anomalyFeatureRows.length,
      monthCount: monthlyTrend.length,
    }),
    forecast: [],
    periodReport,
    anomalies: mapAnomalyRows(anomalies),
    status: [
      { label: "Report period", value: params.selectedPeriod.label, detail: params.selectedPeriod.mode },
      { label: "Forecast mode", value: "disabled", detail: "기간 모드에서는 forecast API를 호출하지 않음" },
      { label: "Anomaly task", value: anomalyTask.metric, detail: anomalyTask.dimensions.join(" / ") },
      { label: "Model boundary", value: "period report", detail: "실제 지출과 이상 후보 중심" },
    ],
    rightInsightPanels: buildMlPeriodRightInsightPanels({
      period: params.selectedPeriod,
      expenses: periodAggregate.expenses,
      anomalies,
      monthlyTrend,
      inputRows: anomalyFeatureRows.length,
      engineEnabled: params.engineEnabled,
    }),
  };
}

export async function getMlForecastForOverview(): Promise<MlForecastResult | null> {
  const task = buildForecastTask();
  const source = await getWhooingForecastTaskSource(task.today);
  return fetchMlForecast(buildForecastPayload(source));
}

export async function getMlInsightsViewModel(options: { periodQuery?: PeriodQuery } = {}): Promise<MlInsightsViewModel> {
  const ledgerMonths = await getAvailableLedgerMonths();
  const periodOptions = buildPeriodOptions(ledgerMonths);
  const selectedPeriod = resolvePeriod(options.periodQuery ?? { period: "month" }, periodOptions);
  const engineEnabled = isMlEngineEnabled();

  if (selectedPeriod.mode !== "month") {
    return buildMlPeriodReportViewModel({ selectedPeriod, periodOptions, engineEnabled });
  }

  const forecastTask = buildForecastTask(forecastReferenceDate(selectedPeriod));
  const anomalyTask = buildAnomalyTask(forecastTask.today);
  const [source, forecastSource, anomalyFeatureRows, fixedExpenseSource] = await Promise.all([
    getWhooingOverviewSource(),
    getWhooingForecastTaskSource(forecastTask.today),
    getWhooingAnomalyTaskRows(anomalyTask.today),
    getFixedExpenseSchedule(selectedPeriod.month),
  ]);
  const [forecast, anomalies] = await Promise.all([
    fetchMlForecast(buildForecastPayload(forecastSource)),
    fetchMlAnomalies(buildAnomalyPayload(anomalyTask.today, anomalyFeatureRows)),
  ]);

  const merged = mergeForecast(source.dailyExpenses, source.baseline, forecast);
  const projectedActualFinal = actualProjectionFinal(merged.points) ?? merged.projectedFinal;
  const fixedExpenseSchedule = buildFixedExpenseSchedule(
    fixedExpenseSource.rows,
    referenceDayForMonth(fixedExpenseSource.targetMonth),
  );
  const fixedReservation = summarizeFixedReservation(fixedExpenseSchedule);
  const resource = calculateAvailableResource({
    monthlyIncome: FINANCIAL_PLAN.monthlyIncome,
    monthlySavingTarget: FINANCIAL_PLAN.monthlySavingTarget,
    currentFixedAmount: fixedReservation.currentFixedAmount,
    remainingFixedScheduledAmount: fixedReservation.remainingFixedScheduledAmount,
    currentVariableSpend: calculateCurrentVariableSpend(source.currentExpenseByCategory),
  });
  const resourceDailyAmount = dailyAvailableResource(
    resource.availableResource,
    remainingDaysInMonth(forecastTask.today),
  );
  const savingDefense = calculateSavingDefenseBalance({
    monthlyIncome: FINANCIAL_PLAN.monthlyIncome,
    monthlySavingTarget: FINANCIAL_PLAN.monthlySavingTarget,
    projectedActualMonthTotal: projectedActualFinal,
  });
  const forecastConfidence = merged.source === "ml" ? buildForecastConfidence(merged.points) : null;
  const anomalyRows = mapAnomalyRows(anomalies);
  const flaggedCount = anomalies.filter((row) => row.isAnomaly).length;
  const tone = toneFromProjection(merged.projectedFinal);
  const forecastRange = forecast?.lowerFinal != null && forecast.upperFinal != null
    ? `${wonCompact(forecast.lowerFinal)} ~ ${wonCompact(forecast.upperFinal)}`
    : "local linear projection";
  const currentMonth = selectedPeriod.month === currentMonthValue();
  const forecastLabel = currentMonth ? "월말 예측" : "선택 월 모델 결과";

  return {
    mode: "forecast",
    selectedPeriod,
    periodOptions,
    header: {
      title: "ML 인사이트",
      description: currentMonth
        ? "예측 모델과 이상탐지 모델을 함께 보며 이번 달 지출 위험을 판단합니다."
        : `${selectedPeriod.label} 모델 결과와 이상탐지 후보를 확인합니다.`,
      badge: merged.source === "ml" ? "ML 연결" : "fallback",
    },
    source: merged.source,
    engineEnabled,
    coach: {
      title: merged.source === "ml" ? "AI 생존 가이드" : engineEnabled ? "Fallback 지출 가이드" : "ML 실행 대기",
      body: buildCoachBody(merged.source, merged.projectedFinal, projectedActualFinal, flaggedCount, tone, engineEnabled),
      tone,
    },
    metrics: buildMetrics(
      merged.projectedFinal,
      flaggedCount,
      merged.source,
      forecastConfidence,
      resourceDailyAmount,
      forecastLabel,
      currentMonth ? undefined : `${selectedPeriod.label} forecast`,
    ),
    forecast: merged.points,
    periodReport: null,
    anomalies: anomalyRows,
    status: [
      { label: "Forecast task", value: forecastTask.metric, detail: forecastTask.dimensions.join(" / ") },
      { label: "Anomaly task", value: anomalyTask.metric, detail: anomalyTask.dimensions.join(" / ") },
      { label: "Model boundary", value: "Chronos ds/y", detail: "가계부 의미는 service 계층에서 해석" },
      { label: "Auto run", value: engineEnabled ? "enabled" : "disabled", detail: "ML_ENGINE_ENABLED=false이면 호출하지 않음" },
      {
        label: "Forecast result",
        value: forecast?.modelStatus ?? "fallback",
        detail: forecastRange,
      },
      { label: "Forecast cache", value: forecast?.cacheHit ? "hit" : forecast ? "miss" : "fallback", detail: forecast?.inputHash ? forecast.inputHash.slice(0, 12) : "no model payload" },
      { label: "Prediction date", value: formatDisplayDate(forecastTask.today), detail: source.asOf },
    ],
    rightInsightPanels: buildMlRightInsightPanels({
      points: merged.points,
      anomalies,
      source: merged.source,
      forecast,
      forecastActualLength: forecastSource.actual.length,
      fixedProfileCount: forecastSource.fixedProfile.length,
      anomalyCandidateCount: anomalyFeatureRows.length,
      projectedFinal: merged.projectedFinal,
      actualProjection: projectedActualFinal,
      savingDefenseBalance: savingDefense.savingDefenseBalance,
      tone,
      engineEnabled,
    }),
  };
}
