"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { wonMan, wonOrDash } from "@/lib/format";
import type { AccountingViewModel } from "../types";

const accountingPalette = {
  positive: "rgba(83, 58, 253, 0.62)",
  negative: "rgba(234, 34, 97, 0.58)",
  income: "var(--primary)",
  expense: "rgba(83, 101, 125, 0.68)",
  liability: "rgba(234, 34, 97, 0.56)",
  repayment: "rgba(83, 58, 253, 0.58)",
  muted: "rgba(100, 116, 141, 0.28)",
  axis: "rgba(100, 116, 141, 0.32)",
  grid: "rgba(100, 116, 141, 0.14)",
};

interface AccountingChartsProps {
  model: AccountingViewModel;
}

interface AccountingChartCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

interface TooltipPayloadItem {
  name?: string;
  value?: unknown;
  payload?: {
    explanation?: string;
    netDelta?: number;
  };
}

interface AccountingTooltipProps {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadItem[];
  note?: string;
  absolute?: boolean;
}

function formatMonth(ym: string) {
  if (!/^\d{6}$/.test(ym)) return ym;
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

function chartWon(value: unknown) {
  return wonOrDash(value);
}

function signedChartWon(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "-";
  return numberValue > 0 ? `+${wonOrDash(numberValue)}` : wonOrDash(numberValue);
}

function compactLabel(value: string) {
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

function AccountingTooltip({ active, label, payload, note, absolute = false }: AccountingTooltipProps) {
  if (!active || !payload?.length) return null;
  const explanation = payload.find((item) => item.payload?.explanation)?.payload?.explanation ?? note;

  return (
    <div className="chart-tooltip accounting-chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => {
        const value = absolute ? Math.abs(Number(item.value ?? 0)) : item.value;
        return (
          <p key={`${item.name}-${String(item.value)}`}>
            <span>{item.name}</span>
            <b>{item.name === "순증감" ? signedChartWon(value) : chartWon(value)}</b>
          </p>
        );
      })}
      {explanation ? <small>{explanation}</small> : null}
    </div>
  );
}

function AccountingChartCard({ title, description, children }: AccountingChartCardProps) {
  return (
    <Card className="transaction-panel accounting-chart-card">
      <CardHeader>
        <CardDescription>{description}</CardDescription>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function AccountingCharts({ model }: AccountingChartsProps) {
  const profitLossData = [...model.profitLossRows].reverse().map((row) => ({
    month: formatMonth(row.ym),
    income: row.income,
    expenses: row.expenses,
    profitLoss: row.profitLoss,
    explanation: "손익은 수익 - 비용입니다.",
  }));

  const cashFlowData = model.cashFlowRows.map((row) => ({
    name: row.label,
    activity: row.activity,
    chartValue: row.includedInNetCashFlow ? row.netCashFlow : row.amount,
    amount: row.amount,
    netCashFlow: row.netCashFlow,
    includedInNetCashFlow: row.includedInNetCashFlow,
    explanation: row.includedInNetCashFlow
      ? "순현금흐름 포함"
      : row.key === "internal_transfer"
        ? "내부이체라 순현금흐름 제외"
        : row.key === "capital_adjustment"
          ? "자본/기초 조정이라 별도 분류"
          : "순현금흐름 제외",
  }));

  const assetDeltaData = model.assetDeltaRows.slice(0, 8).map((row) => ({
    name: compactLabel(row.title),
    title: row.title,
    netDelta: row.netDelta,
    explanation: "자산 증가 - 자산 감소",
  }));

  const liabilityData = model.liabilityDeltaRows.slice(0, 8).map((row) => ({
    name: compactLabel(row.title),
    title: row.title,
    liabilityIncrease: row.liabilityIncrease,
    liabilityDecrease: -row.liabilityDecrease,
    netDelta: row.netDelta,
    explanation: "사용 증가 / 상환 감소 / 순증감",
  }));

  // TODO: account row drill-down can attach transaction lists to these chart rows later.
  return (
    <div className="accounting-chart-grid">
      <AccountingChartCard title="기간손익 추이" description="월별 수익·비용과 손익 방향">
        <div className="accounting-chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={profitLossData} margin={{ top: 12, right: 10, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={accountingPalette.grid} vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--ink-muted)", fontSize: 12 }} />
              <YAxis tickFormatter={wonMan} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-muted)", fontSize: 12 }} width={66} />
              <Tooltip content={<AccountingTooltip note="수익 - 비용" />} />
              <ReferenceLine y={0} stroke={accountingPalette.axis} />
              <Bar dataKey="profitLoss" name="손익" radius={[6, 6, 0, 0]}>
                {profitLossData.map((row) => (
                  <Cell key={row.month} fill={row.profitLoss >= 0 ? accountingPalette.positive : accountingPalette.negative} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="income" name="수익" stroke={accountingPalette.income} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="expenses" name="비용" stroke={accountingPalette.expense} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </AccountingChartCard>

      <AccountingChartCard title="현금흐름 활동별 분해" description="순현금흐름 반영 여부와 활동 방향">
        <div className="accounting-chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cashFlowData} layout="vertical" margin={{ top: 8, right: 14, bottom: 0, left: 18 }}>
              <CartesianGrid stroke={accountingPalette.grid} horizontal={false} />
              <XAxis type="number" tickFormatter={wonMan} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-muted)", fontSize: 12 }} />
              <YAxis dataKey="name" type="category" width={86} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-secondary)", fontSize: 12 }} />
              <Tooltip content={<AccountingTooltip />} />
              <ReferenceLine x={0} stroke={accountingPalette.axis} />
              <Bar dataKey="chartValue" name="순현금흐름 반영" radius={[0, 7, 7, 0]}>
                {cashFlowData.map((row) => (
                  <Cell
                    key={row.name}
                    fill={
                      row.includedInNetCashFlow
                        ? row.chartValue >= 0
                          ? accountingPalette.positive
                          : accountingPalette.negative
                        : accountingPalette.muted
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </AccountingChartCard>

      <AccountingChartCard title="자산변동 계정별 순증감" description="상위 계정 기준 assets 유입·유출 결과">
        <div className="accounting-chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={assetDeltaData} layout="vertical" margin={{ top: 8, right: 14, bottom: 0, left: 18 }}>
              <CartesianGrid stroke={accountingPalette.grid} horizontal={false} />
              <XAxis type="number" tickFormatter={wonMan} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-muted)", fontSize: 12 }} />
              <YAxis dataKey="name" type="category" width={86} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-secondary)", fontSize: 12 }} />
              <Tooltip content={<AccountingTooltip note="자산 증가 - 자산 감소" />} />
              <ReferenceLine x={0} stroke={accountingPalette.axis} />
              <Bar dataKey="netDelta" name="순증감" radius={[0, 7, 7, 0]}>
                {assetDeltaData.map((row) => (
                  <Cell key={row.title} fill={row.netDelta >= 0 ? accountingPalette.positive : accountingPalette.negative} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </AccountingChartCard>

      <AccountingChartCard title="부채·카드 사용/상환 비교" description="카드별 사용 증가와 상환 감소를 비교">
        <div className="accounting-chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={liabilityData} layout="vertical" margin={{ top: 8, right: 14, bottom: 0, left: 18 }}>
              <CartesianGrid stroke={accountingPalette.grid} horizontal={false} />
              <XAxis type="number" tickFormatter={(value) => wonMan(Math.abs(Number(value)))} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-muted)", fontSize: 12 }} />
              <YAxis dataKey="name" type="category" width={86} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-secondary)", fontSize: 12 }} />
              <Tooltip content={<AccountingTooltip absolute />} />
              <ReferenceLine x={0} stroke={accountingPalette.axis} />
              <Bar dataKey="liabilityIncrease" name="사용 증가" fill={accountingPalette.liability} radius={[0, 7, 7, 0]} />
              <Bar dataKey="liabilityDecrease" name="상환 감소" fill={accountingPalette.repayment} radius={[7, 0, 0, 7]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </AccountingChartCard>
    </div>
  );
}
