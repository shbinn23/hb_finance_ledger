import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(import.meta.dirname, "gmail-import-runtime-server.ts"), "utf8");

test("reused Gmail attachments refresh persisted reconciliation without creating a batch", () => {
  const reusedPath = source.match(/loadProcessedAttachment:[\s\S]*?importAttachment:/)?.[0] ?? "";
  assert.match(reusedPath, /refreshImportReviewBatch/);
  assert.doesNotMatch(reusedPath, /createImportReviewBatch/);
});
