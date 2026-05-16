export type RiskLevel = "stable" | "watch" | "over";

export interface SummaryMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: RiskLevel;
}

export interface SpendingPoint {
  day: number;
  actual: number | null;
  actualProjection: number | null;
  projected: number | null;
  baseline: number | null;
  ai?: number | null;
  upper: number | null;
  lower: number | null;
}

export interface CategorySlice {
  name: string;
  amount: number;
  share: number;
  tone: string;
}

export interface AccountBalance {
  name: string;
  type: "asset" | "liability";
  amount: number;
  detail: string;
}

export interface TransactionRow {
  id: string;
  date: string;
  account: string;
  category: string;
  merchant: string;
  amount: number;
  status: "posted" | "scheduled" | "review";
}

export interface InsightItem {
  title: string;
  body: string;
  tone: RiskLevel;
}

export interface FixedExpenseOverview {
  processedCount: number;
  scheduledCount: number;
  overdueCount: number;
  nextLabel: string;
  nextDetail: string;
}

export interface OverviewViewModel {
  asOf: string;
  monthLabel: string;
  netWorth: number;
  assetTotal: number;
  liabilityTotal: number;
  syncState: string;
  forecastSource: "ml" | "fallback";
  summary: SummaryMetric[];
  spending: SpendingPoint[];
  categories: CategorySlice[];
  accounts: AccountBalance[];
  transactions: TransactionRow[];
  insights: InsightItem[];
  fixedExpense: FixedExpenseOverview;
}
