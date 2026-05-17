import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { calculateCardPerformanceEstimate } from "@/lib/card-benefits/assets-summary";
import { won } from "@/lib/format";
import { RightInsightPanel } from "@/features/sections/components/section-side-panel";
import type { CardsDataQualityTone, CardsViewModel } from "../types";

interface CardsPageProps {
  model: CardsViewModel;
}

function percentText(value: number) {
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}

function dataQuality(value: string): CardsDataQualityTone {
  if (value === "structured") return { label: "구조화", tone: "stable" };
  if (value === "partial_estimate") return { label: "일부 추정", tone: "watch" };
  if (value === "legacy_estimate") return { label: "legacy 추정", tone: "neutral" };
  return { label: "데이터 없음", tone: "neutral" };
}

function performanceQuality(value: string): CardsDataQualityTone {
  if (value === "structured") return { label: "구조화", tone: "stable" };
  return { label: "데이터 없음", tone: "neutral" };
}

function capAutoStatusLabel(value: string): CardsDataQualityTone {
  if (value === "ready") return { label: "자동 산정", tone: "stable" };
  if (value === "not_applicable") return { label: "한도 없음", tone: "neutral" };
  return { label: "산정 불가", tone: "watch" };
}

function capLimitText(autoStatus: string, amount: number | null) {
  if (autoStatus === "not_applicable") return "한도 없음";
  if (autoStatus === "ready" && amount !== null) return won(amount);
  return "미확정";
}

function capRemainingText(autoStatus: string, amount: number | null) {
  if (autoStatus === "ready" && amount !== null) return won(amount);
  return "-";
}

function capStatusDetail(status: CardsViewModel["summary"]["capStatuses"][number]) {
  if (status.autoStatus === "unknown") return "전월 구조화 실적 없음";
  if (status.autoStatus === "not_applicable") return "한도형 rule 아님";
  return "자동 산정";
}

function recordedDiscountDetail(status: CardsViewModel["summary"]["capStatuses"][number]) {
  if (status.backfilledDiscountAmount <= 0) return null;
  return `백필 기준 ${won(status.backfilledDiscountAmount)}`;
}

export function CardsPage({ model }: CardsPageProps) {
  return (
    <>
      <section className="section-hero">
        <div>
          <p className="eyebrow compact">Cards</p>
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
          <CardBenefitSection model={model} />
          <CardCapStatusSection model={model} />
          <CardPerformanceSection model={model} />
          <CardStatementSection model={model} />
          <RecentBenefitEventsSection model={model} />
        </div>

        <aside className="dashboard-side">
          <RightInsightPanel model={model} />
        </aside>
      </div>
    </>
  );
}

function CardBenefitSection({ model }: CardsPageProps) {
  const { summary } = model;

  return (
    <Card className="transaction-panel">
      <CardHeader>
        <CardDescription>Card Benefit Beta</CardDescription>
        <div className="metric-card-top">
          <CardTitle>카드혜택 Beta</CardTitle>
          <Badge tone="neutral">Beta</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="metric-detail">
          {summary.monthLabel} 구조화 카드혜택 이벤트 기준입니다. 승인금액은 실적 기준, 매입금액은 명세서·후잉 원장 기준입니다.
        </p>

        <div className="analysis-grid">
          <article className="analysis-card analysis-stable">
            <Badge tone="stable">approval</Badge>
            <strong>승인금액</strong>
            <p>{won(summary.approvalTotal)} · 카드 승인 원금</p>
          </article>
          <article className="analysis-card analysis-stable">
            <Badge tone="stable">discount</Badge>
            <strong>적용 할인</strong>
            <p>{won(summary.discountTotal)} · 절감률 {percentText(summary.effectiveSavingRate)}</p>
          </article>
          <article className="analysis-card analysis-neutral">
            <Badge tone="neutral">posting</Badge>
            <strong>매입금액</strong>
            <p>{won(summary.postingTotal)} · 명세서·후잉 기준</p>
          </article>
          <article className="analysis-card analysis-watch">
            <Badge tone="watch">events</Badge>
            <strong>혜택 거래</strong>
            <p>{summary.eventCount.toLocaleString("ko-KR")}건 · 구조화 입력 기준</p>
          </article>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>카드</th>
                <th className="amount">승인금액</th>
                <th className="amount">실적금액</th>
                <th className="amount">적용 할인</th>
                <th className="amount">매입금액</th>
                <th className="amount">구조화 거래</th>
              </tr>
            </thead>
            <tbody>
              {summary.statementEstimates.some((row) => row.structuredCount > 0) ? (
                summary.statementEstimates
                  .filter((row) => row.structuredCount > 0)
                  .map((row) => (
                    <tr key={`${row.cardAccountType}:${row.cardAccountId}`}>
                      <td>{row.cardName}</td>
                      <td className="amount">{won(row.structuredApprovalTotal)}</td>
                      <td className="amount">{won(row.structuredPerformanceTotal)}</td>
                      <td className="amount">{won(row.structuredDiscountTotal)}</td>
                      <td className="amount">{won(row.structuredPostingTotal)}</td>
                      <td className="amount">{row.structuredCount.toLocaleString("ko-KR")}건</td>
                    </tr>
                  ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    아직 구조화된 카드혜택 거래가 없습니다. Slack 지출 입력에서 카드혜택을 선택하면 이곳에 집계됩니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CardCapStatusSection({ model }: CardsPageProps) {
  const { summary } = model;

  return (
    <Card className="transaction-panel">
      <CardHeader>
        <CardDescription>Benefit Cap Status</CardDescription>
        <div className="metric-card-top">
          <CardTitle>카드별 혜택 한도 상태</CardTitle>
          <Badge tone="neutral">Beta</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="metric-detail">
          한도 자동 산정은 전월 구조화 실적금액이 있을 때만 가능합니다.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>카드</th>
                <th>혜택</th>
                <th>자동 산정 상태</th>
                <th className="amount">전월 구조화 실적</th>
                <th className="amount">자동 산정 한도</th>
                <th className="amount">기록된 할인</th>
                <th className="amount">자동 잔여 한도</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {summary.capStatuses.length > 0 ? summary.capStatuses.map((status) => {
                const label = capAutoStatusLabel(status.autoStatus);
                return (
                  <tr key={status.ruleId}>
                    <td>{status.cardName}</td>
                    <td>{status.ruleName}</td>
                    <td><Badge tone={label.tone}>{label.label}</Badge></td>
                    <td className="amount">{won(status.previousMonthPerformanceAmount)}</td>
                    <td className="amount">{capLimitText(status.autoStatus, status.autoMonthlyCapAmount)}</td>
                    <td className="amount">
                      {won(status.totalUsed)}
                      {recordedDiscountDetail(status) ? (
                        <div className="metric-detail">{recordedDiscountDetail(status)}</div>
                      ) : null}
                    </td>
                    <td className="amount">{capRemainingText(status.autoStatus, status.remainingCap)}</td>
                    <td>{capStatusDetail(status)}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    활성 카드혜택 rule이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CardPerformanceSection({ model }: CardsPageProps) {
  const { summary } = model;
  const structuredRows = summary.statementEstimates.filter((row) => row.structuredCount > 0);

  return (
    <Card className="transaction-panel">
      <CardHeader>
        <CardDescription>Performance Estimate Beta</CardDescription>
        <div className="metric-card-top">
          <CardTitle>카드 실적 예상 Beta</CardTitle>
          <Badge tone="neutral">Beta</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="metric-detail">
          실적 예상은 구조화된 실적금액 기준입니다. 기존 후잉 카드 거래는 승인금액이 없어 실적 예상에서 제외합니다.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>카드</th>
                <th className="amount">실적 예상</th>
                <th className="amount">승인금액</th>
                <th className="amount">매입금액</th>
                <th className="amount">적용 할인</th>
                <th>데이터 품질</th>
              </tr>
            </thead>
            <tbody>
              {structuredRows.length > 0 ? structuredRows.map((row) => {
                const estimate = calculateCardPerformanceEstimate({
                  structuredPerformanceTotal: row.structuredPerformanceTotal,
                  structuredApprovalTotal: row.structuredApprovalTotal,
                  structuredPostingTotal: row.structuredPostingTotal,
                  structuredDiscountTotal: row.structuredDiscountTotal,
                  legacyPostingTotal: row.legacyPostingTotal,
                });
                const quality = performanceQuality(estimate.dataQuality);
                return (
                  <tr key={`${row.cardAccountType}:${row.cardAccountId}`}>
                    <td>{row.cardName}</td>
                    <td className="amount">{won(estimate.performanceEstimate)}</td>
                    <td className="amount">{won(estimate.structuredApprovalTotal)}</td>
                    <td className="amount">{won(estimate.structuredPostingTotal)}</td>
                    <td className="amount">{won(estimate.structuredDiscountTotal)}</td>
                    <td><Badge tone={quality.tone}>{quality.label}</Badge></td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    구조화된 실적 데이터가 없습니다. 기존 후잉 카드 거래는 실적 미확인으로 남겨 둡니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CardStatementSection({ model }: CardsPageProps) {
  const { summary } = model;

  return (
    <Card className="transaction-panel">
      <CardHeader>
        <CardDescription>Statement Estimate Beta</CardDescription>
        <div className="metric-card-top">
          <CardTitle>카드 명세서 예측 Beta</CardTitle>
          <Badge tone="neutral">Beta</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="metric-detail">
          명세서 예상은 매입금액 기준입니다. 기존 후잉 카드 거래는 승인금액이 없어 legacy 추정으로 분리합니다.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>카드</th>
                <th className="amount">명세서 예상</th>
                <th className="amount">실적 기준 승인금액</th>
                <th className="amount">적용 할인</th>
                <th className="amount">legacy 추정</th>
                <th>데이터 품질</th>
              </tr>
            </thead>
            <tbody>
              {summary.statementEstimates.length > 0 ? summary.statementEstimates.map((row) => {
                const quality = dataQuality(row.dataQuality);
                return (
                  <tr key={`${row.cardAccountType}:${row.cardAccountId}`}>
                    <td>{row.cardName}</td>
                    <td className="amount">{won(row.statementEstimate)}</td>
                    <td className="amount">{won(row.structuredApprovalTotal)}</td>
                    <td className="amount">{won(row.structuredDiscountTotal)}</td>
                    <td className="amount">{won(row.legacyPostingTotal)}</td>
                    <td><Badge tone={quality.tone}>{quality.label}</Badge></td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    카드 명세서 예측에 사용할 카드 지출 데이터가 아직 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentBenefitEventsSection({ model }: CardsPageProps) {
  const { summary } = model;

  return (
    <Card className="transaction-panel">
      <CardHeader>
        <CardDescription>Recent Benefit Events</CardDescription>
        <CardTitle>최근 카드혜택 거래</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>카드</th>
                <th>혜택</th>
                <th className="amount">승인금액</th>
                <th className="amount">할인액</th>
                <th className="amount">매입금액</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentEvents.length > 0 ? summary.recentEvents.map((event) => (
                <tr key={event.eventId}>
                  <td>{event.date}</td>
                  <td>{event.cardName}</td>
                  <td>{event.ruleName}</td>
                  <td className="amount">{won(event.approvalAmount)}</td>
                  <td className="amount">{won(event.discountAmount)}</td>
                  <td className="amount">{won(event.postingAmount)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    아직 구조화된 카드혜택 거래가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
