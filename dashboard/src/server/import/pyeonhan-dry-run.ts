import {
  parsePyeonhanWorkbook,
  pyeonhanSourceFileHash,
} from "./pyeonhan-excel-parser.ts";
import {
  getImportMappings,
  getImportSchemaStatus,
  getBenefitReplayEventsForRange,
  getMirrorEntriesForRange,
  getPreviousImportRowsForRange,
} from "./import-repository.ts";
import { reconcilePyeonhanTransactions } from "./pyeonhan-reconciliation.ts";
import {
  getActiveCardBenefitRules,
  getPreviousStructuredPerformanceAmount,
} from "../card-benefits/repository.ts";
import { resolveMonthlyCap } from "../../lib/card-benefits/evaluator.ts";

export const MAX_PYEONHAN_UPLOAD_BYTES = 5 * 1024 * 1024;

export function validatePyeonhanUpload(file: File | null) {
  if (!file) return "Excel 파일을 선택해 주세요.";
  if (!file.name.toLowerCase().endsWith(".xlsx")) return ".xlsx 파일만 업로드할 수 있습니다.";
  if (file.size > MAX_PYEONHAN_UPLOAD_BYTES) return "파일 크기는 5MB 이하여야 합니다.";
  return null;
}

export async function buildPyeonhanDryRun(file: File) {
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parsePyeonhanWorkbook(fileBuffer);
  const dates = parsed.transactions.map((row) => row.occurredDate).sort();
  if (dates.length === 0) throw new Error("Excel에 거래가 없습니다.");
  const startDate = dates[0];
  const endDate = dates.at(-1) ?? startDate;
  const [mappings, mirrorEntries, previousRows, schema, cardBenefitRules] = await Promise.all([
    getImportMappings(),
    getMirrorEntriesForRange(startDate, endDate),
    getPreviousImportRowsForRange(startDate, endDate),
    getImportSchemaStatus(),
    getActiveCardBenefitRules(),
  ]);
  const months = [...new Set(parsed.transactions.map((row) => row.occurredDate.slice(0, 7)))];
  const cappedRuleMonths = cardBenefitRules.flatMap((rule) => (
    rule.monthlyCapTiers.length > 0 ? months.map((month) => ({ rule, month })) : []
  ));
  const [capRows, existingEvents] = await Promise.all([
    Promise.all(cappedRuleMonths.map(async ({ rule, month }) => ({
      key: `${month}:${rule.ruleId}`,
      cap: resolveMonthlyCap(
        rule.monthlyCapTiers,
        await getPreviousStructuredPerformanceAmount(month, rule.ruleId),
      ),
    }))),
    getBenefitReplayEventsForRange(startDate, endDate),
  ]);
  const reconciliation = reconcilePyeonhanTransactions({
    transactions: parsed.transactions,
    mappings,
    mirrorEntries,
    previousRows,
    cardBenefitRules,
    cardBenefitReplay: {
      monthlyCaps: Object.fromEntries(capRows.map((row) => [row.key, row.cap])),
      existingEvents,
    },
  });
  return {
    filename: file.name,
    sourceFileHash: pyeonhanSourceFileHash(fileBuffer),
    sourceRowCount: parsed.sourceRowCount,
    startDate,
    endDate,
    schema,
    ...reconciliation,
  };
}
