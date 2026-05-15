export interface FinanceMlTask {
  today: string;
  metric: "daily-variable-spend" | "transaction-anomaly";
  dimensions: string[];
}

export interface ForecastTaskPayload {
  task_id: string;
  today: string;
  series: Array<{ ds: string; y: number }>;
  actual: Array<{ ds: string; y: number }>;
  fixed_profile: Array<{ due_day: number; avg_amount: number }>;
  prediction_length: number;
  num_samples: number;
}

export interface AnomalyTaskPayload {
  task_id: string;
  today: string;
  rows: Array<{
    transaction_date: string;
    day_of_month: number;
    day_of_week: number;
    is_weekend: number;
    is_holiday: number;
    parent_category: string;
    description: string;
    amount: number;
  }>;
}

export interface ForecastTaskSource {
  today: string;
  predictionLength: number;
  series: Array<{ ds: string; y: number }>;
  actual: Array<{ ds: string; y: number }>;
  fixedProfile: Array<{ due_day: number; avg_amount: number }>;
}

function todayKst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function buildForecastTask(today = todayKst()): FinanceMlTask {
  return {
    today,
    metric: "daily-variable-spend",
    dimensions: ["date"],
  };
}

export function buildAnomalyTask(today = todayKst()): FinanceMlTask {
  return {
    today,
    metric: "transaction-anomaly",
    dimensions: ["date", "description", "category"],
  };
}

export function buildAnomalyPayload(today: string, rows: AnomalyTaskPayload["rows"]): AnomalyTaskPayload {
  return {
    task_id: "whooing-transaction-anomaly",
    today,
    rows,
  };
}

export function buildForecastPayload(source: ForecastTaskSource): ForecastTaskPayload {
  return {
    task_id: "whooing-monthly-variable-spend",
    today: source.today,
    series: source.series,
    actual: source.actual,
    fixed_profile: source.fixedProfile,
    prediction_length: source.predictionLength,
    num_samples: Number(process.env.ML_ENGINE_NUM_SAMPLES ?? 100),
  };
}
