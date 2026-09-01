import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationRoot = resolve(import.meta.dirname, "../../../../migrations");
const ledgerOperations = readFileSync(
  resolve(migrationRoot, "004_create_ledger_write_operations.sql"),
  "utf8",
);
const importTables = readFileSync(
  resolve(migrationRoot, "005_create_pyeonhan_import_tables.sql"),
  "utf8",
);
const importBenefitReview = readFileSync(
  resolve(migrationRoot, "007_add_import_benefit_review.sql"),
  "utf8",
);
const importActionOperations = readFileSync(
  resolve(migrationRoot, "008_expand_import_action_operations.sql"),
  "utf8",
);
const importAccountCreateOperations = readFileSync(
  resolve(migrationRoot, "009_add_import_account_create_operations.sql"),
  "utf8",
);
const importDeleteOperations = readFileSync(
  resolve(migrationRoot, "010_add_import_delete_operations.sql"),
  "utf8",
);
const importBenefitSelection = readFileSync(
  resolve(migrationRoot, "011_expand_import_benefit_selection.sql"),
  "utf8",
);
const importRepository = readFileSync(
  resolve(import.meta.dirname, "import-repository.ts"),
  "utf8",
);

test("ledger operation migration is transaction protected", () => {
  assert.match(ledgerOperations, /^begin;/i);
  assert.match(ledgerOperations, /commit;\s*$/i);
});

test("import migration enforces batch identity and amount invariants", () => {
  assert.match(importTables, /source_file_hash text/);
  assert.match(importTables, /gmail_message_id is null and gmail_attachment_id is null/);
  assert.match(importTables, /status in \([^)]*'partial'/s);
  assert.match(importTables, /write_failed_count integer not null default 0/);
  assert.match(importTables, /posting_amount > 0/);
  assert.match(importTables, /approval_amount > 0/);
  assert.match(importTables, /approval_amount >= posting_amount/);
  assert.match(importTables, /discount_amount = approval_amount - posting_amount/);
  assert.match(importTables, /source_identity_key ~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(importTables, /source_content_hash ~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(importTables, /unique \(batch_id, source_identity_key, occurrence_index\)/);
});

test("import write operations derive their batch through the row foreign key", () => {
  const table = importTables.match(
    /create table if not exists app\.import_write_operations \(([\s\S]*?)\n\);/,
  )?.[1] ?? "";

  assert.doesNotMatch(table, /batch_id/);
  assert.match(table, /row_id bigint not null references app\.import_rows\(id\)/);
  assert.match(table, /unique \(row_id, operation_type\)/);
});

test("import mappings constrain account types by mapping responsibility", () => {
  assert.match(importTables, /mapping_type = 'asset'[\s\S]*whooing_account_type in \('assets', 'liabilities'\)/);
  assert.match(importTables, /mapping_type = 'expense_category'[\s\S]*whooing_account_type = 'expenses'/);
  assert.match(importTables, /mapping_type = 'income_category'[\s\S]*whooing_account_type = 'income'/);
});

test("prior import reconciliation only trusts rows backed by ledger evidence", () => {
  assert.match(importRepository, /status in \('created', 'updated', 'duplicate'\)/);
  assert.match(importRepository, /row_id = excluded\.row_id/);
});

test("import batch persistence is atomic and serializes source-file deduplication", () => {
  assert.match(importRepository, /withTransaction/);
  assert.match(importRepository, /pg_advisory_xact_lock/);
  assert.match(importRepository, /source_file_hash = \$1/);
  assert.match(importRepository, /b\.status in \('review', 'pending', 'applying', 'completed', 'partial'\)/);
});

test("benefit review migration is additive, transactional, and links import rows to events", () => {
  assert.match(importBenefitReview, /^begin;/i);
  assert.match(importBenefitReview, /add column if not exists benefit_status text/);
  assert.match(importBenefitReview, /benefit_status in \([\s\S]*'rule_matched'[\s\S]*'event_exists'[\s\S]*'created'/);
  assert.match(importBenefitReview, /add column if not exists benefit_rule_id text/);
  assert.match(importBenefitReview, /add column if not exists benefit_confidence numeric\(4,3\)/);
  assert.match(importBenefitReview, /add column if not exists benefit_event_id uuid/);
  assert.match(importBenefitReview, /references app\.card_benefit_events\(event_id\)/);
  assert.match(importBenefitReview, /commit;\s*$/i);
});

test("import action migration expands operation types without applying destructive table changes", () => {
  assert.match(importActionOperations, /^begin;/i);
  assert.match(importActionOperations, /operation_type in \([^)]+'update'[^)]+'benefit'[^)]+'mapping'/s);
  assert.match(importActionOperations, /add column if not exists mapping_type text/);
  assert.match(importActionOperations, /add column if not exists source_key text/);
  assert.match(importActionOperations, /operation_type = 'mapping'[\s\S]*row_id is null/);
  assert.match(importActionOperations, /operation_type <> 'mapping'[\s\S]*row_id is not null/);
  assert.match(importActionOperations, /status in \([^)]+'updated'[^)]+'skipped'[^)]+'reviewed'/s);
  assert.match(importActionOperations, /where operation_type in \('create', 'benefit'\)/);
  assert.doesNotMatch(importActionOperations, /drop table/i);
  assert.match(importActionOperations, /commit;\s*$/i);
});

test("account creation migration is transactional and resumable", () => {
  assert.match(importAccountCreateOperations, /^begin;/i);
  assert.match(importAccountCreateOperations, /whooing_account_id text/);
  assert.match(importAccountCreateOperations, /'account_create'/);
  assert.match(importAccountCreateOperations, /operation_type in \('mapping', 'account_create'\)/);
  assert.doesNotMatch(importAccountCreateOperations, /drop table/i);
  assert.match(importAccountCreateOperations, /commit;\s*$/i);
});

test("manual delete migration is additive, transactional, and records terminal deletion", () => {
  assert.match(importDeleteOperations, /^begin;/i);
  assert.match(importDeleteOperations, /add column if not exists review_mirror_entry_id bigint/);
  assert.match(importDeleteOperations, /import_rows_review_mirror_snapshot_check/);
  assert.match(importDeleteOperations, /'delete'/);
  assert.match(importDeleteOperations, /'deleted'/);
  assert.match(importDeleteOperations, /where operation_type in \('create', 'benefit', 'delete'\)/);
  assert.doesNotMatch(importDeleteOperations, /drop table/i);
  assert.match(importDeleteOperations, /commit;\s*$/i);
});

test("benefit selection migration preserves legacy states and adds explicit review states", () => {
  assert.match(importBenefitSelection, /^begin;/i);
  assert.match(importBenefitSelection, /drop constraint if exists import_rows_benefit_status_check/);
  assert.match(importBenefitSelection, /'rule_uncertain'/);
  assert.match(importBenefitSelection, /'needs_review'/);
  assert.match(importBenefitSelection, /'rule_selection_required'/);
  assert.match(importBenefitSelection, /'rule_unknown'/);
  assert.doesNotMatch(importBenefitSelection, /drop table/i);
  assert.match(importBenefitSelection, /commit;\s*$/i);
});
