import { won, wonCompact } from "@/lib/format";
import { getWhooingOverviewSource } from "@/server/whooing/repository";
import { getWhooingAnomalyTaskRows, getWhooingForecastTaskSource } from "@/server/whooing/ml-task-repository";
import { fetchMlAnomalies, fetchMlForecast, isMlEngineEnabled, type MlForecastResult } from "@/server/ml/client";
import { buildAnomalyPayload, buildAnomalyTask, buildForecastPayload, buildForecastTask } from "./task-adapter";
import type { MlAnomalyRow, MlForecastPoint, MlInsightsViewModel, MlMetric } from "./types";

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

function linearProjectedFinal(currentSpend: number, lastDay: number, monthDays = 31) {
  if (lastDay <= 0) return 0;
  return Math.round((currentSpend / lastDay) * monthDays);
}

function toneFromProjection(projectedFinal: number): "stable" | "watch" | "over" {
  if (projectedFinal >= monthlyLimit * 1.08) return "over";
  if (projectedFinal >= monthlyLimit) return "watch";
  return "stable";
}

function mergeForecast(
  actualDaily: Array<{ day: number; amount: number }>,
  forecast: MlForecastResult | null,
): { points: MlForecastPoint[]; projectedFinal: number; source: "ml" | "fallback" } {
  const actual = cumulative(actualDaily);
  const currentSpend = actual.at(-1)?.amount ?? 0;
  const lastDay = Math.max(1, actual.at(-1)?.day ?? 1);

  if (!forecast) {
    const projectedFinal = linearProjectedFinal(currentSpend, lastDay);
    const actualPoints: MlForecastPoint[] = actual.map((point) => ({
      day: point.day,
      actual: point.amount,
      projected: null,
      ai: null,
      upper: null,
      lower: null,
    }));
    const projectedPoints: MlForecastPoint[] = Array.from({ length: 31 - lastDay }, (_, index) => {
      const day = lastDay + index + 1;
      const projected = Math.round(projectedFinal * (day / 31));
      return {
        day,
        actual: null,
        projected,
        ai: null,
        upper: Math.round(projected * 1.07),
        lower: Math.round(projected * 0.93),
      };
    });

    return {
      source: "fallback",
      projectedFinal,
      points: actualPoints.concat(projectedPoints),
    };
  }

  const actualByDay = new Map(actual.map((point) => [point.day, point.amount]));
  return {
    source: "ml",
    projectedFinal: forecast.projectedFinal,
    points: forecast.series.map((point) => ({
      day: point.day,
      actual: actualByDay.get(point.day) ?? null,
      projected: point.projected,
      ai: point.ai,
      upper: point.upper,
      lower: point.lower,
    })),
  };
}

function buildMetrics(
  projectedFinal: number,
  currentSpend: number,
  anomalyCount: number,
  source: "ml" | "fallback",
): MlMetric[] {
  const remainingBudget = monthlyLimit - currentSpend;
  const remainingDays = Math.max(0, 31 - new Date().getDate());
  const safeDaily = remainingDays > 0 ? Math.max(0, Math.floor(remainingBudget / remainingDays)) : 0;
  const delta = projectedFinal - monthlyLimit;

  return [
    {
      label: "월말 예측",
      value: wonCompact(projectedFinal),
      detail: source === "ml" ? "Chronos forecast" : "linear fallback",
      tone: toneFromProjection(projectedFinal),
    },
    {
      label: "예산 차이",
      value: wonCompact(Math.abs(delta)),
      detail: delta > 0 ? "예산 초과 예상" : "예산 여유 예상",
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
      value: won(safeDaily),
      detail: "남은 기간 평균",
      tone: safeDaily < 30_000 ? "watch" : "stable",
    },
  ];
}

export async function getMlForecastForOverview(): Promise<MlForecastResult | null> {
  const task = buildForecastTask();
  const source = await getWhooingForecastTaskSource(task.today);
  return fetchMlForecast(buildForecastPayload(source));
}

export async function getMlInsightsViewModel(): Promise<MlInsightsViewModel> {
  const forecastTask = buildForecastTask();
  const anomalyTask = buildAnomalyTask(forecastTask.today);
  const engineEnabled = isMlEngineEnabled();
  const [source, forecastSource, anomalyFeatureRows] = await Promise.all([
    getWhooingOverviewSource(),
    getWhooingForecastTaskSource(forecastTask.today),
    getWhooingAnomalyTaskRows(anomalyTask.today),
  ]);
  const [forecast, anomalies] = await Promise.all([
    fetchMlForecast(buildForecastPayload(forecastSource)),
    fetchMlAnomalies(buildAnomalyPayload(anomalyTask.today, anomalyFeatureRows)),
  ]);

  const merged = mergeForecast(source.dailyExpenses, forecast);
  const currentSpend = cumulative(source.dailyExpenses).at(-1)?.amount ?? 0;
  const anomalyRows: MlAnomalyRow[] = anomalies.slice(0, 14).map((row) => ({
    date: row.date,
    description: row.description,
    category: row.category,
    amount: won(row.amount),
    score: `${Math.round(row.score)}점`,
    isAnomaly: row.isAnomaly,
  }));
  const flaggedCount = anomalies.filter((row) => row.isAnomaly).length;
  const tone = toneFromProjection(merged.projectedFinal);
  const forecastRange = forecast?.lowerFinal != null && forecast.upperFinal != null
    ? `${wonCompact(forecast.lowerFinal)} ~ ${wonCompact(forecast.upperFinal)}`
    : "local linear projection";

  return {
    header: {
      title: "ML 인사이트",
      description: "예측 모델과 이상탐지 모델을 함께 보며 이번 달 지출 위험을 판단합니다.",
      badge: merged.source === "ml" ? "ML 연결" : "fallback",
    },
    source: merged.source,
    engineEnabled,
    coach: {
      title: merged.source === "ml" ? "AI 생존 가이드" : engineEnabled ? "Fallback 지출 가이드" : "ML 실행 대기",
      body: merged.source === "ml"
        ? `현재 모델은 월말 지출을 ${won(merged.projectedFinal)}로 보고 있습니다. ${tone === "over" ? "예산 초과 가능성이 높아 남은 지출 속도를 낮춰야 합니다." : "현재 속도는 관리 가능한 범위에 있습니다."}`
        : engineEnabled
          ? "ML 엔진 응답이 없어 현재 누적 지출의 일평균으로 월말 예상치를 계산했습니다."
          : "퍼블리싱 안정성을 위해 무거운 Chronos 자동 실행을 잠시 꺼두고, 현재 누적 지출의 일평균으로 월말 예상치를 표시합니다.",
      tone,
    },
    metrics: buildMetrics(merged.projectedFinal, currentSpend, flaggedCount, merged.source),
    forecast: merged.points,
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
      { label: "Prediction date", value: forecastTask.today, detail: source.asOf },
    ],
  };
}
