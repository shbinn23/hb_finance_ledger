import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(import.meta.dirname, "import-repository.ts"), "utf8");

test("action repository loads financial evidence and mappings on the server", () => {
  assert.match(source, /export async function getImportActionRows/);
  assert.match(source, /from app\.import_rows r/);
  assert.match(source, /source_asset_name/);
  assert.match(source, /source_category_name/);
  assert.match(source, /counterparty_asset_name/);
  assert.match(source, /left join app\.import_mappings source_mapping/);
  assert.match(source, /left join app\.import_mappings category_mapping/);
});

test("action repository reserves and finishes operations idempotently", () => {
  assert.match(source, /export async function getImportActionOperation/);
  assert.match(source, /export async function reserveImportActionOperation/);
  assert.match(source, /on conflict do nothing/);
  assert.match(source, /status = 'pending', error_message = null/);
  assert.match(source, /status = 'failed'/);
  assert.match(source, /export async function finishImportActionOperation/);
  assert.match(source, /export async function markImportRowsReviewed/);
  assert.match(source, /export async function listImportActionHistory/);
});

test("only stale update delete and benefit operations can be recovered from pending", () => {
  assert.match(source, /operation_type in \('update', 'delete', 'benefit'\)/);
  assert.match(source, /updated_at < now\(\) - interval '15 minutes'/);
});

test("schema capability fails closed until migration 008 columns exist", () => {
  assert.match(source, /actionExecutionSupported/);
  assert.match(source, /column_name in \('mapping_type', 'source_key'\)/);
});

test("reused import batches refresh only non-terminal reconciliation state", () => {
  assert.match(source, /export async function refreshImportReviewBatch/);
  assert.match(source, /status not in \('created', 'updated', 'deleted', 'skipped', 'reviewed', 'write_failed'\)/);
  assert.match(source, /source_identity_key = \$2/);
  assert.match(source, /occurrence_index = \$3/);
  assert.match(source, /review_count = \$2, duplicate_count = \$3/);
});

test("delete candidates are persisted and linked to their mirror evidence", () => {
  assert.match(source, /const persistedRows = \[\.\.\.input\.rows, \.\.\.input\.possibleDeletes\]/);
  assert.match(source, /maximumSourceRowIndex \+ deletePosition \+ 1/);
  assert.match(source, /for \(const \[index, row\] of input\.possibleDeletes\.entries\(\)\)/);
  assert.match(source, /persistReviewMirrorSnapshot/);
  assert.match(source, /review_mirror_entry_id/);
  assert.match(source, /hasCardBenefitEventForWhooingEntry/);
});

test("previous snapshot evidence requires a linked Whooing entry", () => {
  assert.match(source, /coalesce\(r\.created_whooing_entry_id, r\.matched_whooing_entry_id\) is not null/);
});

test("previous snapshot keeps only the latest interpretation of each Whooing entry", () => {
  assert.match(
    source,
    /distinct on \(coalesce\(r\.created_whooing_entry_id, r\.matched_whooing_entry_id\)\)/,
  );
  assert.match(source, /join app\.import_batches b on b\.id = r\.batch_id/);
  assert.match(
    source,
    /order by coalesce\(r\.created_whooing_entry_id, r\.matched_whooing_entry_id\),[\s\S]*b\.created_at desc/,
  );
});
