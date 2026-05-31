import type { RiskLevel } from "@/features/overview/types";
import type { RightInsightPanelCard } from "@/features/sections/types";
import type { MonthlyTrendRow } from "@/server/whooing/analytics-repository";
import type { PeriodOptions, ResolvedPeriod } from "@/lib/period-filter";

export interface MlMetric {
  label: string;
  value: string;
  detail: string;
  tone: RiskLevel;
}

export interface MlForecastPoint {
  day: number;
  actual: number | null;
  actualProjection: number | null;
  projected: number | null;
  baseline: number | null;
  ai: number | null;
  upper: number | null;
  lower: number | null;
}

export interface MlAnomalyRow {
  date: string;
  description: string;
  category: string;
  amount: string;
  score: string;
  isAnomaly: boolean;
}

export interface MlStatusCard {
  label: string;
  value: string;
  detail: string;
}

export interface MlPeriodReport {
  title: string;
  description: string;
  monthlyTrend: MonthlyTrendRow[];
  emptyText: string;
}

export interface MlInsightsViewModel {
  mode: "forecast" | "period-report";
  selectedPeriod: ResolvedPeriod;
  periodOptions: PeriodOptions;
  header: {
    title: string;
    description: string;
    badge: string;
  };
  source: "ml" | "fallback";
  engineEnabled: boolean;
  coach: {
    title: string;
    body: string;
    tone: RiskLevel;
  };
  metrics: MlMetric[];
  forecast: MlForecastPoint[];
  periodReport: MlPeriodReport | null;
  anomalies: MlAnomalyRow[];
  status: MlStatusCard[];
  rightInsightPanels: RightInsightPanelCard[];
}
