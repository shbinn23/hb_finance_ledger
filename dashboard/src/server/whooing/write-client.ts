import type { WhooingEntryPayload } from "@/server/ledger/ledger-entry-payload";

const WHOOING_API_BASE_URL = "https://whooing.com/api";

export interface WhooingApiResponse {
  code?: number;
  message?: string;
  error_parameters?: unknown;
  results?: unknown;
}

export interface WhooingEntrySnapshot {
  sectionId: string;
  entryId: number;
  occurredDate: string;
  leftAccountType: string;
  leftAccountId: string;
  rightAccountType: string;
  rightAccountId: string;
  item: string;
  memo: string;
  amount: number;
}

export type WhooingCreatableAccountType = "assets" | "liabilities" | "expenses" | "income";

export interface WhooingAccountCreatePayload {
  section_id: string;
  title: string;
  type: "account";
  open_date: string;
  close_date: string;
  memo: string;
  category: "normal";
}

export class WhooingWriteClientError extends Error {
  public readonly status?: number;

  constructor(
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "WhooingWriteClientError";
    this.status = status;
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

function genericFormBody(payload: object) {
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => params.set(key, String(value)));
  return params;
}

function safeApiError(payload: WhooingApiResponse, action: "creation" | "update" | "deletion") {
  const message = payload.message ? `: ${payload.message}` : "";
  return `Whooing API rejected entry ${action}${message}`;
}

function entryDate(value: unknown) {
  const compact = String(Math.floor(Number(value)));
  if (!/^\d{8}$/.test(compact)) throw new WhooingWriteClientError("Whooing entry response has an invalid date");
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function parseEntrySnapshot(results: unknown, sectionId: string): WhooingEntrySnapshot {
  const value = results && typeof results === "object" && "rows" in results
    ? (results as { rows?: unknown[] }).rows?.[0]
    : results;
  if (!value || typeof value !== "object") {
    throw new WhooingWriteClientError("Whooing entry response did not include an entry");
  }
  const row = value as Record<string, unknown>;
  const entryId = Number(row.entry_id);
  const amount = Number(row.money);
  const requiredStrings = [
    row.l_account, row.l_account_id,
    row.r_account, row.r_account_id, row.item,
  ];
  if (!Number.isSafeInteger(entryId) || entryId <= 0 || !Number.isFinite(amount)
    || requiredStrings.some((field) => typeof field !== "string" || !field)) {
    throw new WhooingWriteClientError("Whooing entry response is incomplete");
  }
  return {
    sectionId,
    entryId,
    occurredDate: entryDate(row.entry_date),
    leftAccountType: String(row.l_account),
    leftAccountId: String(row.l_account_id),
    rightAccountType: String(row.r_account),
    rightAccountId: String(row.r_account_id),
    item: String(row.item),
    memo: typeof row.memo === "string" ? row.memo : "",
    amount,
  };
}

export async function getWhooingEntry(entryId: number, sectionId: string): Promise<WhooingEntrySnapshot> {
  if (!Number.isSafeInteger(entryId) || entryId <= 0 || !sectionId) {
    throw new WhooingWriteClientError("Invalid Whooing entry lookup");
  }
  const url = new URL(`${WHOOING_API_BASE_URL}/entries/${entryId}.json`);
  url.searchParams.set("section_id", sectionId);
  const response = await fetch(url, {
    method: "GET",
    headers: { "X-API-KEY": whooingApiKey() },
  });
  if (!response.ok) {
    throw new WhooingWriteClientError("Whooing entry lookup request failed", response.status);
  }
  const data = await response.json() as WhooingApiResponse;
  if (data.code !== undefined && data.code !== 200) {
    throw new WhooingWriteClientError("Whooing API rejected entry lookup");
  }
  const entry = parseEntrySnapshot(data.results, sectionId);
  if (entry.entryId !== entryId) {
    throw new WhooingWriteClientError("Whooing entry lookup returned a different entry");
  }
  return entry;
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
    throw new WhooingWriteClientError(safeApiError(data, "creation"), data.code);
  }

  return data;
}

export async function updateWhooingEntry(
  entryId: number,
  payload: WhooingEntryPayload,
): Promise<WhooingApiResponse> {
  if (!Number.isSafeInteger(entryId) || entryId <= 0) {
    throw new WhooingWriteClientError("Invalid Whooing entry id");
  }
  const response = await fetch(`${WHOOING_API_BASE_URL}/entries/${entryId}.json`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-API-KEY": whooingApiKey(),
    },
    body: formBody(payload),
  });
  if (!response.ok) {
    throw new WhooingWriteClientError("Whooing entry update request failed", response.status);
  }
  const data = await response.json() as WhooingApiResponse;
  if (data.code !== undefined && data.code !== 200) {
    throw new WhooingWriteClientError(safeApiError(data, "update"));
  }
  return data;
}

export async function deleteWhooingEntry(
  entryId: number,
  sectionId: string,
): Promise<WhooingApiResponse> {
  if (!Number.isSafeInteger(entryId) || entryId <= 0 || !sectionId.trim()) {
    throw new WhooingWriteClientError("Invalid Whooing entry deletion");
  }
  const response = await fetch(
    `${WHOOING_API_BASE_URL}/entries/${entryId}/${encodeURIComponent(sectionId)}.json`,
    {
      method: "DELETE",
      headers: { "X-API-KEY": whooingApiKey() },
    },
  );
  if (!response.ok) {
    throw new WhooingWriteClientError("Whooing entry deletion request failed", response.status);
  }
  const data = await response.json() as WhooingApiResponse;
  if (data.code !== undefined && data.code !== 200) {
    throw new WhooingWriteClientError(safeApiError(data, "deletion"));
  }
  return data;
}

export async function createWhooingAccount(
  accountType: WhooingCreatableAccountType,
  payload: WhooingAccountCreatePayload,
): Promise<WhooingApiResponse> {
  const response = await fetch(`${WHOOING_API_BASE_URL}/accounts/${accountType}.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-API-KEY": whooingApiKey(),
    },
    body: genericFormBody(payload),
  });
  if (!response.ok) {
    throw new WhooingWriteClientError("Whooing account creation request failed", response.status);
  }
  const data = await response.json() as WhooingApiResponse;
  if (data.code !== undefined && data.code !== 200) {
    throw new WhooingWriteClientError("Whooing API rejected account creation");
  }
  return data;
}

export function extractWhooingAccountId(response: WhooingApiResponse) {
  const results = response.results;
  const accountId = results && typeof results === "object"
    ? (results as Record<string, unknown>).account_id
      ?? (results as Record<string, unknown>).accountId
      ?? (results as Record<string, unknown>).id
    : null;
  if (typeof accountId !== "string" || !accountId.trim()) {
    throw new WhooingWriteClientError("Whooing account creation response did not include an account id");
  }
  return accountId.trim();
}
