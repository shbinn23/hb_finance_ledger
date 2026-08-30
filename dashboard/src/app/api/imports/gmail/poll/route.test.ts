import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(import.meta.dirname, "route.ts"), "utf8");

test("Gmail poll route invokes the guarded import runtime", () => {
  assert.match(source, /runRuntimeGmailImportPoll/);
  assert.doesNotMatch(source, /createRuntimeDashboardLedgerEntry/);
  assert.doesNotMatch(source, /applyAutoCreatableRows/);
  assert.doesNotMatch(source, /createCardBenefitEvent/);
  assert.match(source, /request\.headers\.get\("origin"\)/);
  assert.match(source, /gmail_poll_failed/);
});
