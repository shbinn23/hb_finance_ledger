"use client";

import { useMemo, useState } from "react";
import { MetricCard } from "@/components/metrics/metric-card";
import { PeriodFilter } from "@/components/filters/period-filter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDisplayDate, won } from "@/lib/format";
import type {
  AccountingViewModel,
  AccountDeltaRow,
  AccountingDrillDownEntry,
  CashFlowRow,
  KindDistributionRow,
  LiabilityDeltaRow,
  ProfitLossRow,
} from "../types";
import { AccountingCharts } from "./accounting-charts";

interface AccountingPageProps {
  model: AccountingViewModel;
}

type DrillDownSelection =
  | { type: "cashFlow"; key: string; title: string }
  | { type: "asset"; accountId: string; title: string }
  | { type: "liability"; accountId: string; title: string };

function formatMonth(ym: string) {
  if (!/^\d{6}$/.test(ym)) return ym;
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

function signedWon(value: number) {
  if (value > 0) return `+${won(value)}`;
  return won(value);
}

function liabilityStatusClass(status: string) {
  if (status === "부채 증가") return "fixed-status-overdue";
  if (status === "상환 우위") return "fixed-status-processed";
  if (status === "변동 없음") return "fixed-status-scheduled";
  return "fixed-status-scheduled";
}

export function AccountingPage({ model }: AccountingPageProps) {
  const [selection, setSelection] = useState<DrillDownSelection | null>(null);
  const clearSelection = () => setSelection(null);
  const selectedEntries = useMemo(() => {
    if (!selection) return [];
    return model.drillDownEntries.filter((entry) => {
      if (selection.type === "cashFlow") return entry.flowKey === selection.key;
      if (selection.type === "asset") {
        return (
          (entry.lAccount === "assets" && entry.lAccountId === selection.accountId)
          || (entry.rAccount === "assets" && entry.rAccountId === selection.accountId)
        );
      }
      return (
        (entry.lAccount === "liabilities" && entry.lAccountId === selection.accountId)
        || (entry.rAccount === "liabilities" && entry.rAccountId === selection.accountId)
      );
    }).slice(0, 50);
  }, [model.drillDownEntries, selection]);

  return (
    <>
      <section className="section-hero">
        <div>
          <p className="eyebrow compact">Accounting Ledger</p>
          <h1>장부 분석</h1>
          <p>{model.selectedPeriod.label} 장부 기준으로 자산, 부채, 수익, 비용의 흐름을 해석합니다.</p>
        </div>
        <div className="accounting-hero-actions">
          <PeriodFilter options={model.periodOptions} value={model.selectedPeriod} />
          <Badge tone={model.checks.unknownCount > 0 ? "watch" : "stable"}>
            {model.checks.unknownCount > 0 ? "분류 확인" : "분류 완료"}
          </Badge>
        </div>
      </section>

      <div className="metric-grid">
        {model.metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            detail={metric.detail}
            tone={metric.tone}
          />
        ))}
      </div>

      <AccountingCharts model={model} />

      <div className="accounting-section-grid">
        <ProfitLossSection rows={model.profitLossRows} />
        <CashFlowSection
          rows={model.cashFlowRows}
          selectedKey={selection?.type === "cashFlow" ? selection.key : null}
          onSelect={(row) => setSelection({ type: "cashFlow", key: row.key, title: row.label })}
        />
        <AssetDeltaSection
          rows={model.assetDeltaRows}
          selectedAccountId={selection?.type === "asset" ? selection.accountId : null}
          onSelect={(row) => setSelection({ type: "asset", accountId: row.accountId, title: row.title })}
        />
        <LiabilitySection
          rows={model.liabilityDeltaRows}
          selectedAccountId={selection?.type === "liability" ? selection.accountId : null}
          onSelect={(row) => setSelection({ type: "liability", accountId: row.accountId, title: row.title })}
        />
        <DrillDownSection selection={selection} rows={selectedEntries} onClear={clearSelection} />
        <CheckSection rows={model.kindDistribution} checks={model.checks} />
      </div>
    </>
  );
}

function ProfitLossSection({ rows }: { rows: ProfitLossRow[] }) {
  return (
    <Card className="transaction-panel">
      <CardHeader>
        <CardDescription>Profit & Loss</CardDescription>
        <CardTitle>기간손익</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>월</th>
                <th className="amount">수익</th>
                <th className="amount">비용</th>
                <th className="amount">손익</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.ym}>
                  <td>{formatMonth(row.ym)}</td>
                  <td className="amount">{won(row.income)}</td>
                  <td className="amount">{won(row.expenses)}</td>
                  <td className="amount">{signedWon(row.profitLoss)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CashFlowSection({
  rows,
  selectedKey,
  onSelect,
}: {
  rows: CashFlowRow[];
  selectedKey: string | null;
  onSelect: (row: CashFlowRow) => void;
}) {
  return (
    <Card className="transaction-panel">
      <CardHeader>
        <CardDescription>Cash Flow</CardDescription>
        <CardTitle>현금흐름 1차 분해</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>활동</th>
                <th>항목</th>
                <th className="amount">금액</th>
                <th className="amount">건수</th>
                <th>현금흐름 반영</th>
                <th className="amount">순현금흐름</th>
                <th>설명</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className={selectedKey === row.key ? "selected-row" : undefined}>
                  <td>{row.activity}</td>
                  <td>
                    <button type="button" className="accounting-row-button" onClick={() => onSelect(row)}>
                      {row.label}
                    </button>
                  </td>
                  <td className="amount">{won(row.amount)}</td>
                  <td className="amount">{row.txCount.toLocaleString("ko-KR")}건</td>
                  <td>
                    <span className={`status-pill ${row.includedInNetCashFlow ? "status-posted" : "status-review"}`}>
                      {row.includedInNetCashFlow ? "포함" : "제외"}
                    </span>
                  </td>
                  <td className="amount">{signedWon(row.netCashFlow)}</td>
                  <td>{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AssetDeltaSection({
  rows,
  selectedAccountId,
  onSelect,
}: {
  rows: AccountDeltaRow[];
  selectedAccountId: string | null;
  onSelect: (row: AccountDeltaRow) => void;
}) {
  return (
    <Card className="transaction-panel">
      <CardHeader>
        <CardDescription>Assets</CardDescription>
        <CardTitle>자산변동</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>계정</th>
                <th className="amount">유입</th>
                <th className="amount">유출</th>
                <th className="amount">순증감</th>
                <th className="amount">최근일</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.accountId} className={selectedAccountId === row.accountId ? "selected-row" : undefined}>
                  <td>
                    <button type="button" className="accounting-row-button" onClick={() => onSelect(row)}>
                      {row.title}
                    </button>
                  </td>
                  <td className="amount">{won(row.inflow)}</td>
                  <td className="amount">{won(row.outflow)}</td>
                  <td className="amount">{signedWon(row.netDelta)}</td>
                  <td className="amount">{row.lastDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function LiabilitySection({
  rows,
  selectedAccountId,
  onSelect,
}: {
  rows: LiabilityDeltaRow[];
  selectedAccountId: string | null;
  onSelect: (row: LiabilityDeltaRow) => void;
}) {
  return (
    <Card className="transaction-panel">
      <CardHeader>
        <CardDescription>Liabilities / Cards</CardDescription>
        <CardTitle>부채·카드 변동</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>카드/부채 계정</th>
                <th className="amount">사용 증가</th>
                <th className="amount">상환 감소</th>
                <th className="amount">순증감</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.accountId} className={selectedAccountId === row.accountId ? "selected-row" : undefined}>
                  <td>
                    <button type="button" className="accounting-row-button" onClick={() => onSelect(row)}>
                      {row.title}
                    </button>
                  </td>
                  <td className="amount">{won(row.liabilityIncrease)}</td>
                  <td className="amount">{won(row.liabilityDecrease)}</td>
                  <td className="amount">{signedWon(row.netDelta)}</td>
                  <td>
                    <span className={`status-pill ${liabilityStatusClass(row.status)}`}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function accountFlow(row: AccountingDrillDownEntry) {
  return `${row.lAccountTitle} → ${row.rAccountTitle}`;
}

function DrillDownSection({
  selection,
  rows,
  onClear,
}: {
  selection: DrillDownSelection | null;
  rows: AccountingDrillDownEntry[];
  onClear: () => void;
}) {
  if (!selection) return null;

  return (
    <Card className="transaction-panel">
      <CardHeader>
        <div className="accounting-drilldown-header">
          <div>
            <CardDescription>Drill-down</CardDescription>
            <CardTitle>선택 항목 상세 거래</CardTitle>
            <p>{selection.title} 기준 최근 50건</p>
          </div>
          <button type="button" className="ui-button ui-button-secondary ui-button-sm" onClick={onClear}>
            선택 해제
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>거래일</th>
                <th>내용</th>
                <th>계정 흐름</th>
                <th className="amount">금액</th>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    선택 항목의 거래가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.entryId}>
                    <td>{formatDisplayDate(row.entryDate)}</td>
                    <td>{row.item}</td>
                    <td>{accountFlow(row)}</td>
                    <td className="amount">{won(row.money)}</td>
                    <td>{row.memo || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CheckSection({
  rows,
  checks,
}: {
  rows: KindDistributionRow[];
  checks: AccountingViewModel["checks"];
}) {
  return (
    <Card className="transaction-panel">
      <CardHeader>
        <CardDescription>Reconciliation</CardDescription>
        <CardTitle>검산 및 분류 현황</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="fixed-status-strip accounting-check-strip">
          <span>전체 {checks.entriesCount.toLocaleString("ko-KR")}건</span>
          <span>분류 {checks.classifiedCount.toLocaleString("ko-KR")}건</span>
          <span>unknown {checks.unknownCount.toLocaleString("ko-KR")}건</span>
          <span>unknown 금액 {won(checks.unknownAmount)}</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>l/r 조합</th>
                <th>해석</th>
                <th className="amount">건수</th>
                <th className="amount">금액</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.lAccount}-${row.rAccount}`}>
                  <td>{row.label}</td>
                  <td>{row.lAccount} {"->"} {row.rAccount}</td>
                  <td>{row.description}</td>
                  <td className="amount">{row.txCount.toLocaleString("ko-KR")}건</td>
                  <td className="amount">{won(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
