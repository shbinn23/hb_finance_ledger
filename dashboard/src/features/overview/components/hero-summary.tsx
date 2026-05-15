import { DatabaseZap, ShieldCheck } from "lucide-react";
import { won } from "@/lib/format";
import type { OverviewViewModel } from "../types";

interface HeroSummaryProps {
  model: OverviewViewModel;
}

export function HeroSummary({ model }: HeroSummaryProps) {
  return (
    <section className="hero-summary">
      <div className="hero-copy">
        <div className="eyebrow">
          <ShieldCheck size={14} />
          {model.syncState}
        </div>
        <h1>Whooing Financial Command</h1>
        <p>
          후잉 API 구조를 그대로 보존한 mirror 데이터 위에서 자산, 부채, 지출 흐름을
          한 화면에 압축했습니다.
        </p>
      </div>

      <div className="hero-ledger" aria-label="자산 요약">
        <div>
          <span>총 자산</span>
          <strong>{won(model.assetTotal)}</strong>
        </div>
        <div>
          <span>총 부채</span>
          <strong className="negative">{won(model.liabilityTotal)}</strong>
        </div>
        <div className="hero-ledger-total">
          <span>순자산</span>
          <strong>{won(model.netWorth)}</strong>
        </div>
        <p>
          <DatabaseZap size={14} />
          snapshot {model.asOf}
        </p>
      </div>
    </section>
  );
}
