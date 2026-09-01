import { Shell } from "@/components/layout/shell";
import { MetricCard } from "@/components/metrics/metric-card";
import { AccountStack } from "@/features/overview/components/account-stack";
import { CategoryBoard } from "@/features/overview/components/category-board";
import { FixedExpenseCard } from "@/features/overview/components/fixed-expense-card";
import { HeroSummary } from "@/features/overview/components/hero-summary";
import { InsightRail } from "@/features/overview/components/insight-rail";
import { SpendingChart } from "@/features/overview/components/spending-chart";
import { TransactionTable } from "@/features/overview/components/transaction-table";
import { getOverviewViewModel } from "@/features/overview/service";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const model = await getOverviewViewModel();

  return (
    <Shell>
      <HeroSummary model={model} />

      <div className="metric-grid">
        {model.summary.map((metric) => (
          <MetricCard
            key={metric.id}
            label={metric.label}
            value={metric.value}
            detail={metric.detail}
            tone={metric.tone}
          />
        ))}
      </div>

      <InsightRail insights={model.insights} />

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <SpendingChart data={model.spending} monthLabel={model.monthLabel} />
          <TransactionTable rows={model.transactions} />
        </div>
        <aside className="dashboard-side">
          <FixedExpenseCard fixedExpense={model.fixedExpense} />
          <CategoryBoard categories={model.categories} />
          <AccountStack accounts={model.accounts} />
        </aside>
      </div>
    </Shell>
  );
}
