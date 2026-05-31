import { currentKstMonthValue, currentKstQuarterValue, currentKstYearValue } from "./kst-date.ts";

export type PeriodMode = "all" | "year" | "quarter" | "month";

export interface PeriodQuery {
  period: PeriodMode;
  year?: string;
  quarter?: string;
  month?: string;
}

export interface PeriodOption {
  value: string;
  label: string;
}

export interface PeriodOptions {
  years: PeriodOption[];
  months: PeriodOption[];
}

export interface ResolvedPeriod {
  mode: PeriodMode;
  label: string;
  startDate: number | null;
  endDate: number | null;
  year?: string;
  quarter?: string;
  month?: string;
}

type RawPeriodQuery = {
  period?: string | string[];
  year?: string | string[];
  quarter?: string | string[];
  month?: string | string[];
};

const periodModes = new Set<PeriodMode>(["all", "year", "quarter", "month"]);

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isYear(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}$/.test(value));
}

function isQuarter(value: string | undefined): value is string {
  return Boolean(value && /^[1-4]$/.test(value));
}

function isMonth(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

function toMonthParts(month: string) {
  return {
    year: Number(month.slice(0, 4)),
    month: Number(month.slice(5, 7)),
  };
}

function nextMonthStart(year: number, month: number) {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return nextYear * 10000 + nextMonth * 100 + 1;
}

function monthRange(month: string) {
  const parts = toMonthParts(month);
  return {
    startDate: parts.year * 10000 + parts.month * 100 + 1,
    endDate: nextMonthStart(parts.year, parts.month),
  };
}

function yearRange(year: string) {
  const value = Number(year);
  return {
    startDate: value * 10000 + 101,
    endDate: (value + 1) * 10000 + 101,
  };
}

function quarterRange(year: string, quarter: string) {
  const yearValue = Number(year);
  const quarterValue = Number(quarter);
  const startMonth = (quarterValue - 1) * 3 + 1;
  const endMonth = startMonth + 3;
  const endYear = endMonth > 12 ? yearValue + 1 : yearValue;
  const normalizedEndMonth = endMonth > 12 ? endMonth - 12 : endMonth;
  return {
    startDate: yearValue * 10000 + startMonth * 100 + 1,
    endDate: endYear * 10000 + normalizedEndMonth * 100 + 1,
  };
}

function currentMonthValue(now?: Date) {
  return currentKstMonthValue(now);
}

function currentYearValue(now?: Date) {
  return currentKstYearValue(now);
}

function currentQuarterValue(now?: Date) {
  return currentKstQuarterValue(now);
}

function findOption(options: PeriodOption[], value: string | undefined) {
  return value ? options.find((option) => option.value === value) : undefined;
}

function fallbackMonth(options: PeriodOptions, now?: Date) {
  const currentMonth = currentMonthValue(now);
  return findOption(options.months, currentMonth)?.value ?? options.months[0]?.value ?? currentMonth;
}

function fallbackYear(options: PeriodOptions, now?: Date) {
  const currentYear = currentYearValue(now);
  return findOption(options.years, currentYear)?.value ?? options.years[0]?.value ?? currentYear;
}

function monthLabel(value: string) {
  return value.replace("-", ".");
}

export function buildPeriodOptions(months: PeriodOption[], now?: Date): PeriodOptions {
  const currentMonth = currentMonthValue(now);
  const monthMap = new Map(months.map((month) => [month.value, month]));
  if (!monthMap.has(currentMonth)) {
    monthMap.set(currentMonth, { value: currentMonth, label: monthLabel(currentMonth) });
  }
  const monthOptions = Array.from(monthMap.values()).sort((a, b) => b.value.localeCompare(a.value));
  const yearValues = Array.from(new Set(monthOptions.map((month) => month.value.slice(0, 4)).filter(isYear)));
  return {
    years: yearValues.map((year) => ({ value: year, label: `${year}년` })),
    months: monthOptions,
  };
}

export function parsePeriodQuery(query: RawPeriodQuery | undefined): PeriodQuery {
  const rawPeriod = firstParam(query?.period);
  const month = firstParam(query?.month);
  const year = firstParam(query?.year);
  const quarter = firstParam(query?.quarter);
  const period = periodModes.has(rawPeriod as PeriodMode) ? (rawPeriod as PeriodMode) : undefined;

  if (period === "all") return { period };
  if (period === "year") return { period, year: isYear(year) ? year : undefined };
  if (period === "quarter") {
    return {
      period,
      year: isYear(year) ? year : undefined,
      quarter: isQuarter(quarter) ? quarter : undefined,
    };
  }
  if (period === "month" || isMonth(month)) {
    return { period: "month", month: isMonth(month) ? month : undefined };
  }

  return { period: "month" };
}

export function resolvePeriod(query: PeriodQuery, options: PeriodOptions, now?: Date): ResolvedPeriod {
  if (query.period === "all") {
    return { mode: "all", label: "전체", startDate: null, endDate: null };
  }

  if (query.period === "year") {
    const year = findOption(options.years, query.year)?.value ?? fallbackYear(options, now);
    return { mode: "year", label: `${year}년`, year, ...yearRange(year) };
  }

  if (query.period === "quarter") {
    const year = findOption(options.years, query.year)?.value ?? fallbackYear(options, now);
    const quarter = isQuarter(query.quarter) ? query.quarter : currentQuarterValue(now);
    return { mode: "quarter", label: `${year}년 ${quarter}분기`, year, quarter, ...quarterRange(year, quarter) };
  }

  const month = findOption(options.months, query.month)?.value ?? fallbackMonth(options, now);
  const label = findOption(options.months, month)?.label ?? month.replace("-", ".");
  return { mode: "month", label, month, ...monthRange(month) };
}
