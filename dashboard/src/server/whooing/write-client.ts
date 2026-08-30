import type { WhooingEntryPayload } from "@/server/ledger/ledger-entry-payload";

const WHOOING_API_BASE_URL = "https://whooing.com/api";

interface WhooingApiResponse {
  code?: number;
  message?: string;
  error_parameters?: unknown;
  results?: unknown;
}

export class WhooingWriteClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "WhooingWriteClientError";
  }
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new WhooingWriteClientError(`Missing required Whooing env var: ${name}`);
  }

  return value;
}

function randomHex(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => (byte % 16).toString(16)).join("");
}

function whooingApiKey() {
  const appId = requiredEnv("WHOOING_APP_ID");
  const token = requiredEnv("WHOOING_TOKEN");
  const signature = requiredEnv("WHOOING_SIGNATURE");
  const nounce = randomHex(32);
  const timestamp = Math.floor(Date.now() / 1000);

  return `app_id=${appId},token=${token},signature=${signature},nounce=${nounce},timestamp=${timestamp}`;
}

function formBody(payload: WhooingEntryPayload) {
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    params.set(key, String(value));
  });
  return params;
}

function safeApiError(payload: WhooingApiResponse) {
  const message = payload.message ? `: ${payload.message}` : "";
  return `Whooing API rejected entry creation${message}`;
}

export async function createWhooingEntry(payload: WhooingEntryPayload): Promise<WhooingApiResponse> {
  const response = await fetch(`${WHOOING_API_BASE_URL}/entries.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-API-KEY": whooingApiKey(),
    },
    body: formBody(payload),
  });

  if (!response.ok) {
    throw new WhooingWriteClientError("Whooing entry creation request failed", response.status);
  }

  const data = await response.json() as WhooingApiResponse;
  if (data.code !== undefined && data.code !== 200) {
    throw new WhooingWriteClientError(safeApiError(data));
  }

  return data;
}
