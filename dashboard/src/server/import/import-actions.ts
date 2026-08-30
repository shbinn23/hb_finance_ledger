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

function parseConfirmedRowIds(value: unknown): ParseResult<{ importRowIds: number[] }> {
  if (!value || typeof value !== "object") return { ok: false, error: "invalid_request" };
  const input = value as Record<string, unknown>;
  if (input.confirmed !== true) return { ok: false, error: "confirmation_required" };
  if (!Array.isArray(input.importRowIds) || input.importRowIds.length === 0) {
    return { ok: false, error: "invalid_import_rows" };
  }
  const importRowIds = [...new Set(input.importRowIds.map(Number))];
  if (importRowIds.length > 100 || importRowIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    return { ok: false, error: "invalid_import_rows" };
  }
  return { ok: true, value: { importRowIds } };
}

export function parseImportCreateRequest(value: unknown) {
  return parseConfirmedRowIds(value);
}

export function parseImportUpdateRequest(value: unknown): ParseResult<{ importRowId: number }> {
  if (!value || typeof value !== "object") return { ok: false, error: "invalid_request" };
  const input = value as Record<string, unknown>;
  if (input.confirmed !== true) return { ok: false, error: "confirmation_required" };
  const importRowId = Number(input.importRowId);
  return Number.isSafeInteger(importRowId) && importRowId > 0
    ? { ok: true, value: { importRowId } }
    : { ok: false, error: "invalid_import_row" };
}

export function parseImportBenefitRequest(value: unknown): ParseResult<{
  importRowId: number;
  ruleId: string;
}> {
  if (!value || typeof value !== "object") return { ok: false, error: "invalid_request" };
  const input = value as Record<string, unknown>;
  if (input.confirmed !== true) return { ok: false, error: "confirmation_required" };
  const importRowId = Number(input.importRowId);
  const ruleId = typeof input.ruleId === "string" ? input.ruleId.trim() : "";
  if (!Number.isSafeInteger(importRowId) || importRowId <= 0 || !ruleId) {
    return { ok: false, error: "invalid_benefit_approval" };
  }
  return { ok: true, value: { importRowId, ruleId } };
}

export function parseImportReviewRequest(value: unknown): ParseResult<{
  importRowIds: number[];
  action: "skip" | "review";
}> {
  const rows = parseConfirmedRowIds(value);
  if (!rows.ok) return rows;
  const action = (value as Record<string, unknown>).action;
  if (action !== "skip" && action !== "review") return { ok: false, error: "invalid_review_action" };
  return { ok: true, value: { ...rows.value, action } };
}

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
