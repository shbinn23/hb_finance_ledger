import { query } from "@/lib/db/postgres";
import {
  getSystemStatus,
  probeEtlHealth,
  type MirrorActivity,
  type ImportOperationsStatus,
} from "./system-status";
import { getGmailImportRuntimeStatus } from "../import/gmail-watcher";

const DEFAULT_ETL_SERVICE_URL = "http://etl-service:8080";
const ETL_HEALTH_TIMEOUT_MS = 2_000;

interface MirrorRow {
  entry_count: string;
  last_activity_at: Date | null;
}

interface TableRow {
  table_name: string | null;
}

interface PendingRow {
  pending_count: string;
}

function etlServiceUrl() {
  return (process.env.ETL_SERVICE_URL ?? DEFAULT_ETL_SERVICE_URL).replace(/\/$/, "");
}

export async function checkEtlHealth() {
  return probeEtlHealth(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ETL_HEALTH_TIMEOUT_MS);
    try {
      return await fetch(`${etlServiceUrl()}/health`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  });
}

export async function getMirrorActivity(): Promise<MirrorActivity> {
  const [mirrorResult, tableResult] = await Promise.all([
    query<MirrorRow>(`
      select count(*)::text as entry_count,
             max(synced_at) as last_activity_at
      from whooing.entries
    `),
    query<TableRow>(`
      select to_regclass('app.ledger_write_operations')::text as table_name
    `),
  ]);
  const mirror = mirrorResult.rows[0];
  const operationTableExists = Boolean(tableResult.rows[0]?.table_name);
  let pendingSyncCount: number | null = null;

  if (operationTableExists) {
    const pendingResult = await query<PendingRow>(`
      select count(*)::text as pending_count
      from app.ledger_write_operations
      where status = 'created'
        and sync_status = 'pending'
    `);
    pendingSyncCount = Number(pendingResult.rows[0]?.pending_count ?? 0);
  }

  return {
    entryCount: Number(mirror?.entry_count ?? 0),
    lastActivityAt: mirror?.last_activity_at ?? null,
    pendingSyncCount,
  };
}

export async function getImportOperationsStatus(): Promise<ImportOperationsStatus> {
  const tables = await query<{ batches: boolean; rows: boolean }>(`
    select to_regclass('app.import_batches') is not null as batches,
           to_regclass('app.import_rows') is not null as rows
  `);
  if (!tables.rows[0]?.batches || !tables.rows[0]?.rows) {
    return {
      supported: false,
      latestBatchId: null,
      latestBatchStatus: null,
      sourceFileHash: null,
      reviewRequiredCount: 0,
      benefitApprovalCandidateCount: 0,
      benefitEventExistsCount: 0,
    };
  }
  const result = await query<{
    id: string;
    status: string;
    source_file_hash: string | null;
    review_required_count: string;
    benefit_candidate_count: string;
    benefit_existing_count: string;
  }>(`
    select b.id::text, b.status, b.source_file_hash,
           count(*) filter (where r.status = 'review_required')::text as review_required_count,
           count(*) filter (where r.benefit_status = 'rule_matched')::text as benefit_candidate_count,
           count(*) filter (where r.benefit_status = 'event_exists')::text as benefit_existing_count
    from app.import_batches b
    left join app.import_rows r on r.batch_id = b.id
    where b.id = (select max(id) from app.import_batches)
    group by b.id, b.status, b.source_file_hash
  `);
  const row = result.rows[0];
  return {
    supported: true,
    latestBatchId: row ? Number(row.id) : null,
    latestBatchStatus: row?.status ?? null,
    sourceFileHash: row?.source_file_hash ?? null,
    reviewRequiredCount: Number(row?.review_required_count ?? 0),
    benefitApprovalCandidateCount: Number(row?.benefit_candidate_count ?? 0),
    benefitEventExistsCount: Number(row?.benefit_existing_count ?? 0),
  };
}

export function getCurrentSystemStatus() {
  return getSystemStatus({
    checkEtlHealth,
    getMirrorActivity,
    getImportOperationsStatus,
    getGmailImportStatus: () => {
      const status = getGmailImportRuntimeStatus();
      return {
        enabled: status.enabled,
        state: status.state,
        credentialsConfigured: status.credentialsConfigured,
        dryRunOnly: status.dryRunOnly,
        label: status.label,
      };
    },
  });
}
