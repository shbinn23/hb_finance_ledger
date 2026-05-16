import type {
  AccountAnalyticsRow,
  CategoryAnalyticsRow,
  EntryKind,
  FixedExpenseSummary,
  LedgerAnalyticsRow,
  LedgerMonthOption,
  MerchantHabitRow,
  MonthlyTrendRow,
  PaymentMixRow,
  PeriodAggregateRow,
  WorkspaceContext,
} from "@/server/whooing/analytics-repository";
import type { FixedExpenseScheduleRow } from "@/lib/fixed-expense-schedule";
import type { PeriodOptions, ResolvedPeriod } from "@/lib/period-filter";

export type SectionKey = "ledger" | "trend" | "budget" | "assets" | "analysis" | "habits";
export type RiskTone = "stable" | "watch" | "over" | "neutral";

export interface SectionMetric {
  label: string;
  value: string;
  detail: string;
  tone: RiskTone;
}

export interface SectionInsight {
  title: string;
  body: string;
  tone: RiskTone;
}

export interface RightInsightChartRow {
  label: string;
  value: number;
  detail?: string;
}

export interface RightInsightTimelineRow {
  marker: string;
  title: string;
  detail: string;
  tone: RiskTone;
}

export type RightInsightVisual =
  | {
      type: "bullet";
      title: string;
      value: string;
      detail: string;
      percent: number;
      tone: RiskTone;
    }
  | {
      type: "progress";
      title: string;
      value: number;
      detail: string;
      tone: RiskTone;
    }
  | {
      type: "bars" | "sparkline" | "weekday";
      rows: RightInsightChartRow[];
    }
  | {
      type: "timeline";
      rows: RightInsightTimelineRow[];
      emptyText: string;
    }
  | {
      type: "note";
      text: string;
    };

export interface RightInsightPanelCard {
  eyebrow: string;
  title: string;
  visuals: RightInsightVisual[];
}

export interface SectionHeader {
  eyebrow: string;
  title: string;
  description: string;
  badge: string;
}

export interface SectionViewModel {
  key: SectionKey;
  context: WorkspaceContext;
  header: SectionHeader;
  metrics: SectionMetric[];
  insights: SectionInsight[];
  rightInsightPanels: RightInsightPanelCard[];
  periodAggregate: PeriodAggregateRow;
  monthlyTrend: MonthlyTrendRow[];
  categories: CategoryAnalyticsRow[];
  accounts: AccountAnalyticsRow[];
  ledger: LedgerAnalyticsRow[];
  ledgerMonths: LedgerMonthOption[];
  selectedLedgerMonth: string | null;
  periodOptions: PeriodOptions;
  selectedPeriod: ResolvedPeriod | null;
  paymentMix: PaymentMixRow[];
  habits: MerchantHabitRow[];
  fixedExpense: FixedExpenseSummary;
  fixedExpenseSchedule: FixedExpenseScheduleRow[];
}

export const entryKindLabels: Record<EntryKind, string> = {
  expense: "지출",
  income: "수입",
  transfer: "이체",
  "card-payment": "카드정산",
  other: "기타",
};
