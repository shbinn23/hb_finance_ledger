import type { ImportMapping } from "./pyeonhan-reconciliation.ts";

type Env = Record<string, string | undefined>;

export function importWritesAreDryRunOnly(env: Env = process.env) {
  return env.GMAIL_IMPORT_DRY_RUN_ONLY?.toLowerCase() !== "false";
}

export function importActionOriginIsAllowed(input: {
  origin: string | null;
  forwardedHost: string | null;
  host: string | null;
}) {
  if (!input.origin) return true;
  const expectedHost = input.forwardedHost ?? input.host;
  if (!expectedHost) return false;
  try {
    return new URL(input.origin).host === expectedHost;
  } catch {
    return false;
  }
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseImportMappingRequest(value: unknown): ParseResult<{
  mappingType: ImportMapping["mappingType"];
  sourceKey: string;
  accountType: string;
  accountId: string;
}> {
  if (!value || typeof value !== "object") return { ok: false, error: "invalid_request" };
  const input = value as Record<string, unknown>;
  const mappingType = input.mappingType;
  const sourceKey = typeof input.sourceKey === "string" ? input.sourceKey.trim() : "";
  const accountType = typeof input.accountType === "string" ? input.accountType.trim() : "";
  const accountId = typeof input.accountId === "string" ? input.accountId.trim() : "";
  if (input.confirmed !== true) return { ok: false, error: "mapping_confirmation_required" };
  if (!sourceKey || !accountId || !["asset", "expense_category", "income_category"].includes(String(mappingType))) {
    return { ok: false, error: "invalid_mapping" };
  }
  const validCombination = mappingType === "asset"
    ? ["assets", "liabilities"].includes(accountType)
    : mappingType === "expense_category"
      ? accountType === "expenses"
      : accountType === "income";
  if (!validCombination) return { ok: false, error: "invalid_mapping_target" };
  return {
    ok: true,
    value: {
      mappingType: mappingType as ImportMapping["mappingType"],
      sourceKey,
      accountType,
      accountId,
    },
  };
}

export function parseImportRowActionRequest(value: unknown): ParseResult<{ importRowId: number }> {
  if (!value || typeof value !== "object") return { ok: false, error: "invalid_request" };
  const importRowId = Number((value as Record<string, unknown>).importRowId);
  return Number.isSafeInteger(importRowId) && importRowId > 0
    ? { ok: true, value: { importRowId } }
    : { ok: false, error: "invalid_import_row" };
}
