import { query } from "@/lib/db/postgres";
import {
  getSystemStatus,
  probeEtlHealth,
  type MirrorActivity,
} from "./system-status";

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

export function getCurrentSystemStatus() {
  return getSystemStatus({ checkEtlHealth, getMirrorActivity });
}
