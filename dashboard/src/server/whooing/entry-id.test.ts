import assert from "node:assert/strict";
import test from "node:test";
import { extractWhooingEntryId } from "./entry-id.ts";

test("extractWhooingEntryId reads common Whooing POST response shapes", () => {
  assert.equal(extractWhooingEntryId({ results: { entry_id: 1352827 } }), 1352827);
  assert.equal(extractWhooingEntryId({ results: { id: "1352828" } }), 1352828);
  assert.equal(extractWhooingEntryId({ results: { rows: [{ entry_id: "1352829" }] } }), 1352829);
  assert.equal(extractWhooingEntryId({ results: [{ entry_id: 1352830 }] }), 1352830);
});

test("extractWhooingEntryId returns null for unknown response shapes", () => {
  assert.equal(extractWhooingEntryId({ code: 200, results: {} }), null);
  assert.equal(extractWhooingEntryId({ results: [{ entry_id: "not-a-number" }] }), null);
  assert.equal(extractWhooingEntryId(null), null);
});
