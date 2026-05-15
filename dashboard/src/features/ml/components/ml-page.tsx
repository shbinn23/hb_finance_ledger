import { AlertOctagon, BrainCircuit, CheckCircle2, RadioTower } from "lucide-react";
import { MetricCard } from "@/components/metrics/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
        <Badge tone={model.source === "ml" ? "stable" : "watch"}>{model.header.badge}</Badge>
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
          <Card className="ml-main-chart">
            <CardHeader>
              <div className="section-heading card-section-heading">
                <div>
                  <CardDescription>Forecast Engine</CardDescription>
                  <CardTitle>월말 지출 예측</CardTitle>
                </div>
                <div className="legend">
                  <span><i className="legend-actual" /> 현재</span>
                  <span><i className="legend-projected" /> ML 예상</span>
                  <span><i className="legend-baseline" /> ML 원본</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <MlForecastChart data={model.forecast} />
            </CardContent>
          </Card>

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
          <Card className="panel-dark ml-status-panel">
            <CardHeader>
              <div className="section-heading card-section-heading compact-heading">
                <div>
                  <CardDescription className="eyebrow on-dark">Model Boundary</CardDescription>
                  <CardTitle>실행 상태</CardTitle>
                </div>
                <RadioTower size={18} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="ml-status-list">
                {model.status.map((item) => (
                  <div key={item.label} className="ml-status-row">
                    <p>{item.label}</p>
                    <strong>{item.value}</strong>
                    <span>{item.detail}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="section-heading card-section-heading compact-heading">
                <div>
                  <CardDescription>Model Coach</CardDescription>
                  <CardTitle>판단 요약</CardTitle>
                </div>
                <BrainCircuit size={18} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`ml-side-coach ml-side-coach-${model.coach.tone}`}>
                <strong>{model.coach.title}</strong>
                <p>{model.coach.body}</p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
