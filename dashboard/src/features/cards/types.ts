import type { CardBenefitAssetsSummary } from "@/server/card-benefits/repository";
import type { RightInsightPanelCard, RiskTone, SectionMetric } from "@/features/sections/types";

export interface CardsHeader {
  title: string;
  description: string;
  badge: string;
}

export interface CardsViewModel {
  header: CardsHeader;
  metrics: SectionMetric[];
  summary: CardBenefitAssetsSummary;
  rightInsightPanels: RightInsightPanelCard[];
}

export type CardsDataQualityTone = {
  label: string;
  tone: RiskTone;
};
