export type FixedExpenseStatus = "processed" | "scheduled" | "overdue";

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
