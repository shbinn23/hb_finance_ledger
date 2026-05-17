import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { won } from "@/lib/format";
import type {
  RightInsightChartRow,
  RightInsightPanelCard,
  RightInsightTimelineRow,
  RightInsightVisual,
} from "../types";

interface RightInsightPanelProps {
  model: {
    rightInsightPanels: RightInsightPanelCard[];
  };
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toneLabel(tone: RightInsightTimelineRow["tone"]) {
  if (tone === "over") return "주의";
  if (tone === "watch") return "관찰";
  return "안정";
}

function InsightBulletChart({ visual }: { visual: Extract<RightInsightVisual, { type: "bullet" }> }) {
  return (
    <article className="side-visual-card">
      <div className="side-visual-head">
        <div>
          <strong>{visual.title}</strong>
          <p>{visual.detail}</p>
        </div>
        <Badge className="side-visual-metric" tone={visual.tone}>{visual.value}</Badge>
      </div>
      <div className="mini-bullet" aria-label={visual.title}>
        <span className="mini-bullet-fill" style={{ width: `${clampPercent(visual.percent)}%` }} />
        <i className="mini-bullet-baseline" style={{ left: "80%" }} />
        <i className="mini-bullet-danger" style={{ left: "84%" }} />
      </div>
      <div className="mini-bullet-marker-labels" aria-hidden="true">
        <span>현재</span>
        <span>기준</span>
        <span>관찰</span>
      </div>
      <div className="mini-scale">
        <span>0</span>
        <span>100%</span>
        <span>105%</span>
      </div>
    </article>
  );
}

function InsightProgressBar({ visual }: { visual: Extract<RightInsightVisual, { type: "progress" }> }) {
  return (
    <article className="side-visual-card">
      <div className="side-visual-head">
        <div>
          <strong>{visual.title}</strong>
          <p>{visual.detail}</p>
        </div>
        <Badge className="side-visual-metric" tone={visual.tone}>{clampPercent(visual.value)}%</Badge>
      </div>
      <div className="mini-progress">
        <span style={{ width: `${clampPercent(visual.value)}%` }} />
      </div>
      <div className="mini-progress-caption">
        <span>0%</span>
        <span>100%</span>
      </div>
    </article>
  );
}

function InsightSparkline({ rows }: { rows: RightInsightChartRow[] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="mini-sparkline" aria-label="월별 미니 추이">
      {rows.map((row) => (
        <span key={row.label} title={`${row.label} ${won(row.value)}`}>
          <i style={{ height: `${Math.max(8, (row.value / max) * 100)}%` }} />
        </span>
      ))}
    </div>
  );
}

function InsightMiniBars({ rows }: { rows: RightInsightChartRow[] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="mini-bar-list">
      {rows.map((row) => (
        <article key={row.label}>
          <div>
            <strong>{row.label}</strong>
            <p>{row.detail ?? won(row.value)}</p>
          </div>
          <div className="mini-bar-track">
            <span style={{ width: `${clampPercent((row.value / max) * 100)}%` }} />
          </div>
        </article>
      ))}
    </div>
  );
}

function InsightTimeline({ rows, emptyText }: { rows: RightInsightTimelineRow[]; emptyText: string }) {
  return (
    <div className="due-timeline">
      {rows.length > 0 ? rows.map((row) => (
        <article key={`${row.marker}-${row.title}`}>
          <span>{row.marker}</span>
          <div>
            <strong>{row.title}</strong>
            <p>{row.detail}</p>
          </div>
          <Badge className="due-timeline-status" tone={row.tone}>{toneLabel(row.tone)}</Badge>
        </article>
      )) : (
        <p className="empty-cell">{emptyText}</p>
      )}
    </div>
  );
}

function InsightWeekdayChart({ rows }: { rows: RightInsightChartRow[] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="weekday-mini-chart" aria-label="요일별 거래 빈도">
      {rows.map((row) => (
        <span key={row.label}>
          <i style={{ height: `${Math.max(8, (row.value / max) * 100)}%` }} />
          <em className="weekday-mini-value">{row.value}</em>
          <b>{row.label}</b>
        </span>
      ))}
    </div>
  );
}

function renderVisual(visual: RightInsightVisual) {
  switch (visual.type) {
    case "bullet":
      return <InsightBulletChart visual={visual} />;
    case "progress":
      return <InsightProgressBar visual={visual} />;
    case "bars":
      return <InsightMiniBars rows={visual.rows} />;
    case "sparkline":
      return <InsightSparkline rows={visual.rows} />;
    case "timeline":
      return <InsightTimeline rows={visual.rows} emptyText={visual.emptyText} />;
    case "weekday":
      return <InsightWeekdayChart rows={visual.rows} />;
    case "note":
      return <p className="side-note">{visual.text}</p>;
  }
}

function RightInsightCard({ panel }: { panel: RightInsightPanelCard }) {
  return (
    <Card className="side-panel-card">
      <CardHeader className="side-panel-card-header">
        <CardDescription className="side-panel-eyebrow">{panel.eyebrow}</CardDescription>
        <CardTitle className="side-panel-title">{panel.title}</CardTitle>
      </CardHeader>
      <CardContent className="side-panel-content">
        <div className="side-panel-stack">
          {panel.visuals.length > 0 ? panel.visuals.map((visual, index) => (
            <div key={`${visual.type}-${index}`}>
              {renderVisual(visual)}
            </div>
          )) : (
            <p className="side-note">이 카드에 표시할 세부 내용이 없습니다.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function RightInsightPanel({ model }: RightInsightPanelProps) {
  if (model.rightInsightPanels.length === 0) {
    return (
      <Card className="side-panel-card">
        <CardHeader className="side-panel-card-header">
          <CardDescription className="side-panel-eyebrow">Signals</CardDescription>
          <CardTitle className="side-panel-title">운영 인사이트</CardTitle>
        </CardHeader>
        <CardContent className="side-panel-content">
          <p className="side-note">표시할 운영 인사이트가 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {model.rightInsightPanels.map((panel) => (
        <RightInsightCard key={panel.title} panel={panel} />
      ))}
    </>
  );
}
