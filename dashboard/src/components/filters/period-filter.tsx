"use client";

import { parseAsString, useQueryState } from "nuqs";
import type { PeriodMode, PeriodOptions, ResolvedPeriod } from "@/lib/period-filter";

interface PeriodFilterProps {
  options: PeriodOptions;
  value: ResolvedPeriod;
}

const modes: Array<{ value: PeriodMode; label: string }> = [
  { value: "all", label: "전체" },
  { value: "year", label: "연도" },
  { value: "quarter", label: "분기" },
  { value: "month", label: "월" },
];

const quarters = [
  { value: "1", label: "1분기" },
  { value: "2", label: "2분기" },
  { value: "3", label: "3분기" },
  { value: "4", label: "4분기" },
];

function defaultYear(options: PeriodOptions, value: ResolvedPeriod) {
  return value.year ?? value.month?.slice(0, 4) ?? options.years[0]?.value ?? String(new Date().getFullYear());
}

function defaultMonth(options: PeriodOptions, value: ResolvedPeriod) {
  return value.month ?? options.months[0]?.value ?? "";
}

export function PeriodFilter({ options, value }: PeriodFilterProps) {
  const [, setPeriod] = useQueryState("period", parseAsString.withOptions({ shallow: false }));
  const [, setYear] = useQueryState("year", parseAsString.withOptions({ shallow: false }));
  const [, setQuarter] = useQueryState("quarter", parseAsString.withOptions({ shallow: false }));
  const [, setMonth] = useQueryState("month", parseAsString.withOptions({ shallow: false }));
  const activeYear = defaultYear(options, value);
  const activeQuarter = value.quarter ?? "1";
  const activeMonth = defaultMonth(options, value);
  const yearOptions = options.years.length > 0 ? options.years : [{ value: activeYear, label: `${activeYear}년` }];

  async function applyMode(mode: PeriodMode) {
    if (mode === "all") {
      await Promise.all([setPeriod("all"), setYear(null), setQuarter(null), setMonth(null)]);
      return;
    }
    if (mode === "year") {
      await Promise.all([setPeriod("year"), setYear(activeYear), setQuarter(null), setMonth(null)]);
      return;
    }
    if (mode === "quarter") {
      await Promise.all([setPeriod("quarter"), setYear(activeYear), setQuarter(activeQuarter), setMonth(null)]);
      return;
    }
    await Promise.all([setPeriod("month"), setMonth(activeMonth), setYear(null), setQuarter(null)]);
  }

  async function applyYear(nextYear: string) {
    if (value.mode === "quarter") {
      await Promise.all([setPeriod("quarter"), setYear(nextYear), setQuarter(activeQuarter), setMonth(null)]);
      return;
    }
    await Promise.all([setPeriod("year"), setYear(nextYear), setQuarter(null), setMonth(null)]);
  }

  async function applyQuarter(nextQuarter: string) {
    await Promise.all([setPeriod("quarter"), setYear(activeYear), setQuarter(nextQuarter), setMonth(null)]);
  }

  async function applyMonth(nextMonth: string) {
    await Promise.all([setPeriod("month"), setMonth(nextMonth), setYear(null), setQuarter(null)]);
  }

  return (
    <div className="period-filter" aria-label="기간 필터">
      <label className="ledger-month-select">
        <span>기간</span>
        <select value={value.mode} onChange={(event) => applyMode(event.target.value as PeriodMode)}>
          {modes.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>

      {value.mode === "year" || value.mode === "quarter" ? (
        <label className="ledger-month-select">
          <span>연도</span>
          <select value={activeYear} onChange={(event) => applyYear(event.target.value)}>
            {yearOptions.map((year) => (
              <option key={year.value} value={year.value}>
                {year.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {value.mode === "quarter" ? (
        <label className="ledger-month-select">
          <span>분기</span>
          <select value={activeQuarter} onChange={(event) => applyQuarter(event.target.value)}>
            {quarters.map((quarter) => (
              <option key={quarter.value} value={quarter.value}>
                {quarter.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {value.mode === "month" ? (
        <label className="ledger-month-select">
          <span>월</span>
          <select
            value={activeMonth}
            disabled={options.months.length === 0}
            onChange={(event) => applyMonth(event.target.value)}
          >
            {options.months.length === 0 ? <option value="">거래 없음</option> : null}
            {options.months.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
