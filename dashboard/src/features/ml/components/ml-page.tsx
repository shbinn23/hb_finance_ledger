import { AlertOctagon, BrainCircuit, CheckCircle2 } from "lucide-react";
import { PeriodFilter } from "@/components/filters/period-filter";
import { MetricCard } from "@/components/metrics/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { won } from "@/lib/format";
import { RightInsightPanel } from "@/features/sections/components/section-side-panel";
import { MlForecastChart } from "./ml-charts";
import type { MlInsightsViewModel } from "../types";

interface MlPageProps {
  model: MlInsightsViewModel;
}

export function MlPage({ model }: MlPageProps) {
  return (
    <>
      <section className="section-hero">
        <div>
          <p className="eyebrow compact">Machine Learning</p>
          <h1>{model.header.title}</h1>
          <p>{model.header.description}</p>
        </div>
        <div className="section-hero-actions">
          <PeriodFilter options={model.periodOptions} value={model.selectedPeriod} />
          <Badge tone={model.source === "ml" ? "stable" : "watch"}>{model.header.badge}</Badge>
        </div>
      </section>

      <section className={`ml-coach ml-coach-${model.coach.tone}`}>
        <div className="ml-coach-icon">
          <BrainCircuit size={24} />
        </div>
        <div>
          <p className="eyebrow compact">{model.source === "ml" ? "Model Coach" : "Fallback Coach"}</p>
          <h2>{model.coach.title}</h2>
          <p>{model.coach.body}</p>
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

      <div className="dashboard-grid">
        <div className="dashboard-main">
          {model.mode === "forecast" ? (
            <Card className="ml-main-chart">
              <CardHeader>
                <div className="section-heading card-section-heading">
                  <div>
                    <CardDescription>Forecast Engine</CardDescription>
                    <CardTitle>{model.selectedPeriod.month === undefined ? "월말 지출 예측" : `${model.selectedPeriod.label} 지출 예측`}</CardTitle>
                  </div>
                  <div className="legend">
                    <span><i className="legend-actual" /> 현재</span>
                    <span><i className="legend-actual-projection" /> 실지출 예상</span>
                    <span><i className="legend-projected" /> ML 예상</span>
                    <span><i className="legend-baseline" /> 최근 기준</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <MlForecastChart data={model.forecast} />
              </CardContent>
            </Card>
          ) : model.periodReport ? (
            <Card className="transaction-panel">
              <CardHeader>
                <CardDescription>Period Report</CardDescription>
                <CardTitle>{model.periodReport.title}</CardTitle>
                <p className="metric-detail">{model.periodReport.description}</p>
              </CardHeader>
              <CardContent>
                {model.periodReport.monthlyTrend.length > 0 ? (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>월</th>
                          <th className="amount">지출</th>
                          <th className="amount">수입</th>
                          <th className="amount">카드정산</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.periodReport.monthlyTrend.map((row) => (
                          <tr key={row.ym}>
                            <td>{row.label}</td>
                            <td className="amount">{won(row.expenses)}</td>
                            <td className="amount">{won(row.income)}</td>
                            <td className="amount">{won(row.cardPayment)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>{model.periodReport.emptyText}</strong>
                    <p>기간을 바꾸거나 원장 동기화 상태를 확인하세요.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card className="transaction-panel ml-anomaly-panel">
            <CardHeader>
              <div className="section-heading card-section-heading">
                <div>
                  <CardDescription>Anomaly Detection</CardDescription>
                  <CardTitle>이상 결제 탐지</CardTitle>
                </div>
                {model.anomalies.some((row) => row.isAnomaly) ? (
                  <AlertOctagon size={20} className="text-[var(--ruby)]" />
                ) : (
                  <CheckCircle2 size={20} className="text-[var(--green)]" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="ml-anomaly-list">
                {model.anomalies.length > 0 ? model.anomalies.map((row) => (
                  <article key={`${row.date}-${row.description}-${row.amount}`} className={row.isAnomaly ? "ml-anomaly-row flagged" : "ml-anomaly-row"}>
                    <div>
                      <strong>{row.description}</strong>
                      <p>{row.date} · {row.category}</p>
                    </div>
                    <div>
                      <strong>{row.amount}</strong>
                      <span>{row.isAnomaly ? "이상 후보" : "정상 범위"} · {row.score}</span>
                    </div>
                  </article>
                )) : (
                  <div className="empty-state">
                    <strong>표시할 이상 결제 후보가 없습니다.</strong>
                    <p>
                      {model.engineEnabled
                        ? "ML 엔진이 응답하지 않았거나 이번 달 탐지 결과가 비어 있습니다."
                        : "ML_ENGINE_ENABLED=false 설정으로 ML 자동 실행을 꺼두었습니다."}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="dashboard-side">
          <RightInsightPanel model={model} />
        </aside>
      </div>
    </>
  );
}
