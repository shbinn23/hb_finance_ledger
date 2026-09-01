import { query, withTransaction, type DatabaseQuery } from "../../lib/db/postgres.ts";
import { getLedgerEntryAccounts } from "../whooing/account-repository.ts";
import type {
  ImportBenefitStatus,
  ImportMapping,
  MirrorEntry,
  PreviousImportRow,
  ReconciledImportRow,
} from "./pyeonhan-reconciliation.ts";
import type { BenefitApprovalCandidate } from "./pyeonhan-benefit-approval.ts";
import type { ImportActionOperation, ImportActionRow } from "./import-action-service.ts";
import { buildImportAccountCandidate, type ImportMappingType } from "./import-automation-policy.ts";
import type {
  ImportBatchStatus,
  PersistedImportBatchStatus,
} from "./pyeonhan-types.ts";
import type { BenefitReplayEvent } from "./pyeonhan-benefit-reconstruction.ts";

const sectionId = process.env.WHOOING_SECTION_ID ?? "s152045";

export interface ImportSchemaStatus {
  importTablesAvailable: boolean;
  ledgerOperationsAvailable: boolean;
  benefitReviewSupported: boolean;
  autoApplySupported: boolean;
  actionExecutionSupported: boolean;
  deleteExecutionSupported: boolean;
}

function compactDate(value: string) {
  return Number(value.replaceAll("-", ""));
}

export function importRowReferenceKey(sourceIdentityKey: string, occurrenceIndex: number) {
  return `${sourceIdentityKey}:${occurrenceIndex}`;
}

export async function getImportSchemaStatus(): Promise<ImportSchemaStatus> {
  const result = await query<{
    import_tables: boolean;
    ledger_operations: boolean;
    benefit_review: boolean;
    action_operations: boolean;
    delete_operations: boolean;
  }>(
    `
    select
      to_regclass('app.import_batches') is not null
        and to_regclass('app.import_rows') is not null
        and to_regclass('app.import_write_operations') is not null as import_tables,
      to_regclass('app.ledger_write_operations') is not null as ledger_operations,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'app'
          and table_name = 'import_rows'
          and column_name = 'benefit_status'
      ) and exists (
        select 1
        from pg_constraint
        where connamespace = 'app'::regnamespace
          and conname = 'import_rows_benefit_status_check'
          and pg_get_constraintdef(oid) like '%rule_selection_required%'
          and pg_get_constraintdef(oid) like '%rule_unknown%'
      ) as benefit_review,
      (
        select count(*) = 2
        from information_schema.columns
        where table_schema = 'app'
          and table_name = 'import_write_operations'
          and column_name in ('mapping_type', 'source_key')
      ) as action_operations,
      exists (
        select 1
        from pg_constraint
        where connamespace = 'app'::regnamespace
          and conname = 'import_write_operations_operation_type_check'
          and pg_get_constraintdef(oid) like '%delete%'
      ) and exists (
        select 1
        from pg_constraint
        where connamespace = 'app'::regnamespace
          and conname = 'import_rows_status_check'
          and pg_get_constraintdef(oid) like '%deleted%'
      ) and (
        select count(*) = 10
        from information_schema.columns
        where table_schema = 'app'
          and table_name = 'import_rows'
          and column_name in (
            'review_mirror_section_id', 'review_mirror_entry_id',
            'review_mirror_occurred_date', 'review_mirror_l_account',
            'review_mirror_l_account_id', 'review_mirror_r_account',
            'review_mirror_r_account_id', 'review_mirror_item',
            'review_mirror_memo', 'review_mirror_amount'
          )
      ) as delete_operations
    `,
  );
  const importTablesAvailable = result.rows[0]?.import_tables ?? false;
  const ledgerOperationsAvailable = result.rows[0]?.ledger_operations ?? false;
  const benefitReviewSupported = result.rows[0]?.benefit_review ?? false;
  const actionExecutionSupported = result.rows[0]?.action_operations ?? false;
  const deleteExecutionSupported = result.rows[0]?.delete_operations ?? false;
  return {
    importTablesAvailable,
    ledgerOperationsAvailable,
    benefitReviewSupported,
    autoApplySupported: importTablesAvailable && ledgerOperationsAvailable,
    actionExecutionSupported: importTablesAvailable && ledgerOperationsAvailable && actionExecutionSupported,
    deleteExecutionSupported: importTablesAvailable && ledgerOperationsAvailable && deleteExecutionSupported,
  };
}

export async function importAccountCreateSchemaAvailable() {
  const result = await query<{ available: boolean }>(
    `
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'app'
        and table_name = 'import_write_operations'
        and column_name = 'whooing_account_id'
    ) as available
    `,
  );
  return result.rows[0]?.available ?? false;
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
    benefit_event_id: string | null;
    benefit_approval_amount: string | null;
    benefit_performance_amount: string | null;
    benefit_posting_amount: string | null;
    benefit_discount_amount: string | null;
  }>(
    `
    select e.entry_id, e.entry_date::text, e.l_account, e.l_account_id, e.r_account, e.r_account_id,
           e.item, e.memo, e.money::text, benefit.event_id::text as benefit_event_id,
           benefit.approval_amount::text as benefit_approval_amount,
           benefit.performance_amount::text as benefit_performance_amount,
           benefit.posting_amount::text as benefit_posting_amount,
           benefit.applied_discount_amount::text as benefit_discount_amount
    from whooing.entries e
    left join lateral (
      select event_id, approval_amount, performance_amount, posting_amount, applied_discount_amount
      from app.card_benefit_events
      where whooing_entry_id = e.entry_id
        and (section_id = e.section_id or section_id is null)
      order by created_at
      limit 1
    ) benefit on true
    where e.section_id = $1
      and e.entry_date >= $2
      and e.entry_date < $3
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
    benefitEventId: row.benefit_event_id,
    benefitEventApprovalAmount: row.benefit_approval_amount === null ? null : Number(row.benefit_approval_amount),
    benefitEventPerformanceAmount: row.benefit_performance_amount === null ? null : Number(row.benefit_performance_amount),
    benefitEventPostingAmount: row.benefit_posting_amount === null ? null : Number(row.benefit_posting_amount),
    benefitEventDiscountAmount: row.benefit_discount_amount === null ? null : Number(row.benefit_discount_amount),
  }));
}

export async function getBenefitReplayEventsForRange(startDate: string, endDate: string): Promise<BenefitReplayEvent[]> {
  const monthStart = `${startDate.slice(0, 7)}-01`;
  const result = await query<{
    entry_date: string;
    rule_id: string;
    card_account_id: string;
    applied_discount_amount: string;
  }>(
    `
    select entry_date::text, rule_id, card_account_id,
           applied_discount_amount::text
    from app.card_benefit_events
    where (section_id = $1 or section_id is null)
      and entry_date >= $2
      and entry_date < $3
      and rule_id is not null
    order by entry_date, created_at, event_id
    `,
    [sectionId, compactDate(monthStart), compactDate(endDate) + 1],
  );
  return result.rows.map((row) => ({
    occurredDate: String(Math.floor(Number(row.entry_date))).padStart(8, "0")
      .replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"),
    ruleId: row.rule_id,
    cardAccountId: row.card_account_id,
    appliedDiscountAmount: Number(row.applied_discount_amount),
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
    occurrence_index: number;
    status: string;
    matched_whooing_entry_id: number | null;
    created_whooing_entry_id: number | null;
    occurred_date: string;
    entry_type: NonNullable<PreviousImportRow["entryType"]>;
    source_asset_name: string;
    counterparty_asset_name: string | null;
    source_category_name: string | null;
    source_subcategory_name: string | null;
    item: string;
    memo: string;
    posting_amount: string;
    approval_amount: string;
  }>(
    `
    select distinct on (coalesce(r.created_whooing_entry_id, r.matched_whooing_entry_id))
      r.source_identity_key, r.source_content_hash, r.occurrence_index, r.status,
      r.matched_whooing_entry_id, r.created_whooing_entry_id,
      r.occurred_date::text, r.entry_type, r.source_asset_name, r.counterparty_asset_name,
      r.source_category_name, r.source_subcategory_name, r.item, r.memo,
      r.posting_amount::text, r.approval_amount::text
    from app.import_rows r
    join app.import_batches b on b.id = r.batch_id
    where r.occurred_date between $1::date and $2::date
      and r.status in ('created', 'updated', 'duplicate')
      and coalesce(r.created_whooing_entry_id, r.matched_whooing_entry_id) is not null
    order by coalesce(r.created_whooing_entry_id, r.matched_whooing_entry_id),
             b.created_at desc, r.created_at desc, r.id desc
    `,
    [startDate, endDate],
  );
  return result.rows.map((row) => ({
    sourceIdentityKey: row.source_identity_key,
    sourceContentHash: row.source_content_hash,
    occurrenceIndex: row.occurrence_index,
    status: row.status,
    matchedWhooingEntryId: row.created_whooing_entry_id ?? row.matched_whooing_entry_id,
    occurredDate: row.occurred_date,
    entryType: row.entry_type,
    sourceAssetName: row.source_asset_name,
    counterpartyAssetName: row.counterparty_asset_name,
    sourceCategoryName: row.source_category_name,
    sourceSubcategoryName: row.source_subcategory_name,
    item: row.item,
    memo: row.memo,
    postingAmount: Number(row.posting_amount),
    approvalAmount: Number(row.approval_amount),
  }));
}

export async function saveImportMapping(input: {
  mappingType: ImportMapping["mappingType"];
  sourceKey: string;
  accountType: string;
  accountId: string;
}) {
  const accounts = await getLedgerEntryAccounts();
  const available = input.mappingType === "asset"
    ? accounts.paymentAccounts
    : input.mappingType === "expense_category"
      ? accounts.expenseCategories
      : accounts.incomeCategories;
  const target = available.find((account) => (
    account.accountId === input.accountId && account.accountType === input.accountType
  ));
  if (!target) throw new Error("invalid_mapping_target");
  await query(
    `
    insert into app.import_mappings (
      source, mapping_type, source_key, whooing_account_id, whooing_account_type,
      confidence, is_active, updated_at
    ) values ('pyeonhan_excel', $1, $2, $3, $4, 1, true, now())
    on conflict (source, mapping_type, source_key) do update set
      whooing_account_id = excluded.whooing_account_id,
      whooing_account_type = excluded.whooing_account_type,
      confidence = 1,
      is_active = true,
      updated_at = now()
    `,
    [input.mappingType, input.sourceKey, input.accountId, input.accountType],
  );
  return { ...input, accountName: target.title };
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

export async function getLatestImportBatchStatus() {
  if (!(await getImportSchemaStatus()).importTablesAvailable) return null;
  const result = await query<{ id: string; status: PersistedImportBatchStatus }>(
    `
    select id::text, status
    from app.import_batches
    order by created_at desc, id desc
    limit 1
    `,
  );
  const row = result.rows[0];
  return row ? { batchId: Number(row.id), batchStatus: row.status } : null;
}

export async function getImportBatchForGmailAttachment(messageId: string, attachmentId: string) {
  if (!(await getImportSchemaStatus()).importTablesAvailable) return null;
  const result = await query<{ id: string; status: PersistedImportBatchStatus }>(
    `
    select id::text, status
    from app.import_batches
    where gmail_message_id = $1 and gmail_attachment_id = $2
    limit 1
    `,
    [messageId, attachmentId],
  );
  const row = result.rows[0];
  return row ? { batchId: Number(row.id), status: row.status } : null;
}

export async function hasProcessedGmailAttachmentIdentity(identity: string) {
  const match = /^gmail:([^:]+):([^:]+)$/.exec(identity);
  if (!match) return false;
  return Boolean(await getImportBatchForGmailAttachment(match[1], match[2]));
}

export async function createImportBatch(input: {
  filename: string;
  sourceFileHash: string;
  startDate: string;
  endDate: string;
  rows: ReconciledImportRow[];
  possibleDeletes: ReconciledImportRow[];
  initialStatus?: "applying" | "review";
  gmailMessageId?: string;
  gmailAttachmentId?: string;
}) {
  const schema = await getImportSchemaStatus();
  const initialStatus = input.initialStatus ?? "applying";
  const schemaAvailable = initialStatus === "review"
    ? schema.importTablesAvailable && schema.benefitReviewSupported
    : schema.autoApplySupported && schema.benefitReviewSupported;
  if (!schemaAvailable) throw new Error("import_schema_unavailable");
  const persistedRows = [...input.rows, ...input.possibleDeletes];
  const maximumSourceRowIndex = Math.max(
    0,
    ...input.rows.flatMap((row) => row.transaction.sourceRowIndexes),
  );
  const reviewCount = input.rows.filter((row) => !["auto_creatable", "duplicate"].includes(row.status)).length
    + input.possibleDeletes.length;
  return withTransaction(async (transactionQuery) => {
    await transactionQuery(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      [input.sourceFileHash],
    );
    if (initialStatus === "review") {
      const existing = await getExistingRowReferences(
        transactionQuery,
        input.sourceFileHash,
        input.gmailMessageId,
        input.gmailAttachmentId,
      );
      if (existing) return { ...existing, reused: true };
    }

    const batch = await transactionQuery<{ id: string }>(
      `
      insert into app.import_batches (
        source, gmail_message_id, gmail_attachment_id, filename, source_file_hash,
        export_started_at, export_ended_at, status,
        total_count, review_count, duplicate_count
      ) values ('pyeonhan_excel', $1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10)
      returning id::text
      `,
      [
        input.gmailMessageId ?? null,
        input.gmailAttachmentId ?? null,
        input.filename,
        input.sourceFileHash,
        input.startDate,
        input.endDate,
        initialStatus,
        input.rows.length,
        reviewCount,
        input.rows.filter((row) => row.status === "duplicate").length,
      ],
    );
    const batchId = Number(batch.rows[0].id);
    const rowIds = new Map<string, number>();
    for (const [position, row] of persistedRows.entries()) {
      const transaction = row.transaction;
      const deletePosition = position - input.rows.length;
      const rowIndex = row.status === "possible_delete"
        ? maximumSourceRowIndex + deletePosition + 1
        : transaction.sourceRowIndexes[0] ?? 1;
      const inserted = await transactionQuery<{ id: string }>(
        `
        insert into app.import_rows (
          batch_id, row_index, occurrence_index, source_identity_key, source_content_hash,
          occurred_date, entry_type, source_asset_name, counterparty_asset_name,
          source_category_name, source_subcategory_name, item, memo, posting_amount,
          approval_amount, discount_amount, currency, status, review_reason,
          matched_whooing_entry_id, benefit_status, benefit_rule_id,
          benefit_confidence, benefit_reason, benefit_event_id
        ) values (
          $1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
        ) returning id::text
        `,
        [
          batchId, rowIndex, transaction.occurrenceIndex,
          transaction.sourceIdentityKey, transaction.sourceContentHash, transaction.occurredDate,
          transaction.entryType, transaction.sourceAssetName, transaction.counterpartyAssetName,
          transaction.sourceCategoryName, transaction.sourceSubcategoryName, transaction.item,
          transaction.memo, transaction.postingAmount, transaction.approvalAmount,
          transaction.discountAmount, transaction.currency, row.status, row.reason,
          row.matchedWhooingEntryId,
          row.cardBenefitStatus,
          row.cardBenefitCandidate?.ruleId ?? null,
          row.cardBenefitCandidate?.confidence ?? null,
          row.cardBenefitCandidate?.reason ?? row.benefitAmountProvenance?.reason ?? "",
          row.cardBenefitStatus === "event_exists"
            ? (await getExistingBenefitEventId(row.matchedWhooingEntryId, transactionQuery))
            : null,
        ],
      );
      rowIds.set(
        importRowReferenceKey(transaction.sourceIdentityKey, transaction.occurrenceIndex),
        Number(inserted.rows[0].id),
      );
      await persistReviewMirrorSnapshot(
        transactionQuery,
        Number(inserted.rows[0].id),
        row.matchedWhooingEntryId,
      );
    }
    return { batchId, rowIds, reviewCount, reused: false };
  });
}

async function getExistingRowReferences(
  transactionQuery: DatabaseQuery,
  sourceFileHash: string,
  gmailMessageId?: string,
  gmailAttachmentId?: string,
) {
  const result = await transactionQuery<{
    batch_id: string;
    review_count: number;
    id: string;
    source_identity_key: string;
    occurrence_index: number;
  }>(
    `
    select b.id::text as batch_id, b.review_count, r.id::text,
           r.source_identity_key, r.occurrence_index
    from app.import_batches b
    join app.import_rows r on r.batch_id = b.id
    where b.source = 'pyeonhan_excel'
      and b.status in ('review', 'pending', 'applying', 'completed', 'partial')
      and (
        b.source_file_hash = $1
        or ($2::text is not null and b.gmail_message_id = $2 and b.gmail_attachment_id = $3)
      )
    order by b.created_at desc, r.id
    `,
    [sourceFileHash, gmailMessageId ?? null, gmailAttachmentId ?? null],
  );
  if (result.rows.length === 0) return null;
  const batchId = result.rows[0].batch_id;
  const rows = result.rows.filter((row) => row.batch_id === batchId);
  return {
    batchId: Number(batchId),
    rowIds: new Map(rows.map((row) => [
      importRowReferenceKey(row.source_identity_key, row.occurrence_index),
      Number(row.id),
    ])),
    reviewCount: Number(rows[0].review_count),
  };
}

async function getExistingBenefitEventId(
  whooingEntryId: number | null,
  databaseQuery: DatabaseQuery = query,
) {
  if (!whooingEntryId) return null;
  const result = await databaseQuery<{ event_id: string }>(
    `
    select event_id::text
    from app.card_benefit_events
    where whooing_entry_id = $1
      and (section_id = $2 or section_id is null)
    order by created_at
    limit 1
    `,
    [whooingEntryId, sectionId],
  );
  return result.rows[0]?.event_id ?? null;
}

async function persistReviewMirrorSnapshot(
  databaseQuery: DatabaseQuery,
  importRowId: number | null,
  whooingEntryId: number | null,
) {
  if (!importRowId) return;
  await databaseQuery(
    `
    update app.import_rows
    set review_mirror_section_id = null, review_mirror_entry_id = null,
        review_mirror_occurred_date = null, review_mirror_l_account = null,
        review_mirror_l_account_id = null, review_mirror_r_account = null,
        review_mirror_r_account_id = null, review_mirror_item = null,
        review_mirror_memo = null, review_mirror_amount = null,
        updated_at = now()
    where id = $1
    `,
    [importRowId],
  );
  if (!whooingEntryId) return;
  await databaseQuery(
    `
    update app.import_rows r
    set review_mirror_section_id = e.section_id,
        review_mirror_entry_id = e.entry_id,
        review_mirror_occurred_date = to_date(floor(e.entry_date)::text, 'YYYYMMDD'),
        review_mirror_l_account = e.l_account,
        review_mirror_l_account_id = e.l_account_id,
        review_mirror_r_account = e.r_account,
        review_mirror_r_account_id = e.r_account_id,
        review_mirror_item = e.item,
        review_mirror_memo = coalesce(e.memo, ''),
        review_mirror_amount = e.money,
        updated_at = now()
    from whooing.entries e
    where r.id = $1 and e.section_id = $2 and e.entry_id = $3
    `,
    [importRowId, sectionId, whooingEntryId],
  );
}

export async function createImportReviewBatch(input: {
  filename: string;
  sourceFileHash: string;
  startDate: string;
  endDate: string;
  rows: ReconciledImportRow[];
  possibleDeletes: ReconciledImportRow[];
  gmailMessageId?: string;
  gmailAttachmentId?: string;
}) {
  return createImportBatch({ ...input, initialStatus: "review" });
}

export async function refreshImportReviewBatch(input: {
  batchId: number;
  sourceFileHash: string;
  rows: ReconciledImportRow[];
  possibleDeletes: ReconciledImportRow[];
}) {
  return withTransaction(async (transactionQuery) => {
    await transactionQuery(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      [input.sourceFileHash],
    );
    const batch = await transactionQuery<{ source_file_hash: string }>(
      "select source_file_hash from app.import_batches where id = $1 for update",
      [input.batchId],
    );
    if (batch.rows[0]?.source_file_hash !== input.sourceFileHash) {
      throw new Error("import_batch_source_mismatch");
    }

    const maximumRowIndexResult = await transactionQuery<{ maximum_row_index: number }>(
      "select coalesce(max(row_index), 0)::integer as maximum_row_index from app.import_rows where batch_id = $1",
      [input.batchId],
    );
    const maximumRowIndex = maximumRowIndexResult.rows[0]?.maximum_row_index ?? 0;

    for (const row of input.rows) {
      const refreshed = await transactionQuery<{ id: string }>(
        `
        update app.import_rows
        set status = $4, review_reason = $5, matched_whooing_entry_id = $6,
            benefit_status = $7, benefit_rule_id = $8, benefit_confidence = $9,
            benefit_reason = $10, benefit_event_id = $11, updated_at = now()
        where batch_id = $1
          and source_identity_key = $2
          and occurrence_index = $3
          and status not in ('created', 'updated', 'deleted', 'skipped', 'reviewed', 'write_failed')
        returning id::text
        `,
        [
          input.batchId,
          row.transaction.sourceIdentityKey,
          row.transaction.occurrenceIndex,
          row.status,
          row.reason,
          row.matchedWhooingEntryId,
          row.cardBenefitStatus,
          row.cardBenefitCandidate?.ruleId ?? null,
          row.cardBenefitCandidate?.confidence ?? null,
          row.cardBenefitCandidate?.reason ?? row.benefitAmountProvenance?.reason ?? "",
          row.cardBenefitStatus === "event_exists"
            ? await getExistingBenefitEventId(row.matchedWhooingEntryId, transactionQuery)
            : null,
        ],
      );
      if (refreshed.rows[0]) {
        await persistReviewMirrorSnapshot(
          transactionQuery,
          Number(refreshed.rows[0].id),
          row.matchedWhooingEntryId,
        );
      }
    }

    for (const [index, row] of input.possibleDeletes.entries()) {
      const transaction = row.transaction;
      const persisted = await transactionQuery<{ id: string }>(
        `
        insert into app.import_rows (
          batch_id, row_index, occurrence_index, source_identity_key, source_content_hash,
          occurred_date, entry_type, source_asset_name, counterparty_asset_name,
          source_category_name, source_subcategory_name, item, memo, posting_amount,
          approval_amount, discount_amount, currency, status, review_reason,
          matched_whooing_entry_id, benefit_status, benefit_reason
        ) values (
          $1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19, $20, $21, ''
        )
        on conflict (batch_id, source_identity_key, occurrence_index) do update
        set status = excluded.status,
            review_reason = excluded.review_reason,
            matched_whooing_entry_id = excluded.matched_whooing_entry_id,
            updated_at = now()
        where import_rows.status not in (
          'created', 'updated', 'deleted', 'skipped', 'reviewed', 'write_failed'
        )
        returning id::text
        `,
        [
          input.batchId,
          maximumRowIndex + index + 1,
          transaction.occurrenceIndex,
          transaction.sourceIdentityKey,
          transaction.sourceContentHash,
          transaction.occurredDate,
          transaction.entryType,
          transaction.sourceAssetName,
          transaction.counterpartyAssetName,
          transaction.sourceCategoryName,
          transaction.sourceSubcategoryName,
          transaction.item,
          transaction.memo,
          transaction.postingAmount,
          transaction.approvalAmount,
          transaction.discountAmount,
          transaction.currency,
          row.status,
          row.reason,
          row.matchedWhooingEntryId,
          row.cardBenefitStatus,
        ],
      );
      if (persisted.rows[0]) {
        await persistReviewMirrorSnapshot(
          transactionQuery,
          Number(persisted.rows[0].id),
          row.matchedWhooingEntryId,
        );
      }
    }

    const reviewCount = input.rows.filter((row) => !["auto_creatable", "duplicate"].includes(row.status)).length
      + input.possibleDeletes.length;
    await transactionQuery(
      `
      update app.import_batches
      set review_count = $2, duplicate_count = $3, updated_at = now()
      where id = $1
      `,
      [input.batchId, reviewCount, input.rows.filter((row) => row.status === "duplicate").length],
    );

    const references = await transactionQuery<{
      id: string;
      source_identity_key: string;
      occurrence_index: number;
    }>(
      `
      select id::text, source_identity_key, occurrence_index
      from app.import_rows
      where batch_id = $1
      order by id
      `,
      [input.batchId],
    );
    return new Map(references.rows.map((row) => [
      importRowReferenceKey(row.source_identity_key, row.occurrence_index),
      Number(row.id),
    ]));
  });
}

export async function getLatestReviewRowReferences(sourceFileHash: string) {
  if (!(await getImportSchemaStatus()).importTablesAvailable) return null;
  const result = await query<{
    batch_id: string;
    id: string;
    source_identity_key: string;
    occurrence_index: number;
  }>(
    `
    select b.id::text as batch_id, r.id::text, r.source_identity_key, r.occurrence_index
    from app.import_batches b
    join app.import_rows r on r.batch_id = b.id
    where b.source = 'pyeonhan_excel'
      and b.source_file_hash = $1
      and b.status = 'review'
      and b.id = (
        select id
        from app.import_batches
        where source = 'pyeonhan_excel' and source_file_hash = $1 and status = 'review'
        order by created_at desc
        limit 1
      )
    order by r.id
    `,
    [sourceFileHash],
  );
  if (result.rows.length === 0) return null;
  return {
    batchId: Number(result.rows[0].batch_id),
    rowIds: new Map(result.rows.map((row) => [
      importRowReferenceKey(row.source_identity_key, row.occurrence_index),
      Number(row.id),
    ])),
  };
}

export async function getImportRowReferencesForBatch(batchId: number) {
  if (!(await getImportSchemaStatus()).importTablesAvailable) return new Map<string, number>();
  const result = await query<{
    id: string;
    source_identity_key: string;
    occurrence_index: number;
  }>(
    `
    select id::text, source_identity_key, occurrence_index
    from app.import_rows
    where batch_id = $1
    order by id
    `,
    [batchId],
  );
  return new Map(result.rows.map((row) => [
    importRowReferenceKey(row.source_identity_key, row.occurrence_index),
    Number(row.id),
  ]));
}

export async function getBenefitApprovalCandidate(importRowId: number): Promise<BenefitApprovalCandidate | null> {
  const result = await query<{
    id: string;
    benefit_status: string;
    benefit_rule_id: string | null;
    source_identity_key: string;
    occurrence_index: number;
    occurred_date: string;
    item: string;
    memo: string;
    approval_amount: string;
    posting_amount: string;
    discount_amount: string;
    mapped_card_account_type: string | null;
    mapped_card_account_id: string | null;
    matched_whooing_entry_id: string | null;
    section_id: string | null;
    entry_id: string | null;
    entry_date: string | null;
    l_account: string | null;
    l_account_id: string | null;
    r_account: string | null;
    r_account_id: string | null;
    entry_item: string | null;
    entry_memo: string | null;
    money: string | null;
    rule_id: string;
    rule_card_account_type: "liabilities";
    rule_card_account_id: string;
    payment_channel: "general" | "simple_pay" | null;
    discount_rate_bps: number;
    has_monthly_cap: boolean;
    performance_amount_policy: string | null;
    existing_event_id: string | null;
    existing_event_whooing_entry_id: string | null;
    existing_event_rule_id: string | null;
    existing_event_updated_at: string | null;
    existing_event_approval_amount: string | null;
    existing_event_performance_amount: string | null;
    existing_event_eligible_discount_amount: string | null;
    existing_event_applied_discount_amount: string | null;
    existing_event_posting_amount: string | null;
  }>(
    `
    select
      r.id::text, r.benefit_status, r.benefit_rule_id, r.source_identity_key,
      r.occurrence_index, r.occurred_date::text, r.item, r.memo,
      r.approval_amount::text, r.posting_amount::text, r.discount_amount::text,
      mapping.whooing_account_type as mapped_card_account_type,
      mapping.whooing_account_id as mapped_card_account_id,
      r.matched_whooing_entry_id::text,
      e.section_id, e.entry_id::text, floor(e.entry_date)::text as entry_date,
      e.l_account, e.l_account_id, e.r_account, e.r_account_id,
      e.item as entry_item, e.memo as entry_memo, e.money::text,
      rule.rule_id, rule.card_account_type as rule_card_account_type,
      rule.card_account_id as rule_card_account_id, rule.payment_channel,
      rule.discount_rate_bps,
      jsonb_array_length(rule.monthly_cap_tiers) > 0 as has_monthly_cap,
      rule.performance_policy ->> 'performanceAmountPolicy' as performance_amount_policy,
      existing.event_id::text as existing_event_id,
      existing.whooing_entry_id::text as existing_event_whooing_entry_id,
      existing.rule_id as existing_event_rule_id,
      existing.updated_at::text as existing_event_updated_at,
      existing.approval_amount::text as existing_event_approval_amount,
      existing.performance_amount::text as existing_event_performance_amount,
      existing.eligible_discount_amount::text as existing_event_eligible_discount_amount,
      existing.applied_discount_amount::text as existing_event_applied_discount_amount,
      existing.posting_amount::text as existing_event_posting_amount
    from app.import_rows r
    left join app.import_mappings mapping
      on mapping.source = 'pyeonhan_excel'
     and mapping.mapping_type = 'asset'
     and mapping.source_key = r.source_asset_name
     and mapping.is_active
    left join whooing.entries e
      on e.section_id = $2
     and e.entry_id = r.matched_whooing_entry_id
    left join app.card_benefit_rules rule
      on rule.rule_id = r.benefit_rule_id
     and rule.status = 'active'
    left join lateral (
      select event_id, whooing_entry_id, rule_id, updated_at, approval_amount, performance_amount,
             eligible_discount_amount, applied_discount_amount, posting_amount
      from app.card_benefit_events
      where (whooing_entry_id = r.matched_whooing_entry_id and (section_id = $2 or section_id is null))
         or idempotency_key = 'pyeonhan-benefit:' || r.source_identity_key || ':' || r.occurrence_index
      order by created_at
      limit 1
    ) existing on true
    where r.id = $1
    `,
    [importRowId, sectionId],
  );
  const row = result.rows[0];
  if (!row?.rule_id) return null;
  return {
    importRowId: Number(row.id),
    benefitStatus: row.benefit_status,
    candidateRuleId: row.benefit_rule_id,
    sourceIdentityKey: row.source_identity_key,
    occurrenceIndex: row.occurrence_index,
    occurredDate: row.occurred_date,
    item: row.item,
    memo: row.memo,
    approvalAmount: Number(row.approval_amount),
    postingAmount: Number(row.posting_amount),
    discountAmount: Number(row.discount_amount),
    mappedCardAccountType: row.mapped_card_account_type,
    mappedCardAccountId: row.mapped_card_account_id,
    matchedWhooingEntryId: row.matched_whooing_entry_id === null ? null : Number(row.matched_whooing_entry_id),
    mirrorEntry: row.entry_id === null || row.section_id === null || row.entry_date === null
      ? null
      : {
        sectionId: row.section_id,
        entryId: Number(row.entry_id),
        entryDate: Number(row.entry_date),
        leftAccountType: row.l_account ?? "",
        leftAccountId: row.l_account_id ?? "",
        rightAccountType: row.r_account ?? "",
        rightAccountId: row.r_account_id ?? "",
        item: row.entry_item ?? "",
        memo: row.entry_memo ?? "",
        amount: Number(row.money),
      },
    rule: {
      ruleId: row.rule_id,
      cardAccountType: row.rule_card_account_type,
      cardAccountId: row.rule_card_account_id,
      paymentChannel: row.payment_channel,
      discountRateBps: row.discount_rate_bps,
      hasMonthlyCap: row.has_monthly_cap,
      performanceAmountPolicy: row.performance_amount_policy === "posting_amount"
        ? "posting_amount"
        : "approval_amount",
    },
    existingEventId: row.existing_event_id,
    existingEvent: row.existing_event_id === null
      || row.existing_event_whooing_entry_id === null
      || row.existing_event_rule_id === null
      || row.existing_event_updated_at === null
      ? null
      : {
        eventId: row.existing_event_id,
        whooingEntryId: Number(row.existing_event_whooing_entry_id),
        ruleId: row.existing_event_rule_id,
        updatedAt: row.existing_event_updated_at,
        approvalAmount: Number(row.existing_event_approval_amount),
        performanceAmount: Number(row.existing_event_performance_amount),
        eligibleDiscountAmount: Number(row.existing_event_eligible_discount_amount),
        appliedDiscountAmount: Number(row.existing_event_applied_discount_amount),
        postingAmount: Number(row.existing_event_posting_amount),
      },
  };
}

export async function updateImportBenefitStatus(input: {
  importRowId: number;
  status: ImportBenefitStatus;
  eventId?: string | null;
  reason: string;
}) {
  await query(
    `
    update app.import_rows
    set benefit_status = $2,
        benefit_event_id = coalesce($3::uuid, benefit_event_id),
        benefit_reason = $4,
        benefit_approved_at = case when $2 in ('approved', 'created', 'event_exists') then now() else benefit_approved_at end,
        updated_at = now()
    where id = $1
    `,
    [input.importRowId, input.status, input.eventId ?? null, input.reason],
  );
}

export async function saveImportBenefitRuleSelection(input: {
  rowId: number;
  ruleId: string;
  reason: string;
}) {
  await query(
    `
    update app.import_rows
    set status = case
          when status = 'reviewed' and matched_whooing_entry_id is null then 'auto_creatable'
          else status
        end,
        benefit_status = 'rule_matched', benefit_rule_id = $2,
        benefit_confidence = 1, benefit_reason = $3, updated_at = now()
    where id = $1
    `,
    [input.rowId, input.ruleId, input.reason],
  );
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

export async function getImportActionRows(rowIds: number[]): Promise<ImportActionRow[]> {
  if (rowIds.length === 0) return [];
  const result = await query<{
    id: string;
    status: string;
    source_identity_key: string;
    source_content_hash: string;
    occurred_date: string;
    entry_type: string;
    source_category_name: string | null;
    source_subcategory_name: string | null;
    item: string;
    memo: string;
    posting_amount: string;
    approval_amount: string;
    discount_amount: string;
    benefit_rule_id: string | null;
    source_account_type: string | null;
    source_account_id: string | null;
    category_account_id: string | null;
    counterparty_account_type: string | null;
    counterparty_account_id: string | null;
    matched_whooing_entry_id: string | null;
    mirror_section_id: string | null;
    mirror_entry_id: string | null;
    mirror_occurred_date: string | null;
    mirror_left_account_type: string | null;
    mirror_left_account_id: string | null;
    mirror_right_account_type: string | null;
    mirror_right_account_id: string | null;
    mirror_item: string | null;
    mirror_memo: string | null;
    mirror_amount: string | null;
  }>(
    `
    select r.id::text, r.status, r.source_identity_key, r.source_content_hash,
           r.occurred_date::text, r.entry_type, r.source_category_name, r.source_subcategory_name,
           r.item, r.memo, r.posting_amount::text,
           r.approval_amount::text, r.discount_amount::text, r.benefit_rule_id,
           source_mapping.whooing_account_type as source_account_type,
           source_mapping.whooing_account_id as source_account_id,
           category_mapping.whooing_account_id as category_account_id,
           counterparty_mapping.whooing_account_type as counterparty_account_type,
           counterparty_mapping.whooing_account_id as counterparty_account_id,
           r.matched_whooing_entry_id::text,
           r.review_mirror_section_id as mirror_section_id,
           r.review_mirror_entry_id::text as mirror_entry_id,
           r.review_mirror_occurred_date::text as mirror_occurred_date,
           r.review_mirror_l_account as mirror_left_account_type,
           r.review_mirror_l_account_id as mirror_left_account_id,
           r.review_mirror_r_account as mirror_right_account_type,
           r.review_mirror_r_account_id as mirror_right_account_id,
           r.review_mirror_item as mirror_item,
           r.review_mirror_memo as mirror_memo,
           r.review_mirror_amount::text as mirror_amount
    from app.import_rows r
    left join app.import_mappings source_mapping
      on source_mapping.source = 'pyeonhan_excel'
     and source_mapping.mapping_type = 'asset'
     and source_mapping.source_key = r.source_asset_name
     and source_mapping.is_active
    left join app.import_mappings category_mapping
      on category_mapping.source = 'pyeonhan_excel'
     and category_mapping.mapping_type = case when r.entry_type = 'income' then 'income_category' else 'expense_category' end
     and category_mapping.source_key = concat_ws(' / ', r.source_category_name, r.source_subcategory_name)
     and category_mapping.is_active
    left join app.import_mappings counterparty_mapping
      on counterparty_mapping.source = 'pyeonhan_excel'
     and counterparty_mapping.mapping_type = 'asset'
     and counterparty_mapping.source_key = r.counterparty_asset_name
     and counterparty_mapping.is_active
    where r.id = any($1::bigint[])
    order by r.id
    `,
    [rowIds],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    status: row.status,
    sourceIdentityKey: row.source_identity_key,
    sourceContentHash: row.source_content_hash,
    occurredDate: row.occurred_date,
    entryType: row.entry_type,
    sourceCategoryName: row.source_category_name,
    sourceSubcategoryName: row.source_subcategory_name,
    item: row.item,
    memo: row.memo,
    postingAmount: Number(row.posting_amount),
    approvalAmount: Number(row.approval_amount),
    discountAmount: Number(row.discount_amount),
    benefitRuleId: row.benefit_rule_id,
    sourceAccountType: row.source_account_type,
    sourceAccountId: row.source_account_id,
    categoryAccountId: row.category_account_id,
    counterpartyAccountType: row.counterparty_account_type,
    counterpartyAccountId: row.counterparty_account_id,
    matchedWhooingEntryId: row.matched_whooing_entry_id === null ? null : Number(row.matched_whooing_entry_id),
    mirrorEntry: row.mirror_entry_id === null || row.mirror_section_id === null || row.mirror_occurred_date === null
      ? null
      : {
        sectionId: row.mirror_section_id,
        entryId: Number(row.mirror_entry_id),
        occurredDate: row.mirror_occurred_date,
        leftAccountType: row.mirror_left_account_type ?? "",
        leftAccountId: row.mirror_left_account_id ?? "",
        rightAccountType: row.mirror_right_account_type ?? "",
        rightAccountId: row.mirror_right_account_id ?? "",
        item: row.mirror_item ?? "",
        memo: row.mirror_memo ?? "",
        amount: Number(row.mirror_amount),
      },
  }));
}

export async function getImportActionOperation(operationKey: string): Promise<ImportActionOperation | null> {
  const result = await query<{
    operation_key: string;
    status: ImportActionOperation["status"];
    whooing_entry_id: string | null;
    error_message: string | null;
    whooing_account_id: string | null;
  }>(
    `
    select operation_key, status, whooing_entry_id::text, error_message,
           case when exists (
             select 1 from information_schema.columns
             where table_schema = 'app' and table_name = 'import_write_operations'
               and column_name = 'whooing_account_id'
           ) then (to_jsonb(import_write_operations) ->> 'whooing_account_id') else null end as whooing_account_id
    from app.import_write_operations
    where operation_key = $1
    `,
    [operationKey],
  );
  const row = result.rows[0];
  return row ? {
    operationKey: row.operation_key,
    status: row.status,
    whooingEntryId: row.whooing_entry_id === null ? null : Number(row.whooing_entry_id),
    errorMessage: row.error_message,
    whooingAccountId: row.whooing_account_id,
  } : null;
}

export async function getLatestImportAccountCandidate(mappingType: ImportMappingType, sourceKey: string) {
  const result = await query<{
    count: string;
    amount_total: string;
    entry_types: string[];
    open_date: string;
  }>(
    `
    select count(*)::text as count,
           coalesce(sum(r.posting_amount), 0)::text as amount_total,
           array_agg(distinct r.entry_type order by r.entry_type) as entry_types,
           to_char(min(r.occurred_date), 'YYYYMMDD') as open_date
    from app.import_rows r
    where r.batch_id = (select max(id) from app.import_batches)
      and r.status = 'mapping_required'
      and not exists (
        select 1 from app.import_mappings m
        where m.source = 'pyeonhan_excel' and m.mapping_type = $1
          and lower(btrim(m.source_key)) = lower(btrim($2)) and m.is_active
      )
      and (
        ($1 = 'asset' and (lower(btrim(r.source_asset_name)) = lower(btrim($2))
          or lower(btrim(coalesce(r.counterparty_asset_name, ''))) = lower(btrim($2))))
        or ($1 = 'expense_category' and r.entry_type = 'expense'
          and lower(btrim(concat_ws(' / ', nullif(r.source_category_name, ''), nullif(r.source_subcategory_name, '')))) = lower(btrim($2)))
        or ($1 = 'income_category' and r.entry_type = 'income'
          and lower(btrim(concat_ws(' / ', nullif(r.source_category_name, ''), nullif(r.source_subcategory_name, '')))) = lower(btrim($2)))
      )
    `,
    [mappingType, sourceKey],
  );
  const row = result.rows[0];
  if (!row || Number(row.count) === 0 || !row.open_date) return null;
  return {
    ...buildImportAccountCandidate({
      mappingType,
      sourceKey,
      count: Number(row.count),
      amountTotal: Number(row.amount_total),
      entryTypes: row.entry_types,
    }, sectionId),
    openDate: row.open_date,
  };
}

export async function findExactWhooingAccount(accountType: string, title: string) {
  const result = await query<{ account_id: string; account_type: string }>(
    `
    select account_id, account_type
    from whooing.accounts
    where section_id = $1 and account_type = $2 and item_type = 'account'
      and lower(regexp_replace(title, '\\s+', '', 'g'))
        = lower(regexp_replace($3, '\\s+', '', 'g'))
    limit 1
    `,
    [sectionId, accountType, title],
  );
  const row = result.rows[0];
  return row ? { accountId: row.account_id, accountType: row.account_type } : null;
}

export async function reserveImportActionOperation(input: {
  rowId: number;
  operationType: "create" | "update" | "delete" | "benefit" | "skip" | "review";
  operationKey: string;
}) {
  const result = await query(
    `
    with retried as (
      update app.import_write_operations
      set status = 'pending', error_message = null, updated_at = now()
      where operation_key = $3
        and (
          status = 'failed'
          or (
            status = 'pending'
            and operation_type in ('update', 'delete', 'benefit')
            and updated_at < now() - interval '15 minutes'
          )
        )
      returning id
    ), inserted as (
      insert into app.import_write_operations (
        row_id, operation_type, operation_key, status
      )
      select $1, $2, $3, 'pending'
      where not exists (select 1 from retried)
      on conflict do nothing
      returning id
    )
    select id from retried
    union all
    select id from inserted
    `,
    [input.rowId, input.operationType, input.operationKey],
  );
  return result.rowCount === 1;
}

export async function reserveImportMappingOperation(input: {
  mappingType: ImportMapping["mappingType"];
  sourceKey: string;
  operationKey: string;
}) {
  const result = await query(
    `
    with retried as (
      update app.import_write_operations
      set status = 'pending', error_message = null, updated_at = now()
      where operation_key = $1 and status = 'failed'
      returning id
    ), inserted as (
      insert into app.import_write_operations (
        row_id, operation_type, operation_key, status, mapping_type, source_key
      )
      select null, 'mapping', $1, 'pending', $2, $3
      where not exists (select 1 from retried)
      on conflict do nothing
      returning id
    )
    select id from retried
    union all
    select id from inserted
    `,
    [input.operationKey, input.mappingType, input.sourceKey],
  );
  return result.rowCount === 1;
}

export async function reserveImportAccountCreateOperation(input: {
  mappingType: ImportMappingType;
  sourceKey: string;
  operationKey: string;
}) {
  const result = await query(
    `
    with retried as (
      update app.import_write_operations
      set status = 'pending', error_message = null, updated_at = now()
      where operation_key = $1 and status = 'failed'
      returning id
    ), inserted as (
      insert into app.import_write_operations (
        row_id, operation_type, operation_key, status, mapping_type, source_key
      )
      select null, 'account_create', $1, 'pending', $2, $3
      where not exists (select 1 from retried)
      on conflict do nothing
      returning id
    )
    select id from retried union all select id from inserted
    `,
    [input.operationKey, input.mappingType, input.sourceKey],
  );
  return result.rowCount === 1;
}

export async function finishImportAccountCreateOperation(input: {
  operationKey: string;
  status: "created" | "failed";
  whooingAccountId: string | null;
  errorMessage: string | null;
}) {
  await query(
    `
    update app.import_write_operations
    set status = $2, whooing_account_id = coalesce($3, whooing_account_id),
        error_message = $4, updated_at = now()
    where operation_key = $1
    `,
    [input.operationKey, input.status, input.whooingAccountId, input.errorMessage],
  );
}

export async function finishImportOperationRecord(input: {
  operationKey: string;
  status: "created" | "failed";
  whooingEntryId?: number | null;
  errorMessage?: string | null;
}) {
  await query(
    `
    update app.import_write_operations
    set status = $2, whooing_entry_id = $3, error_message = $4, updated_at = now()
    where operation_key = $1
    `,
    [input.operationKey, input.status, input.whooingEntryId ?? null, input.errorMessage ?? null],
  );
}

export async function finishImportActionOperation(input: {
  rowId: number;
  operationType: "create" | "update" | "delete" | "benefit";
  operationKey: string;
  status: "created" | "failed";
  whooingEntryId: number | null;
  errorMessage: string | null;
  rowStatus: "created" | "updated" | "deleted" | "write_failed";
}) {
  await withTransaction(async (transactionQuery) => {
    await transactionQuery(
      `
      update app.import_write_operations
      set status = $2, whooing_entry_id = $3, error_message = $4, updated_at = now()
      where operation_key = $1
      `,
      [input.operationKey, input.status, input.whooingEntryId, input.errorMessage],
    );
    await transactionQuery(
      `
      update app.import_rows
      set status = $2,
          created_whooing_entry_id = case when $2 = 'created' then $3 else created_whooing_entry_id end,
          matched_whooing_entry_id = case
            when $2 = 'created' then $3
            when $2 = 'updated' then $3
            when $2 = 'deleted' then null
            else matched_whooing_entry_id
          end,
          review_reason = coalesce($4, review_reason), updated_at = now()
      where id = $1
      `,
      [input.rowId, input.rowStatus, input.whooingEntryId, input.errorMessage],
    );
  });
}

export async function hasCardBenefitEventForWhooingEntry(entryId: number) {
  const result = await query<{ exists: boolean }>(
    `
    select exists (
      select 1
      from app.card_benefit_events
      where whooing_entry_id = $1
        and (section_id = $2 or section_id is null)
    ) as exists
    `,
    [entryId, sectionId],
  );
  return result.rows[0]?.exists ?? false;
}

export async function markImportRowsReviewed(input: {
  rowIds: number[];
  action: "skip" | "review";
}) {
  await query(
    `
    update app.import_rows
    set status = $2, review_reason = $3, updated_at = now()
    where id = any($1::bigint[])
      and status not in ('created', 'updated', 'deleted', 'duplicate')
    `,
    [input.rowIds, input.action === "skip" ? "skipped" : "reviewed", input.action === "skip" ? "운영자가 건너뛰었습니다." : "운영자가 검토 완료로 표시했습니다."],
  );
}

export async function listImportActionHistory(limit = 50) {
  const result = await query<{
    id: string;
    row_id: string | null;
    operation_type: string;
    status: string;
    whooing_entry_id: string | null;
    error_message: string | null;
    updated_at: Date;
  }>(
    `
    select id::text, row_id::text, operation_type, status,
           whooing_entry_id::text, error_message, updated_at
    from app.import_write_operations
    order by updated_at desc, id desc
    limit $1
    `,
    [Math.min(Math.max(limit, 1), 100)],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    rowId: row.row_id === null ? null : Number(row.row_id),
    operationType: row.operation_type,
    status: row.status,
    whooingEntryId: row.whooing_entry_id === null ? null : Number(row.whooing_entry_id),
    errorMessage: row.error_message,
    updatedAt: row.updated_at.toISOString(),
  }));
}
