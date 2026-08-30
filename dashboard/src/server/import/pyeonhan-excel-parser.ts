import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import type {
  NormalizedPyeonhanTransaction,
  ParsedPyeonhanWorkbook,
  PyeonhanEntryType,
} from "./pyeonhan-types.ts";

const EXPECTED_HEADERS = [
  "기간", "자산", "분류", "소분류", "내용", "KRW",
  "수입/지출", "추가입력", "금액", "화폐", "자산",
] as const;

type RawRow = {
  rowIndex: number;
  occurredDate: string;
  assetName: string;
  categoryName: string;
  subcategoryName: string;
  item: string;
  postingAmount: number;
  sourceType: string;
  memo: string;
  approvalAmount: number;
  currency: string;
};

type TransactionDraft = Omit<NormalizedPyeonhanTransaction,
  "occurrenceIndex" | "sourceIdentityKey" | "sourceContentHash">;

export class PyeonhanExcelFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PyeonhanExcelFormatError";
  }
}

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text.trim();
  }
  if (typeof value === "object" && "result" in value) {
    return text(value.result);
  }
  return String(value).trim();
}

function amount(value: unknown, label: string, rowIndex: number) {
  const parsed = Number(value ?? 0);
  const rounded = Math.round(parsed);
  if (!Number.isFinite(parsed) || rounded <= 0) {
    throw new PyeonhanExcelFormatError(`${rowIndex}행 ${label} 금액이 올바르지 않습니다.`);
  }
  return rounded;
}

function excelDate(value: unknown, rowIndex: number) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return [
      value.getUTCFullYear(),
      String(value.getUTCMonth() + 1).padStart(2, "0"),
      String(value.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial <= 0) {
    throw new PyeonhanExcelFormatError(`${rowIndex}행 기간이 올바르지 않습니다.`);
  }
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function sha256(parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function pyeonhanSourceFileHash(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function validateHeaders(row: unknown[]) {
  if (row.length < EXPECTED_HEADERS.length) {
    throw new PyeonhanExcelFormatError("편한가계부 Excel은 11개 컬럼이 필요합니다.");
  }
  EXPECTED_HEADERS.forEach((expected, index) => {
    if (text(row[index]) !== expected) {
      throw new PyeonhanExcelFormatError(
        `${index + 1}번째 컬럼은 '${expected}'여야 합니다.`,
      );
    }
  });
}

function toRawRow(row: unknown[], rowIndex: number): RawRow {
  return {
    rowIndex,
    occurredDate: excelDate(row[0], rowIndex),
    assetName: text(row[1]),
    categoryName: text(row[2]),
    subcategoryName: text(row[3]),
    item: text(row[4]),
    postingAmount: amount(row[5], "KRW", rowIndex),
    sourceType: text(row[6]),
    memo: text(row[7]),
    approvalAmount: amount(row[8] ?? row[5], "승인", rowIndex),
    currency: text(row[9]) || "KRW",
  };
}

function typeFromSource(value: string): PyeonhanEntryType {
  if (value === "지출") return "expense";
  if (value === "수입") return "income";
  if (value === "차액수입") return "difference_income";
  if (value === "이체입금" || value === "이체출금") return "transfer";
  throw new PyeonhanExcelFormatError(`지원하지 않는 수입/지출 값입니다: ${value || "(빈 값)"}`);
}

function rowDraft(row: RawRow): TransactionDraft {
  const entryType = typeFromSource(row.sourceType);
  if (row.approvalAmount < row.postingAmount) {
    throw new PyeonhanExcelFormatError(
      `${row.rowIndex}행 승인 금액은 KRW 금액보다 작을 수 없습니다.`,
    );
  }
  const transferIn = row.sourceType === "이체입금";
  return {
    sourceRowIndexes: [row.rowIndex],
    occurredDate: row.occurredDate,
    entryType,
    sourceAssetName: transferIn ? row.categoryName : row.assetName,
    counterpartyAssetName: entryType === "transfer"
      ? (transferIn ? row.assetName : row.categoryName)
      : null,
    sourceCategoryName: entryType === "transfer" ? null : row.categoryName || null,
    sourceSubcategoryName: row.subcategoryName || null,
    item: row.item || (entryType === "transfer" ? "이체" : ""),
    memo: row.memo,
    postingAmount: row.postingAmount,
    approvalAmount: row.approvalAmount,
    discountAmount: Math.max(0, row.approvalAmount - row.postingAmount),
    currency: row.currency,
    transferPairComplete: entryType !== "transfer",
  };
}

function reciprocalTransfer(outgoing: RawRow, incoming: RawRow) {
  return outgoing.sourceType === "이체출금"
    && incoming.sourceType === "이체입금"
    && outgoing.occurredDate === incoming.occurredDate
    && outgoing.postingAmount === incoming.postingAmount
    && outgoing.assetName === incoming.categoryName
    && outgoing.categoryName === incoming.assetName;
}

function buildDrafts(rows: RawRow[]) {
  const used = new Set<number>();
  const drafts: TransactionDraft[] = [];

  rows.forEach((row, index) => {
    if (used.has(index)) return;
    if (row.sourceType === "이체출금" || row.sourceType === "이체입금") {
      const pairIndex = rows.findIndex((candidate, candidateIndex) => {
        if (used.has(candidateIndex) || candidateIndex === index) return false;
        return row.sourceType === "이체출금"
          ? reciprocalTransfer(row, candidate)
          : reciprocalTransfer(candidate, row);
      });
      if (pairIndex >= 0) {
        const outgoing = row.sourceType === "이체출금" ? row : rows[pairIndex];
        const draft = rowDraft(outgoing);
        draft.sourceRowIndexes = [row.rowIndex, rows[pairIndex].rowIndex].sort((a, b) => a - b);
        draft.transferPairComplete = true;
        used.add(index);
        used.add(pairIndex);
        drafts.push(draft);
        return;
      }
    }
    used.add(index);
    drafts.push(rowDraft(row));
  });

  return drafts;
}

function identityBase(row: TransactionDraft) {
  return [
    row.occurredDate,
    row.entryType,
    row.sourceAssetName,
    row.counterpartyAssetName,
    row.postingAmount,
    row.approvalAmount,
  ];
}

export function parsePyeonhanRows(rows: unknown[][]): ParsedPyeonhanWorkbook {
  if (rows.length === 0) {
    throw new PyeonhanExcelFormatError("Excel에 데이터가 없습니다.");
  }
  validateHeaders(rows[0]);
  const rawRows = rows.slice(1)
    .map((row, index) => ({ row, rowIndex: index + 2 }))
    .filter(({ row }) => row.some((value) => value !== null && value !== undefined && value !== ""))
    .map(({ row, rowIndex }) => toRawRow(row, rowIndex));
  const occurrenceCounts = new Map<string, number>();
  const transactions = buildDrafts(rawRows).map((draft) => {
    const base = identityBase(draft);
    const groupKey = JSON.stringify(base);
    const occurrenceIndex = (occurrenceCounts.get(groupKey) ?? 0) + 1;
    occurrenceCounts.set(groupKey, occurrenceIndex);
    return {
      ...draft,
      occurrenceIndex,
      sourceIdentityKey: sha256([...base, occurrenceIndex]),
      sourceContentHash: sha256([
        draft.occurredDate,
        draft.entryType,
        draft.sourceAssetName,
        draft.counterpartyAssetName,
        draft.sourceCategoryName,
        draft.sourceSubcategoryName,
        draft.item,
        draft.memo,
        draft.postingAmount,
        draft.approvalAmount,
        draft.discountAmount,
        draft.currency,
      ]),
    } satisfies NormalizedPyeonhanTransaction;
  });

  return { transactions, sourceRowCount: rawRows.length };
}

export async function parsePyeonhanWorkbook(buffer: Buffer): Promise<ParsedPyeonhanWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new PyeonhanExcelFormatError("Excel worksheet가 없습니다.");
  }
  const rows: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    rows.push(Array.from({ length: EXPECTED_HEADERS.length }, (_, index) => row.getCell(index + 1).value));
  });
  return parsePyeonhanRows(rows);
}
