import { CheckCircle2, CircleAlert, Radar } from "lucide-react";
import type { InsightItem, RiskLevel } from "../types";

interface InsightRailProps {
  insights: InsightItem[];
}

const icons: Record<RiskLevel, typeof CheckCircle2> = {
  stable: CheckCircle2,
  watch: Radar,
  over: CircleAlert,
};

export function InsightRail({ insights }: InsightRailProps) {
  return (
    <section className="insight-rail">
      {insights.map((insight) => {
        const Icon = icons[insight.tone];
        return (
          <article className={`insight-card insight-${insight.tone}`} key={insight.title}>
            <Icon size={18} />
            <div>
              <strong>{insight.title}</strong>
              <p>{insight.body}</p>
            </div>
          </article>
        );
      })}
    </section>
  );
}
