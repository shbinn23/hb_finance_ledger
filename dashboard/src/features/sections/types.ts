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
  WorkspaceContext,
} from "@/server/whooing/analytics-repository";

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
  monthlyTrend: MonthlyTrendRow[];
  categories: CategoryAnalyticsRow[];
  accounts: AccountAnalyticsRow[];
  ledger: LedgerAnalyticsRow[];
  ledgerMonths: LedgerMonthOption[];
  selectedLedgerMonth: string | null;
  paymentMix: PaymentMixRow[];
  habits: MerchantHabitRow[];
  fixedExpense: FixedExpenseSummary;
}

export const entryKindLabels: Record<EntryKind, string> = {
  expense: "지출",
  income: "수입",
  transfer: "이체",
  "card-payment": "카드정산",
  other: "기타",
};
