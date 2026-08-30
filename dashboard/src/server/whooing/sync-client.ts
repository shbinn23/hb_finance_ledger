const DEFAULT_ETL_SERVICE_URL = "http://etl-service:8080";
const DEFAULT_ETL_SYNC_TIMEOUT_MS = 15_000;
const MIN_ETL_SYNC_TIMEOUT_MS = 5_000;

export type SyncFailureReason = "etl_unavailable" | "timeout" | "etl_error" | "unknown";

export class WhooingLocalSyncError extends Error {
  readonly reason: SyncFailureReason;

  constructor(
    reason: SyncFailureReason,
    message = "Whooing local sync failed",
  ) {
    super(message);
    this.name = "WhooingLocalSyncError";
    this.reason = reason;
  }
}

export function getSyncFailureReason(error: unknown): SyncFailureReason {
  return error instanceof WhooingLocalSyncError ? error.reason : "unknown";
}

function toWhooingDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new WhooingLocalSyncError("unknown", "Invalid sync date");
  }

  return value.replaceAll("-", "");
}

function etlServiceUrl() {
  return (process.env.ETL_SERVICE_URL ?? DEFAULT_ETL_SERVICE_URL).replace(/\/$/, "");
}

export function getEtlSyncTimeoutMs() {
  const value = Number(process.env.ETL_SYNC_TIMEOUT_MS);
  if (!Number.isFinite(value) || value < MIN_ETL_SYNC_TIMEOUT_MS) {
    return DEFAULT_ETL_SYNC_TIMEOUT_MS;
  }

  return value;
}

export async function syncWhooingEntriesForDate(occurredDate: string) {
  const syncDate = toWhooingDate(occurredDate);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getEtlSyncTimeoutMs());

  try {
    const response = await fetch(`${etlServiceUrl()}/sync/whooing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start_date: syncDate,
        end_date: syncDate,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new WhooingLocalSyncError("etl_error", `Whooing local sync failed with status ${response.status}`);
    }
  } catch (error) {
    if (error instanceof WhooingLocalSyncError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new WhooingLocalSyncError("timeout", "Whooing local sync timed out");
    }

    if (error instanceof TypeError) {
      throw new WhooingLocalSyncError("etl_unavailable", "Whooing local sync service is unavailable");
    }

    throw new WhooingLocalSyncError("unknown");
  } finally {
    clearTimeout(timeout);
  }
}

export async function syncWhooingAccounts() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getEtlSyncTimeoutMs());
  try {
    const response = await fetch(`${etlServiceUrl()}/sync/whooing-accounts`, {
      method: "POST",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new WhooingLocalSyncError("etl_error", `Whooing account sync failed with status ${response.status}`);
    }
    return await response.json() as { ok: true; fetched: number; upserted: number; skipped: number };
  } catch (error) {
    if (error instanceof WhooingLocalSyncError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new WhooingLocalSyncError("timeout", "Whooing account sync timed out");
    }
    if (error instanceof TypeError) {
      throw new WhooingLocalSyncError("etl_unavailable", "Whooing account sync service is unavailable");
    }
    throw new WhooingLocalSyncError("unknown");
  } finally {
    clearTimeout(timeout);
  }
}
