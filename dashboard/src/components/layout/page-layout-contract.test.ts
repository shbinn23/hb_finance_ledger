import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const srcRoot = resolve(import.meta.dirname, "../..");

test("shared shell defines a stable page layout contract", () => {
  const shellSource = readFileSync(resolve(import.meta.dirname, "shell.tsx"), "utf8");
  const cssSource = readFileSync(resolve(srcRoot, "app/globals.css"), "utf8");

  assert.match(shellSource, /className="page-stack"/);
  assert.match(cssSource, /Layout contract/);
  assert.match(cssSource, /--page-max-width/);
  assert.match(cssSource, /--page-padding-x/);
  assert.match(cssSource, /--page-section-gap/);
  assert.match(cssSource, /--page-rail-width/);
  assert.match(cssSource, /\.page-stack/);
  assert.match(cssSource, /\.page-stack > \.section-hero/);
  assert.match(cssSource, /minmax\(var\(--page-rail-width\), 0\.34fr\)/);
});

test("priority pages do not repeat metrics in oversized command-center wrappers", () => {
  const overviewSource = readFileSync(resolve(srcRoot, "app/overview/page.tsx"), "utf8");
  const cardsSource = readFileSync(resolve(srcRoot, "features/cards/components/cards-page.tsx"), "utf8");
  const mlSource = readFileSync(resolve(srcRoot, "features/ml/components/ml-page.tsx"), "utf8");
  const cssSource = readFileSync(resolve(srcRoot, "app/globals.css"), "utf8");

  assert.doesNotMatch(overviewSource, /overview-command-center/);
  assert.doesNotMatch(overviewSource, /command-metric-strip/);
  assert.doesNotMatch(cardsSource, /cards-command-center/);
  assert.doesNotMatch(cardsSource, /cards-command-links/);
  assert.doesNotMatch(mlSource, /ml-command-center/);
  assert.doesNotMatch(mlSource, /command-metric-strip/);
  assert.doesNotMatch(cssSource, /\.overview-command-center/);
  assert.doesNotMatch(cssSource, /\.cards-command-center/);
  assert.doesNotMatch(cssSource, /\.ml-command-center/);
  assert.doesNotMatch(cssSource, /compact insight strip/);
  assert.match(cssSource, /\.side-panel-card::before/);
});
