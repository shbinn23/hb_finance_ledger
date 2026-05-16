import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("section pages use page-specific side insight panels", () => {
  const pageSource = readFileSync(resolve(__dirname, "components/section-page.tsx"), "utf8");
  const panelSource = readFileSync(resolve(__dirname, "components/section-side-panel.tsx"), "utf8");
  const serviceSource = readFileSync(resolve(__dirname, "service.ts"), "utf8");
  const typeSource = readFileSync(resolve(__dirname, "types.ts"), "utf8");

  assert.match(pageSource, /<RightInsightPanel model=\{model\} \/>/);
  assert.doesNotMatch(pageSource, /<InsightPanel model=\{model\} \/>/);

  for (const key of ["ledger", "trend", "budget", "assets", "analysis", "habits"]) {
    assert.match(serviceSource, new RegExp(`${key}: `));
  }

  assert.match(typeSource, /rightInsightPanels: RightInsightPanelCard\[\]/);
  assert.match(serviceSource, /buildRightInsightPanels/);
  assert.match(panelSource, /model\.rightInsightPanels\.map/);
  assert.doesNotMatch(panelSource, /switch \\(model\\.key\\)/);
  assert.doesNotMatch(panelSource, /case "ledger"/);
  assert.match(panelSource, /mini-bullet/);
  assert.match(panelSource, /mini-sparkline/);
  assert.match(panelSource, /mini-bar-list/);
  assert.match(panelSource, /mini-progress/);
  assert.match(panelSource, /due-timeline/);
  assert.match(panelSource, /weekday-mini-chart/);
  assert.match(panelSource, /side-panel-card/);
  assert.match(panelSource, /side-visual-metric/);
  assert.match(panelSource, /mini-bullet-marker-labels/);
  assert.match(panelSource, /mini-progress-caption/);
  assert.match(panelSource, /weekday-mini-value/);
  assert.match(panelSource, /due-timeline-status/);
});
