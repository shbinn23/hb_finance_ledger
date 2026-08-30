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

test("schema capability fails closed until migration 008 columns exist", () => {
  assert.match(source, /actionExecutionSupported/);
  assert.match(source, /column_name in \('mapping_type', 'source_key'\)/);
});
