function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntryId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }

  return null;
}

function firstRowEntryId(rows: unknown): number | null {
  if (!Array.isArray(rows) || !isRecord(rows[0])) {
    return null;
  }

  return parseEntryId(rows[0].entry_id);
}

export function extractWhooingEntryId(response: unknown): number | null {
  if (!isRecord(response)) {
    return null;
  }

  const results = response.results;
  if (isRecord(results)) {
    return parseEntryId(results.entry_id)
      ?? parseEntryId(results.id)
      ?? firstRowEntryId(results.rows);
  }
  if (Array.isArray(results)) {
    return firstRowEntryId(results);
  }

  return null;
}
