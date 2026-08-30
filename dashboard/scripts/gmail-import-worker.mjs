const baseUrl = (process.env.DASHBOARD_INTERNAL_URL ?? "http://dashboard:3000").replace(/\/$/, "");
const configuredInterval = Number(process.env.GMAIL_IMPORT_POLL_INTERVAL_MS);
const intervalMs = Number.isFinite(configuredInterval) && configuredInterval >= 60_000
  ? configuredInterval
  : 300_000;

async function poll() {
  try {
    const response = await fetch(`${baseUrl}/api/imports/gmail/poll`, { method: "POST" });
    const body = await response.json();
    console.log(JSON.stringify({
      event: "gmail_import_poll",
      ok: response.ok && body.ok === true,
      status: response.status,
      checkedMessages: Number(body.checkedMessages ?? 0),
      foundAttachments: Number(body.foundAttachments ?? 0),
      executedCount: Number(body.executedCount ?? 0),
      failedCount: Number(body.failedCount ?? 0),
    }));
  } catch (error) {
    console.error(JSON.stringify({
      event: "gmail_import_poll",
      ok: false,
      error: error instanceof Error ? error.name : "unknown",
    }));
  }
}

await new Promise((resolve) => setTimeout(resolve, 10_000));
await poll();
setInterval(poll, intervalMs);
