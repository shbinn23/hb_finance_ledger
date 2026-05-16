const DEFAULT_ETL_SERVICE_URL = "http://etl-service:8080";
const ETL_SYNC_TIMEOUT_MS = 1_800;

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

export async function syncWhooingEntriesForDate(occurredDate: string) {
  const syncDate = toWhooingDate(occurredDate);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ETL_SYNC_TIMEOUT_MS);

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

    throw new WhooingLocalSyncError();
  } finally {
    clearTimeout(timeout);
  }
}
