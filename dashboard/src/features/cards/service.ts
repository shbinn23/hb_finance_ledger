import { getCardBenefitMonthlyAssetsSummary } from "@/server/card-benefits/repository";
import { won } from "@/lib/format";
import type { RightInsightPanelCard, SectionMetric } from "@/features/sections/types";
import type { CardsViewModel } from "./types";

function structuredPerformanceTotal(summary: CardsViewModel["summary"]) {
  return summary.statementEstimates.reduce((sum, row) => sum + row.structuredPerformanceTotal, 0);
}

function buildMetrics(summary: CardsViewModel["summary"]): SectionMetric[] {
  const performanceTotal = structuredPerformanceTotal(summary);

  return [
    {
      label: "승인금액",
      value: won(summary.approvalTotal),
      detail: "실적 기준",
      tone: summary.approvalTotal > 0 ? "stable" : "neutral",
    },
    {
      label: "실적 예상",
      value: won(performanceTotal),
      detail: "구조화 입력 기준",
      tone: performanceTotal > 0 ? "stable" : "neutral",
    },
    {
      label: "매입금액",
      value: won(summary.postingTotal),
      detail: "명세서·후잉 원장 기준",
      tone: "stable",
    },
    {
      label: "적용 할인",
      value: won(summary.discountTotal),
      detail: "구조화/백필 이벤트 기준",
      tone: summary.discountTotal > 0 ? "stable" : "neutral",
    },
    {
      label: "혜택 거래",
      value: `${summary.eventCount.toLocaleString("ko-KR")}건`,
      detail: "구조화 입력 기준",
      tone: summary.eventCount > 0 ? "stable" : "neutral",
    },
  ];
}

function buildRightInsightPanels(summary: CardsViewModel["summary"]): RightInsightPanelCard[] {
  const statementTotal = summary.statementEstimates.reduce((sum, row) => sum + row.statementEstimate, 0);
  const approvalTotal = summary.statementEstimates.reduce((sum, row) => sum + row.structuredApprovalTotal, 0);
  const performanceTotal = structuredPerformanceTotal(summary);
  const legacyTotal = summary.statementEstimates.reduce((sum, row) => sum + row.legacyPostingTotal, 0);
  const autoCapReadyCount = summary.capStatuses.filter((status) => status.autoStatus === "ready").length;
  const autoCapUnknownCount = summary.capStatuses.filter((status) => status.autoStatus === "unknown").length;

  return [
    {
      eyebrow: "Benefit Tracking",
      title: "혜택 추적 상태",
      visuals: [
        {
          type: "bars",
          rows: [
            { label: "활성 rule", value: summary.capStatuses.length, detail: `${summary.capStatuses.length}개` },
            { label: "구조화 이벤트", value: summary.eventCount, detail: `${summary.eventCount.toLocaleString("ko-KR")}건` },
            { label: "총 할인액", value: summary.discountTotal, detail: won(summary.discountTotal) },
          ],
        },
      ],
    },
    {
      eyebrow: "Data Boundary",
      title: "데이터 경계",
      visuals: [
        {
          type: "note",
          text: "기존 카드 거래는 승인금액이 없어 실적 산정에서 제외되거나 legacy 추정으로 분리됩니다.",
        },
        {
          type: "note",
          text: "신규 Slack 입력분부터 승인금액, 실적금액, 적용 할인, 매입금액을 구조화해 추적합니다.",
        },
      ],
    },
    {
      eyebrow: "Performance",
      title: "실적 데이터",
      visuals: [
        {
          type: "bars",
          rows: [
            { label: "실적 예상", value: performanceTotal, detail: won(performanceTotal) },
            { label: "승인금액", value: approvalTotal, detail: won(approvalTotal) },
            { label: "legacy 제외", value: legacyTotal, detail: `${won(legacyTotal)} 실적 미확인` },
          ],
        },
        {
          type: "note",
          text: "실적 예상은 구조화된 performance_amount 기준입니다. 기존 후잉 거래는 승인금액이 없어 실적에서 제외합니다.",
        },
      ],
    },
    {
      eyebrow: "Cap Readiness",
      title: "한도 산정",
      visuals: [
        {
          type: "bars",
          rows: [
            { label: "자동 산정 가능", value: autoCapReadyCount, detail: `${autoCapReadyCount}개 rule` },
            { label: "산정 불가", value: autoCapUnknownCount, detail: `${autoCapUnknownCount}개 rule` },
          ],
        },
        {
          type: "note",
          text: "전월 구조화 실적이 없는 rule은 한도를 자동 산정하지 않습니다.",
        },
      ],
    },
    {
      eyebrow: "Statement Basis",
      title: "명세서 기준",
      visuals: [
        {
          type: "bars",
          rows: [
            { label: "명세서 예상", value: statementTotal, detail: won(statementTotal) },
            { label: "실적 기준 승인", value: approvalTotal, detail: won(approvalTotal) },
            { label: "legacy 추정", value: legacyTotal, detail: won(legacyTotal) },
          ],
        },
        { type: "note", text: "명세서는 매입금액 기준, 실적은 승인금액 기준으로 분리합니다." },
      ],
    },
    {
      eyebrow: "Next Action",
      title: "다음 행동",
      visuals: [
        { type: "note", text: "신규 Slack 입력분을 쌓아야 다음 달부터 실적과 한도 자동 산정이 가능해집니다." },
        { type: "note", text: "월말에는 카드사 명세서와 Beta 예측값을 대조해 보정 포인트를 확인하세요." },
      ],
    },
  ];
}

export async function getCardsViewModel(): Promise<CardsViewModel> {
  const summary = await getCardBenefitMonthlyAssetsSummary();

  return {
    header: {
      title: "카드 관리",
      description: "승인금액, 실적금액, 할인액, 매입금액을 기준으로 카드 혜택과 명세서를 추적합니다.",
      badge: "Card Beta",
    },
    metrics: buildMetrics(summary),
    summary,
    rightInsightPanels: buildRightInsightPanels(summary),
  };
}
