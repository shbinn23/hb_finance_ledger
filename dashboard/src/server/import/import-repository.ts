import { query } from "../../lib/db/postgres.ts";
import { getLedgerEntryAccounts } from "../whooing/account-repository.ts";
import type {
  ImportMapping,
  MirrorEntry,
  PreviousImportRow,
  ReconciledImportRow,
} from "./pyeonhan-reconciliation.ts";
import type {
  ImportBatchStatus,
  PersistedImportBatchStatus,
} from "./pyeonhan-types.ts";

const sectionId = process.env.WHOOING_SECTION_ID ?? "s152045";

export interface ImportSchemaStatus {
  importTablesAvailable: boolean;
  ledgerOperationsAvailable: boolean;
  autoApplySupported: boolean;
}

function compactDate(value: string) {
  return Number(value.replaceAll("-", ""));
}

export async function getImportSchemaStatus(): Promise<ImportSchemaStatus> {
  const result = await query<{
    import_tables: boolean;
    ledger_operations: boolean;
  }>(
    `
    select
      to_regclass('app.import_batches') is not null
        and to_regclass('app.import_rows') is not null
        and to_regclass('app.import_write_operations') is not null as import_tables,
      to_regclass('app.ledger_write_operations') is not null as ledger_operations
    `,
  );
  const importTablesAvailable = result.rows[0]?.import_tables ?? false;
  const ledgerOperationsAvailable = result.rows[0]?.ledger_operations ?? false;
  return {
    importTablesAvailable,
    ledgerOperationsAvailable,
    autoApplySupported: importTablesAvailable && ledgerOperationsAvailable,
  };
}

export async function getImportMappings(): Promise<ImportMapping[]> {
  const accounts = await getLedgerEntryAccounts();
  const inferred: ImportMapping[] = [
    ...accounts.paymentAccounts.map((account) => ({
      mappingType: "asset" as const,
      sourceKey: account.title,
      accountType: account.accountType,
      accountId: account.accountId,
      confidence: 1,
    })),
    ...accounts.expenseCategories.map((account) => ({
      mappingType: "expense_category" as const,
      sourceKey: account.title,
      accountType: account.accountType,
      accountId: account.accountId,
      confidence: 1,
    })),
    ...accounts.incomeCategories.map((account) => ({
      mappingType: "income_category" as const,
      sourceKey: account.title,
      accountType: account.accountType,
      accountId: account.accountId,
      confidence: 1,
    })),
  ];
  const schema = await getImportSchemaStatus();
  if (!schema.importTablesAvailable) return inferred;

  const configured = await query<{
    mapping_type: ImportMapping["mappingType"];
    source_key: string;
    whooing_account_type: string;
    whooing_account_id: string;
    confidence: string;
  }>(
    `
    select mapping_type, source_key, whooing_account_type, whooing_account_id, confidence
    from app.import_mappings
    where source = 'pyeonhan_excel' and is_active
    `,
  );
  const configuredKeys = new Set(configured.rows.map((row) => `${row.mapping_type}:${row.source_key}`));
  return [
    ...configured.rows.map((row) => ({
      mappingType: row.mapping_type,
      sourceKey: row.source_key,
      accountType: row.whooing_account_type,
      accountId: row.whooing_account_id,
      confidence: Number(row.confidence),
    })),
    ...inferred.filter((mapping) => !configuredKeys.has(`${mapping.mappingType}:${mapping.sourceKey}`)),
  ];
}

export async function getMirrorEntriesForRange(startDate: string, endDate: string): Promise<MirrorEntry[]> {
  const result = await query<{
    entry_id: number;
    entry_date: string;
    l_account: string;
    l_account_id: string;
    r_account: string;
    r_account_id: string;
    item: string;
    memo: string | null;
    money: string;
  }>(
    `
    select entry_id, entry_date::text, l_account, l_account_id, r_account, r_account_id,
           item, memo, money::text
    from whooing.entries
    where section_id = $1
      and entry_date >= $2
      and entry_date < $3
    order by entry_date, entry_id
    `,
    [sectionId, compactDate(startDate), compactDate(endDate) + 1],
  );
  return result.rows.map((row) => ({
    entryId: Number(row.entry_id),
    occurredDate: String(Math.floor(Number(row.entry_date))).padStart(8, "0").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"),
    leftAccountType: row.l_account,
    leftAccountId: row.l_account_id,
    rightAccountType: row.r_account,
    rightAccountId: row.r_account_id,
    item: row.item,
    memo: row.memo ?? "",
    amount: Number(row.money),
  }));
}

export async function getPreviousImportRowsForRange(
  startDate: string,
  endDate: string,
): Promise<PreviousImportRow[]> {
  if (!(await getImportSchemaStatus()).importTablesAvailable) return [];
  const result = await query<{
    source_identity_key: string;
    source_content_hash: string;
    status: string;
    matched_whooing_entry_id: number | null;
    created_whooing_entry_id: number | null;
    occurred_date: string;
    entry_type: string;
    source_asset_name: string;
  }>(
    `
    select distinct on (source_identity_key)
      source_identity_key, source_content_hash, status,
      matched_whooing_entry_id, created_whooing_entry_id,
      occurred_date::text, entry_type, source_asset_name
    from app.import_rows
    where occurred_date between $1::date and $2::date
      and status in ('created', 'duplicate')
    order by source_identity_key, created_at desc
    `,
    [startDate, endDate],
  );
  return result.rows.map((row) => ({
    sourceIdentityKey: row.source_identity_key,
    sourceContentHash: row.source_content_hash,
    status: row.status,
    matchedWhooingEntryId: row.created_whooing_entry_id ?? row.matched_whooing_entry_id,
    occurredDate: row.occurred_date,
    entryType: row.entry_type,
    sourceAssetName: row.source_asset_name,
  }));
}

export async function getLatestImportBatchForSourceFile(sourceFileHash: string) {
  if (!(await getImportSchemaStatus()).importTablesAvailable) return null;
  const result = await query<{ id: string; status: PersistedImportBatchStatus }>(
    `
    select id::text, status
    from app.import_batches
    where source = 'pyeonhan_excel' and source_file_hash = $1
    order by created_at desc
    limit 1
    `,
    [sourceFileHash],
  );
  const row = result.rows[0];
  return row ? { batchId: Number(row.id), status: row.status } : null;
}

export async function createImportBatch(input: {
  filename: string;
  sourceFileHash: string;
  startDate: string;
  endDate: string;
  rows: ReconciledImportRow[];
  possibleDeletes: ReconciledImportRow[];
}) {
  const schema = await getImportSchemaStatus();
  if (!schema.autoApplySupported) throw new Error("import_schema_unavailable");
  const reviewCount = input.rows.filter((row) => !["auto_creatable", "duplicate"].includes(row.status)).length
    + input.possibleDeletes.length;
  const batch = await query<{ id: string }>(
    `
    insert into app.import_batches (
      source, filename, source_file_hash, export_started_at, export_ended_at, status,
      total_count, review_count, duplicate_count
    ) values ('pyeonhan_excel', $1, $2, $3::date, $4::date, 'applying', $5, $6, $7)
    returning id::text
    `,
    [
      input.filename,
      input.sourceFileHash,
      input.startDate,
      input.endDate,
      input.rows.length,
      reviewCount,
      input.rows.filter((row) => row.status === "duplicate").length,
    ],
  );
  const batchId = Number(batch.rows[0].id);
  const rowIds = new Map<string, number>();
  for (const row of input.rows) {
    const transaction = row.transaction;
    const inserted = await query<{ id: string }>(
      `
      insert into app.import_rows (
        batch_id, row_index, occurrence_index, source_identity_key, source_content_hash,
        occurred_date, entry_type, source_asset_name, counterparty_asset_name,
        source_category_name, source_subcategory_name, item, memo, posting_amount,
        approval_amount, discount_amount, currency, status, review_reason,
        matched_whooing_entry_id
      ) values (
        $1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20
      ) returning id::text
      `,
      [
        batchId, transaction.sourceRowIndexes[0] ?? 1, transaction.occurrenceIndex,
        transaction.sourceIdentityKey, transaction.sourceContentHash, transaction.occurredDate,
        transaction.entryType, transaction.sourceAssetName, transaction.counterpartyAssetName,
        transaction.sourceCategoryName, transaction.sourceSubcategoryName, transaction.item,
        transaction.memo, transaction.postingAmount, transaction.approvalAmount,
        transaction.discountAmount, transaction.currency, row.status, row.reason,
        row.matchedWhooingEntryId,
      ],
    );
    rowIds.set(transaction.sourceIdentityKey, Number(inserted.rows[0].id));
  }
  return { batchId, rowIds, reviewCount };
}

export async function finishImportRow(input: {
  rowId: number;
  operationKey: string;
  status: "created" | "failed";
  whooingEntryId: number | null;
  errorMessage?: string;
}) {
  await query(
    `
    insert into app.import_write_operations (
      row_id, operation_type, operation_key, status, whooing_entry_id, error_message
    ) values ($1, 'create', $2, $3, $4, $5)
    on conflict (operation_key) do update set
      row_id = excluded.row_id,
      status = excluded.status,
      whooing_entry_id = excluded.whooing_entry_id,
      error_message = excluded.error_message,
      updated_at = now()
    `,
    [input.rowId, input.operationKey, input.status, input.whooingEntryId, input.errorMessage ?? null],
  );
  await query(
    `
    update app.import_rows
    set status = $2, created_whooing_entry_id = $3,
        review_reason = case when $4::text is null then review_reason else $4 end,
        updated_at = now()
    where id = $1
    `,
    [input.rowId, input.status === "created" ? "created" : "write_failed", input.whooingEntryId, input.errorMessage ?? null],
  );
}

export async function finishImportBatch(input: {
  batchId: number;
  status: ImportBatchStatus;
  autoCreatedCount: number;
  writeFailedCount: number;
}) {
  await query(
    `
    update app.import_batches
    set status = $2, auto_created_count = $3, write_failed_count = $4,
        processed_at = now(), updated_at = now()
    where id = $1
    `,
    [input.batchId, input.status, input.autoCreatedCount, input.writeFailedCount],
  );
}
