"use client";

import { useMemo } from "react";
import { parseAsString, useQueryState } from "nuqs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { won } from "@/lib/format";
import type { EntryKind, LedgerAnalyticsRow, LedgerMonthOption } from "@/server/whooing/analytics-repository";
import { entryKindLabels } from "../types";

const filters: Array<{ value: "all" | EntryKind; label: string }> = [
  { value: "all", label: "전체" },
  { value: "expense", label: "지출" },
  { value: "income", label: "수입" },
  { value: "transfer", label: "이체" },
  { value: "card-payment", label: "카드정산" },
];

interface LedgerWorkbenchProps {
  rows: LedgerAnalyticsRow[];
  months: LedgerMonthOption[];
  selectedMonth: string | null;
}

export function LedgerWorkbench({ rows, months, selectedMonth }: LedgerWorkbenchProps) {
  const [type, setType] = useQueryState("type", parseAsString.withDefault("all"));
  const [, setMonth] = useQueryState("month", parseAsString.withOptions({ shallow: false }));
  const visibleRows = useMemo(
    () => rows.filter((row) => type === "all" || row.kind === type),
    [rows, type],
  );

  return (
    <div>
      <div className="ledger-toolbar">
        <div className="filter-row">
          {filters.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              variant={type === filter.value ? "primary" : "secondary"}
              size="sm"
              onClick={() => setType(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        <label className="ledger-month-select">
          <span>월</span>
          <select
            value={selectedMonth ?? ""}
            disabled={months.length === 0}
            onChange={(event) => setMonth(event.target.value || null)}
          >
            {months.length === 0 ? <option value="">거래 없음</option> : null}
            {months.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>일자</th>
              <th>구분</th>
              <th>차변</th>
              <th>대변</th>
              <th>내용</th>
              <th className="amount">금액</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  선택한 조건의 거래가 없습니다.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>
                    <Badge tone={row.kind === "expense" ? "watch" : row.kind === "income" ? "stable" : "neutral"}>
                      {entryKindLabels[row.kind]}
                    </Badge>
                  </td>
                  <td>{row.leftAccount}</td>
                  <td>{row.rightAccount}</td>
                  <td>{row.item}</td>
                  <td className="amount">{won(row.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
