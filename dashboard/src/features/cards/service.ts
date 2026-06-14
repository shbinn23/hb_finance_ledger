import { getCardBenefitMonthlyAssetsSummary } from "@/server/card-benefits/repository";
import { won } from "@/lib/format";
import type { RightInsightPanelCard, SectionMetric } from "@/features/sections/types";
import type { CardsViewModel } from "./types";

function structuredPerformanceTotal(summary: CardsViewModel["summary"]) {
  return summary.statementEstimates.reduce((sum, row) => sum + row.performanceEstimate, 0);
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
      label: "구조화 거래",
      value: `${summary.eventCount.toLocaleString("ko-KR")}건`,
      detail: "app.card_benefit_events 건수",
      tone: summary.eventCount > 0 ? "stable" : "neutral",
    },
  ];
}

function buildRightInsightPanels(summary: CardsViewModel["summary"]): RightInsightPanelCard[] {
  const autoCapReadyCount = summary.capStatuses.filter((status) => status.autoStatus === "ready").length;
  const autoCapUnknownCount = summary.capStatuses.filter((status) => status.autoStatus === "unknown").length;

  return [
    {
      eyebrow: "Data Boundary",
      title: "데이터 경계",
      visuals: [
        {
          type: "note",
          text: "카드대금 상환은 비용이 아니라 부채 감소와 자산 감소 거래입니다.",
        },
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
      eyebrow: "Cap Readiness",
      title: "한도 산정",
      visuals: [
        {
          type: "note",
          text: `자동 산정 가능 ${autoCapReadyCount}개, 산정 불가 ${autoCapUnknownCount}개 rule입니다.`,
        },
        {
          type: "note",
          text: "전월 구조화 실적이 있어야 다음 달 카드혜택 한도를 자동 산정할 수 있습니다.",
        },
      ],
    },
    {
      eyebrow: "Next Action",
      title: "다음 행동",
      visuals: [
        { type: "note", text: "상환 등록 전 확인 모달에서 장부 기록임을 확인합니다." },
        { type: "note", text: "월말에는 카드앱·명세서와 카드별 요약을 대조하세요." },
        { type: "note", text: "자주 쓰는 카드부터 혜택 rule을 추가해 추적 범위를 넓히세요." },
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
