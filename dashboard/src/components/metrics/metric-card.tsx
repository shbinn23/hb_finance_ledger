import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { RiskLevel } from "@/features/overview/types";

interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  tone?: RiskLevel;
}

const toneIcon = {
  stable: ArrowDownRight,
  watch: ArrowRight,
  over: ArrowUpRight,
};

export function MetricCard({ label, value, detail, tone = "stable" }: MetricCardProps) {
  const Icon = toneIcon[tone];

  return (
    <article className="metric-card animate-card">
      <div className="flex items-start justify-between gap-4">
        <p className="metric-label">{label}</p>
        <span className={`metric-icon metric-${tone}`}>
          <Icon size={15} strokeWidth={1.8} />
        </span>
      </div>
      <p className="metric-value">{value}</p>
      {detail ? <p className="metric-detail">{detail}</p> : null}
    </article>
  );
}
