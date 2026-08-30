const DEFAULT_ETL_SERVICE_URL = "http://etl-service:8080";
const DEFAULT_ETL_SYNC_TIMEOUT_MS = 15_000;
const MIN_ETL_SYNC_TIMEOUT_MS = 5_000;

export class WhooingLocalSyncError extends Error {
  constructor(message = "Whooing local sync failed") {
    super(message);
    this.name = "WhooingLocalSyncError";
  }
}

function toWhooingDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new WhooingLocalSyncError("Invalid sync date");
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
      throw new WhooingLocalSyncError();
    }
  } catch (error) {
    if (error instanceof WhooingLocalSyncError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new WhooingLocalSyncError("Whooing local sync timed out");
    }

    throw new WhooingLocalSyncError();
  } finally {
    clearTimeout(timeout);
  }
}
