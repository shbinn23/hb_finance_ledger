"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ForecastTooltip } from "@/components/charts/forecast-tooltip";
import { wonMan } from "@/lib/format";
import type { MlForecastPoint } from "../types";

interface MlForecastChartProps {
  data: MlForecastPoint[];
}

export function MlForecastChart({ data }: MlForecastChartProps) {
  return (
    <ResponsiveContainer width="100%" height={380}>
      <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -14 }}>
        <defs>
          <linearGradient id="mlBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary-soft)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="var(--primary-soft)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--hairline)" vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          stroke="var(--ink-muted)"
          fontSize={12}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={wonMan}
          stroke="var(--ink-muted)"
          fontSize={12}
        />
        <Tooltip
          cursor={{ stroke: "var(--primary)", strokeOpacity: 0.18 }}
          content={<ForecastTooltip referenceKey="ai" referenceLabel="ML 원본" />}
        />
        <Area dataKey="upper" name="예상 상한" stroke="none" fill="url(#mlBand)" dot={false} />
        <Area dataKey="lower" name="예상 하한" stroke="none" fill="var(--canvas)" dot={false} />
        <Line
          type="monotone"
          dataKey="ai"
          name="ML 원본"
          stroke="var(--primary)"
          strokeDasharray="4 4"
          strokeWidth={2.1}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="projected"
          name="ML 예상"
          stroke="var(--brand-dark)"
          strokeWidth={2.4}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="actual"
          name="현재"
          stroke="var(--ruby)"
          strokeWidth={3}
          dot={{ r: 3, fill: "var(--ruby)", strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
