import type { RiskLevel } from "@/features/overview/types";
import type { RightInsightPanelCard } from "@/features/sections/types";

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

export interface MlInsightsViewModel {
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
  anomalies: MlAnomalyRow[];
  status: MlStatusCard[];
  rightInsightPanels: RightInsightPanelCard[];
}
