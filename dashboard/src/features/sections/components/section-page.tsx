import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { won, wonCompact } from "@/lib/format";
import { LedgerWorkbench } from "./ledger-workbench";
import { CategoryBudgetChart, MonthlyTrendChart, PaymentMixChart } from "./section-charts";
import type { SectionViewModel } from "../types";

interface SectionPageProps {
  model: SectionViewModel;
}

export function SectionPage({ model }: SectionPageProps) {
  return (
    <>
      <section className="section-hero">
        <div>
          <p className="eyebrow compact">{model.header.eyebrow}</p>
          <h1>{model.header.title}</h1>
          <p>{model.header.description}</p>
        </div>
        <Badge tone="neutral">{model.header.badge}</Badge>
      </section>

      <div className="metric-grid">
        {model.metrics.map((metric) => (
          <Card key={metric.label} className="metric-card">
            <CardHeader>
              <div className="metric-card-top">
                <CardDescription>{metric.label}</CardDescription>
                <Badge tone={metric.tone}>{metric.tone}</Badge>
              </div>
              <CardTitle className="metric-value">{metric.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="metric-detail">{metric.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          {model.key === "ledger" ? <LedgerPanel model={model} /> : null}
          {model.key === "trend" ? <TrendPanel model={model} /> : null}
          {model.key === "budget" ? <BudgetPanel model={model} /> : null}
          {model.key === "assets" ? <AssetsPanel model={model} /> : null}
          {model.key === "analysis" ? <AnalysisPanel model={model} /> : null}
          {model.key === "habits" ? <HabitsPanel model={model} /> : null}
        </div>

        <aside className="dashboard-side">
          <InsightPanel model={model} />
          <PaymentPanel model={model} />
        </aside>
      </div>
    </>
  );
}

function LedgerPanel({ model }: SectionPageProps) {
  return (
    <Card className="transaction-panel">
      <CardHeader>
        <CardDescription>Entries</CardDescription>
        <CardTitle>최근 원장</CardTitle>
      </CardHeader>
      <CardContent>
        <LedgerWorkbench
          rows={model.ledger}
          months={model.ledgerMonths}
          selectedMonth={model.selectedLedgerMonth}
        />
      </CardContent>
    </Card>
  );
}

function TrendPanel({ model }: SectionPageProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardDescription>Monthly Flow</CardDescription>
          <CardTitle>월별 지출과 수입</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyTrendChart model={model} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Recent Months</CardDescription>
          <CardTitle>월별 요약</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleMonthlyTable model={model} />
        </CardContent>
      </Card>
    </>
  );
}

function BudgetPanel({ model }: SectionPageProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardDescription>Average Baseline</CardDescription>
          <CardTitle>카테고리 평균 대비</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryBudgetChart model={model} />
        </CardContent>
      </Card>
      <CategoryTable model={model} />
    </>
  );
}

function AssetsPanel({ model }: SectionPageProps) {
  const assets = model.accounts.filter((account) => account.kind === "asset");
  const liabilities = model.accounts.filter((account) => account.kind === "liability");

  return (
    <div className="split-grid">
      <AccountPanel title="자산 계정" accounts={assets} />
      <AccountPanel title="부채·카드 계정" accounts={liabilities} />
    </div>
  );
}

function AnalysisPanel({ model }: SectionPageProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardDescription>Rule Engine</CardDescription>
          <CardTitle>설명 가능한 지출 신호</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="analysis-grid">
            {model.insights.map((insight) => (
              <article key={insight.title} className={`analysis-card analysis-${insight.tone}`}>
                <Badge tone={insight.tone}>{insight.tone}</Badge>
                <strong>{insight.title}</strong>
                <p>{insight.body}</p>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Payment Concentration</CardDescription>
          <CardTitle>결제수단 집중도</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentMixChart model={model} />
        </CardContent>
      </Card>
    </>
  );
}

function HabitsPanel({ model }: SectionPageProps) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>Repeated Merchants</CardDescription>
        <CardTitle>반복 지출 패턴</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="habit-list">
          {model.habits.map((habit) => (
            <article key={habit.name} className="habit-row">
              <div>
                <strong>{habit.name}</strong>
                <p>{habit.count}회 반복 · 마지막 {habit.lastDate}</p>
              </div>
              <b>{won(habit.amount)}</b>
            </article>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function InsightPanel({ model }: SectionPageProps) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>Signals</CardDescription>
        <CardTitle>운영 인사이트</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="side-list">
          {model.insights.slice(0, 4).map((insight) => (
            <article key={insight.title} className="side-item">
              <Badge tone={insight.tone}>{insight.tone}</Badge>
              <strong>{insight.title}</strong>
              <p>{insight.body}</p>
            </article>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentPanel({ model }: SectionPageProps) {
  return (
    <Card className="panel-dark">
      <CardHeader>
        <CardDescription className="eyebrow on-dark">Payment Mix</CardDescription>
        <CardTitle>이번 달 결제수단</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="dark-list">
          {model.paymentMix.slice(0, 6).map((row) => (
            <article key={row.name}>
              <div>
                <strong>{row.name}</strong>
                <p>{row.category} · {row.count}건</p>
              </div>
              <b>{wonCompact(row.amount)}</b>
            </article>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SimpleMonthlyTable({ model }: SectionPageProps) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>월</th>
            <th className="amount">수입</th>
            <th className="amount">지출</th>
            <th className="amount">카드정산</th>
          </tr>
        </thead>
        <tbody>
          {model.monthlyTrend.map((row) => (
            <tr key={row.ym}>
              <td>{row.ym}</td>
              <td className="amount">{won(row.income)}</td>
              <td className="amount">{won(row.expenses)}</td>
              <td className="amount">{won(row.cardPayment)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryTable({ model }: SectionPageProps) {
  return (
    <Card className="transaction-panel">
      <CardHeader>
        <CardDescription>Categories</CardDescription>
        <CardTitle>카테고리 상세</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>카테고리</th>
                <th>유형</th>
                <th className="amount">현재</th>
                <th className="amount">평균</th>
                <th className="amount">거래</th>
              </tr>
            </thead>
            <tbody>
              {model.categories.map((category) => (
                <tr key={category.name}>
                  <td>{category.name}</td>
                  <td>{category.categoryType}</td>
                  <td className="amount">{won(category.currentAmount)}</td>
                  <td className="amount">{won(category.averageAmount)}</td>
                  <td className="amount">{category.transactionCount}건</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountPanel({ title, accounts }: { title: string; accounts: SectionViewModel["accounts"] }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>Accounts</CardDescription>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="asset-list">
          {accounts.map((account) => (
            <article key={account.id} className="asset-row">
              <div>
                <strong>{account.name}</strong>
                <p>{account.category}{account.paymentDay ? ` · 결제일 ${account.paymentDay}일` : ""}</p>
              </div>
              <b className={account.kind === "liability" ? "negative" : ""}>{won(account.amount)}</b>
            </article>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
