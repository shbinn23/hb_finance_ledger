import { wonOrDash } from "@/lib/format";

type ForecastPoint = {
  actual?: number | null;
  actualProjection?: number | null;
  projected?: number | null;
  lower?: number | null;
  upper?: number | null;
  baseline?: number | null;
  ai?: number | null;
};

type ForecastTooltipPayload = Array<{
  payload?: ForecastPoint;
}>;

interface ForecastTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ForecastTooltipPayload;
  referenceKey?: "baseline" | "ai";
  referenceLabel?: string;
}

function hasMoney(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function TooltipRow({ label, value }: { label: string; value: number | null | undefined }) {
  if (!hasMoney(value)) return null;

  return (
    <div className="chart-tooltip-row">
      <span>{label}</span>
      <strong>{wonOrDash(value)}</strong>
    </div>
  );
}

export function ForecastTooltip({
  active,
  label,
  payload,
  referenceKey = "baseline",
  referenceLabel = "최근 기준",
}: ForecastTooltipProps) {
  if (!active || !payload?.length) return null;

  const point = payload.find((item) => item.payload)?.payload;
  if (!point) return null;

  const hasRange = hasMoney(point.lower) && hasMoney(point.upper);
  const hasActualProjection = hasMoney(point.actualProjection);

  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}일</p>
      <div className="chart-tooltip-list">
        <TooltipRow label="현재" value={point.actual} />
        <TooltipRow label="실지출 예상" value={point.actualProjection} />
        <TooltipRow label="ML 예상" value={point.projected} />
        {hasRange ? (
          <div className="chart-tooltip-row">
            <span>예상 범위</span>
            <strong>{wonOrDash(point.lower)} ~ {wonOrDash(point.upper)}</strong>
          </div>
        ) : null}
        <TooltipRow label={referenceLabel} value={point[referenceKey]} />
      </div>
      {hasActualProjection ? (
        <p className="chart-tooltip-note">현재 실제 지출에 ML 잔여 예측을 더한 값</p>
      ) : null}
    </div>
  );
}
