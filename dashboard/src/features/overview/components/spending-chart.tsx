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
import type { SpendingPoint } from "../types";

interface SpendingChartProps {
  data: SpendingPoint[];
  monthLabel: string;
}

export function SpendingChart({ data, monthLabel }: SpendingChartProps) {
  return (
    <div className="chart-frame">
      <div className="section-heading">
        <div>
          <p className="eyebrow compact">Monthly Flow</p>
          <h2>{monthLabel} 지출 진행률</h2>
        </div>
        <div className="legend">
          <span><i className="legend-actual" /> 현재</span>
          <span><i className="legend-actual-projection" /> 실지출 예상</span>
          <span><i className="legend-projected" /> ML 예상</span>
          <span><i className="legend-baseline" /> 최근 기준</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary-soft)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--primary-soft)" stopOpacity={0.02} />
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
            content={<ForecastTooltip />}
          />
          <Area dataKey="upper" name="예상 상한" stroke="none" fill="url(#forecastBand)" dot={false} />
          <Area dataKey="lower" name="예상 하한" stroke="none" fill="var(--canvas)" dot={false} />
          <Line
            type="monotone"
            dataKey="baseline"
            name="최근 기준"
            stroke="var(--ink-muted)"
            strokeDasharray="6 5"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="projected"
            name="ML 예상"
            stroke="var(--primary)"
            strokeDasharray="4 4"
            strokeWidth={2.4}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="actualProjection"
            name="실지출 예상"
            stroke="var(--ruby)"
            strokeDasharray="4 4"
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
    </div>
  );
}
