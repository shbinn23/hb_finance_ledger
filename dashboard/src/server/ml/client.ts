import type { AnomalyTaskPayload, ForecastTaskPayload } from "@/features/ml/task-adapter";

function mlEngineUrl() {
  const raw = process.env.ML_ENGINE_URL ?? "http://127.0.0.1:8000";
  return raw;
}

const defaultMlEngineUrl = mlEngineUrl();
const defaultTimeoutMs = Number(process.env.ML_ENGINE_TIMEOUT_MS ?? 5000);

export function isMlEngineEnabled() {
  return process.env.ML_ENGINE_ENABLED !== "false";
}

export interface MlForecastSeriesPoint {
  day: number;
  ai: number | null;
  projected: number | null;
  upper: number | null;
  lower: number | null;
}

export interface MlForecastResult {
  source: "ml";
  today: string;
  projectedFinal: number;
  lowerFinal: number | null;
  upperFinal: number | null;
  series: MlForecastSeriesPoint[];
  modelStatus?: string;
  cacheHit?: boolean;
  inputHash?: string;
  durationMs?: number;
}

export interface MlAnomalyResult {
  date: string;
  description: string;
  category: string;
  amount: number;
  score: number;
  isAnomaly: boolean;
}

interface MlForecastResponse {
  ai_pure?: unknown;
  ai_upper?: unknown;
  ai_lower?: unknown;
  projected?: unknown;
  projected_index?: unknown;
  actual_month_to_date?: unknown;
  projected_month_total?: unknown;
  lower_month_total?: unknown;
  upper_month_total?: unknown;
  daily_forecast?: unknown;
  source?: unknown;
  model_status?: unknown;
  cache_hit?: unknown;
  input_hash?: unknown;
  duration_ms?: unknown;
}

interface MlDailyForecastResponse {
  day?: unknown;
  forecast_cumulative_total?: unknown;
  lower_cumulative_total?: unknown;
  upper_cumulative_total?: unknown;
  projected_total?: unknown;
  lower_projected_total?: unknown;
  upper_projected_total?: unknown;
}

interface MlAnomalyResponse {
  transaction_date?: unknown;
  description?: unknown;
  parent_category?: unknown;
  amount?: unknown;
  anomaly_score?: unknown;
  is_anomaly?: unknown;
}

interface MlAnomalyTaskResponse {
  rows?: unknown;
  cache_hit?: unknown;
  input_hash?: unknown;
  duration_ms?: unknown;
}

function numericArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => Number(item)).filter(Number.isFinite);
}

function stringFrom(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberFrom(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumberFrom(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function postJson<T>(path: string, payload: object): Promise<T | null> {
  if (!isMlEngineEnabled()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), defaultTimeoutMs);

  try {
    const response = await fetch(`${defaultMlEngineUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchMlForecast(payload: ForecastTaskPayload): Promise<MlForecastResult | null> {
  const response = await postJson<MlForecastResponse>("/forecast", payload);
  if (!response) return null;

  const aiPure = numericArray(response.ai_pure);
  const aiUpper = numericArray(response.ai_upper);
  const aiLower = numericArray(response.ai_lower);
  const projected = numericArray(response.projected);
  const projectedIndex = numericArray(response.projected_index);
  const dailyForecast = Array.isArray(response.daily_forecast)
    ? response.daily_forecast as MlDailyForecastResponse[]
    : [];

  if (aiPure.length === 0 && projected.length === 0 && dailyForecast.length === 0) return null;

  const series = dailyForecast.length > 0
    ? dailyForecast.map((point, index) => ({
        day: numberFrom(point.day, index + 1),
        ai: nullableNumberFrom(point.forecast_cumulative_total),
        projected: nullableNumberFrom(point.projected_total),
        upper: nullableNumberFrom(point.upper_projected_total) ?? nullableNumberFrom(point.upper_cumulative_total),
        lower: nullableNumberFrom(point.lower_projected_total) ?? nullableNumberFrom(point.lower_cumulative_total),
      }))
    : Array.from({ length: Math.max(aiPure.length, aiUpper.length, aiLower.length, 31) }, (_, index) => {
        const day = index + 1;
        const projectedPosition = projectedIndex.indexOf(day);

        return {
          day,
          ai: aiPure[index] ?? null,
          projected: projectedPosition >= 0 ? projected[projectedPosition] ?? null : null,
          upper: aiUpper[index] ?? null,
          lower: aiLower[index] ?? null,
        };
      });

  const projectedFinal = Math.round(
    numberFrom(
      response.projected_month_total,
      projected.at(-1) ?? aiPure.at(-1) ?? series.findLast((point) => point.projected !== null)?.projected ?? 0,
    ),
  );

  if (projectedFinal <= 0) return null;

  return {
    source: "ml",
    today: payload.today,
    projectedFinal,
    lowerFinal: nullableNumberFrom(response.lower_month_total),
    upperFinal: nullableNumberFrom(response.upper_month_total),
    series,
    modelStatus: stringFrom(response.model_status, stringFrom(response.source, "model")),
    cacheHit: Boolean(response.cache_hit),
    inputHash: stringFrom(response.input_hash),
    durationMs: numberFrom(response.duration_ms),
  };
}

export async function fetchMlAnomalies(payload: AnomalyTaskPayload): Promise<MlAnomalyResult[]> {
  const response = await postJson<MlAnomalyTaskResponse>("/detect/features", payload);
  if (!response || !Array.isArray(response.rows)) return [];

  return response.rows
    .map((row) => ({
      date: stringFrom((row as MlAnomalyResponse).transaction_date, payload.today),
      description: stringFrom((row as MlAnomalyResponse).description, "후잉 거래"),
      category: stringFrom((row as MlAnomalyResponse).parent_category, "미분류"),
      amount: Math.round(numberFrom((row as MlAnomalyResponse).amount)),
      score: numberFrom((row as MlAnomalyResponse).anomaly_score),
      isAnomaly: Boolean((row as MlAnomalyResponse).is_anomaly),
    }))
    .sort((a, b) => Number(b.isAnomaly) - Number(a.isAnomaly) || b.score - a.score || b.amount - a.amount);
}
