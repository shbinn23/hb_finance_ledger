import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const app = resolve(import.meta.dirname, "../../app/api/imports");

test("live import create and update routes are protected by dry-run policy", () => {
  const apply = readFileSync(resolve(app, "pyeonhan/apply/route.ts"), "utf8");
  const update = readFileSync(resolve(app, "updates/approve/route.ts"), "utf8");
  assert.match(apply, /importWritesAreDryRunOnly/);
  assert.match(update, /importWritesAreDryRunOnly/);
  assert.doesNotMatch(update, /updateWhooing|createWhooingEntry/);
});

test("account creation route only returns a preview and never calls Whooing write", () => {
  const preview = readFileSync(resolve(app, "account-create-preview/route.ts"), "utf8");
  assert.match(preview, /liveCreationAllowed: false/);
  assert.doesNotMatch(preview, /createWhooing|updateWhooing|fetch\(/);
});
