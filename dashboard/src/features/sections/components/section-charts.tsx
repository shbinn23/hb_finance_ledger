"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { wonMan, wonOrDash } from "@/lib/format";
import type { SectionViewModel } from "../types";

const palette = ["var(--ruby)", "var(--primary)", "var(--magenta)", "var(--green)", "var(--amber)"];

function tooltipWon(value: unknown) {
  return wonOrDash(value);
}

interface ChartProps {
  model: SectionViewModel;
}

export function MonthlyTrendChart({ model }: ChartProps) {
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={model.monthlyTrend} margin={{ left: 8, right: 8, top: 16, bottom: 8 }}>
          <defs>
            <linearGradient id="expenseFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="var(--ruby)" stopOpacity={0.28} />
              <stop offset="95%" stopColor="var(--ruby)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(100, 116, 141, 0.14)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--ink-muted)", fontSize: 12 }} />
          <YAxis tickFormatter={wonMan} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-muted)", fontSize: 12 }} width={72} />
          <Tooltip formatter={tooltipWon} labelStyle={{ color: "var(--ink)" }} />
          <Area type="monotone" dataKey="expenses" name="지출" stroke="var(--ruby)" fill="url(#expenseFill)" strokeWidth={2.4} />
          <Line type="monotone" dataKey="income" name="수입" stroke="var(--primary)" strokeWidth={2.2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryBudgetChart({ model }: ChartProps) {
  const data = model.categories.slice(0, 8).map((category) => ({
    name: category.name,
    current: category.currentAmount,
    average: category.averageAmount,
  }));

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20, top: 8, bottom: 8 }}>
          <CartesianGrid stroke="rgba(100, 116, 141, 0.14)" horizontal={false} />
          <XAxis type="number" tickFormatter={wonMan} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-muted)", fontSize: 12 }} />
          <YAxis dataKey="name" type="category" width={78} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-secondary)", fontSize: 12 }} />
          <Tooltip formatter={tooltipWon} />
          <Bar dataKey="average" name="과거 평균" fill="rgba(100, 116, 141, 0.22)" radius={[0, 8, 8, 0]} />
          <Bar dataKey="current" name="현재 월" fill="var(--primary)" radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PaymentMixChart({ model }: ChartProps) {
  const data = model.paymentMix.slice(0, 8);

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={290}>
        <BarChart data={data} margin={{ left: 8, right: 8, top: 16, bottom: 8 }}>
          <CartesianGrid stroke="rgba(100, 116, 141, 0.14)" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={54} />
          <YAxis tickFormatter={wonMan} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-muted)", fontSize: 12 }} width={68} />
          <Tooltip formatter={tooltipWon} />
          <Bar dataKey="amount" name="지출액" radius={[8, 8, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={palette[index % palette.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
