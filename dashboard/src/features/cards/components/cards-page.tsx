import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDisplayDate, won } from "@/lib/format";
import { RightInsightPanel } from "@/features/sections/components/section-side-panel";
import type { CardsDataQualityTone, CardsViewModel } from "../types";

interface CardsPageProps {
  model: CardsViewModel;
}

function dataQuality(value: string): CardsDataQualityTone {
  if (value === "structured") return { label: "구조화", tone: "stable" };
  if (value === "partial_estimate") return { label: "일부 추정", tone: "watch" };
  if (value === "legacy_estimate") return { label: "legacy 추정", tone: "neutral" };
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

function cardPaymentStatus(value: string): CardsDataQualityTone {
  if (value === "ready") return { label: "등록 가능", tone: "stable" };
  if (value === "registered") return { label: "등록됨", tone: "neutral" };
  if (value === "needs_review") return { label: "확인 필요", tone: "watch" };
  if (value === "asset_required") return { label: "계좌 선택 필요", tone: "watch" };
  return { label: "청구 없음", tone: "neutral" };
}

function formatUsePeriodText(startDate: number, endDate: number) {
  return `${formatDisplayDate(String(startDate))}~${formatDisplayDate(String(endDate))}`;
}

function cardPaymentActionLabel(status: string) {
  if (status === "registered") return "등록됨";
  if (status === "asset_required") return "계좌 선택 필요";
  if (status === "no_bill") return "청구 없음";
  return "상환 등록 준비 중";
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
          <CardSummarySection model={model} />
          <CardBillPaymentSection model={model} />
          <CardCapStatusSection model={model} />
          <RecentBenefitEventsSection model={model} />
        </div>

        <aside className="dashboard-side">
          <RightInsightPanel model={model} />
        </aside>
      </div>
    </>
  );
}

function CardSummarySection({ model }: CardsPageProps) {
  const { summary } = model;

  return (
    <Card className="transaction-panel">
      <CardHeader>
        <CardDescription>Card Summary</CardDescription>
        <div className="metric-card-top">
          <CardTitle>카드별 요약</CardTitle>
          <Badge tone="neutral">Beta</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="metric-detail">
          {summary.monthLabel} 기준으로 실적, 명세서·매입금액, 혜택 적용액을 카드별로 함께 비교합니다.
        </p>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>카드</th>
                <th className="amount">승인금액</th>
                <th className="amount">실적금액</th>
                <th className="amount">매입금액</th>
                <th className="amount">적용 할인</th>
                <th className="amount">구조화 거래</th>
                <th>데이터 품질</th>
              </tr>
            </thead>
            <tbody>
              {summary.statementEstimates.length > 0 ? (
                summary.statementEstimates.map((row) => {
                  const quality = dataQuality(row.dataQuality);
                  return (
                    <tr key={`${row.cardAccountType}:${row.cardAccountId}`}>
                      <td>{row.cardName}</td>
                      <td className="amount">{won(row.structuredApprovalTotal)}</td>
                      <td className="amount">{won(row.structuredPerformanceTotal)}</td>
                      <td className="amount">{won(row.statementEstimate)}</td>
                      <td className="amount">{won(row.structuredDiscountTotal)}</td>
                      <td className="amount">{row.structuredCount.toLocaleString("ko-KR")}건</td>
                      <td><Badge tone={quality.tone}>{quality.label}</Badge></td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    카드별 요약에 사용할 카드 지출 데이터가 아직 없습니다.
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

function CardBillPaymentSection({ model }: CardsPageProps) {
  const { summary } = model;

  return (
    <Card className="transaction-panel">
      <CardHeader>
        <CardDescription>Card Payment Beta</CardDescription>
        <div className="metric-card-top">
          <CardTitle>카드대금 상환 Beta</CardTitle>
          <Badge tone="neutral">Read-only</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="metric-detail">
          후잉 Bill 기준 청구액을 읽고, 기존 상환 이력으로 출금계좌를 추천합니다. 이번 단계에서는 실제 등록 버튼은 비활성화되어 있습니다.
        </p>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>카드</th>
                <th>사용기간</th>
                <th>결제일</th>
                <th className="amount">청구금액</th>
                <th>출금계좌 추천</th>
                <th>상태</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {summary.cardBillPayments.length > 0 ? summary.cardBillPayments.map((row) => {
                const status = cardPaymentStatus(row.repaymentStatus);
                return (
                  <tr key={`${row.billMonth}:${row.cardAccountId}`}>
                    <td>{row.cardName}</td>
                    <td>{formatUsePeriodText(row.useStartDate, row.useEndDate)}</td>
                    <td>{row.payDate ? `${row.payDate}일` : "-"}</td>
                    <td className="amount">{won(row.billAmount)}</td>
                    <td>{row.recommendedAssetName ?? "추천 불가"}</td>
                    <td>
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <div className="metric-detail">{row.statusReason}</div>
                    </td>
                    <td>
                      <button type="button" className="ui-button ui-button-secondary ui-button-sm" disabled>
                        {cardPaymentActionLabel(row.repaymentStatus)}
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    카드대금 상환 후보가 없습니다.
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
