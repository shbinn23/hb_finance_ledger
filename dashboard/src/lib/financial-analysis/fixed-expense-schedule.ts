export type FixedExpenseStatus = "processed" | "scheduled" | "overdue";

export type FixedExpensePolicyPurpose = "ml_fixed_profile" | "dashboard_schedule";
export type FixedExpenseDueDayStrategy = "median_day" | "historical_median_day";
export type FixedExpenseAmountStrategy = "average_amount" | "latest_historical_month_total";
export type FixedExpenseActiveRule = "strict_recurring_candidate" | "current_amount_or_min_history";

export interface FixedExpenseCandidatePolicy {
  name: "strictFixedCandidatePolicy";
  purpose: FixedExpensePolicyPurpose;
  lookbackMonths: number;
  category: "steady";
  minAmount: number;
  maxAmount: number;
  minTransactionCount: number;
  minMonthsSeen: number;
  maxDaySpread: number;
  dueDayStrategy: FixedExpenseDueDayStrategy;
  amountStrategy: FixedExpenseAmountStrategy;
  activeRule: FixedExpenseActiveRule;
}

export interface FixedExpenseSchedulePolicy {
  name: "displayFixedSchedulePolicy";
  purpose: FixedExpensePolicyPurpose;
  lookbackMonths: number;
  category: "steady";
  minHistoricalMonths: number;
  dueDayStrategy: FixedExpenseDueDayStrategy;
  amountStrategy: FixedExpenseAmountStrategy;
  activeRule: FixedExpenseActiveRule;
}

export interface FixedExpenseScheduleSourceRow {
  id: string;
  accountName: string;
  itemName: string;
  paymentAccountName: string;
  expectedAmount: number;
  currentAmount: number;
  dueDay: number;
  processedDay: number | null;
}

export interface FixedExpenseScheduleRow extends FixedExpenseScheduleSourceRow {
  status: FixedExpenseStatus;
  statusLabel: string;
  daysRemaining: number;
}

export const strictFixedCandidatePolicy: FixedExpenseCandidatePolicy = {
  name: "strictFixedCandidatePolicy",
  purpose: "ml_fixed_profile",
  lookbackMonths: 12,
  category: "steady",
  minAmount: 1_000,
  maxAmount: 999_999,
  minTransactionCount: 3,
  minMonthsSeen: 3,
  maxDaySpread: 7,
  dueDayStrategy: "median_day",
  amountStrategy: "average_amount",
  activeRule: "strict_recurring_candidate",
};

export const displayFixedSchedulePolicy: FixedExpenseSchedulePolicy = {
  name: "displayFixedSchedulePolicy",
  purpose: "dashboard_schedule",
  lookbackMonths: 5,
  category: "steady",
  minHistoricalMonths: 2,
  dueDayStrategy: "historical_median_day",
  amountStrategy: "latest_historical_month_total",
  activeRule: "current_amount_or_min_history",
};

const statusLabels: Record<FixedExpenseStatus, string> = {
  processed: "처리완료",
  scheduled: "예정",
  overdue: "지연",
};

function statusFor(row: FixedExpenseScheduleSourceRow, referenceDay: number): FixedExpenseStatus {
  if (row.processedDay !== null || row.currentAmount > 0) return "processed";
  return row.dueDay < referenceDay ? "overdue" : "scheduled";
}

function sortRank(status: FixedExpenseStatus) {
  if (status === "overdue") return 0;
  if (status === "scheduled") return 1;
  return 2;
}

export function buildFixedExpenseSchedule(
  rows: FixedExpenseScheduleSourceRow[],
  referenceDay: number,
): FixedExpenseScheduleRow[] {
  return rows
    .map((row) => {
      const status = statusFor(row, referenceDay);
      return {
        ...row,
        status,
        statusLabel: statusLabels[status],
        daysRemaining: status === "processed" ? 0 : row.dueDay - referenceDay,
      };
    })
    .sort((a, b) => sortRank(a.status) - sortRank(b.status) || a.dueDay - b.dueDay || a.itemName.localeCompare(b.itemName));
}

export function referenceDayForMonth(targetMonth: string, now = new Date()): number {
  if (!/^\d{6}$/.test(targetMonth)) return now.getDate();

  const year = Number(targetMonth.slice(0, 4));
  const monthIndex = Number(targetMonth.slice(4, 6)) - 1;
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth();

  if (year === currentYear && monthIndex === currentMonthIndex) {
    return now.getDate();
  }

  return new Date(year, monthIndex + 1, 0).getDate();
}
