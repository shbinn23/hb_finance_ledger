import { createGmailApiAdapter } from "./gmail-api-adapter";
import { loadGmailOAuthCredentials } from "./gmail-credentials";
import { runGmailImportDryRunPoll } from "./gmail-import-runtime";
import {
  createImportReviewBatch,
  getImportBatchForGmailAttachment,
  getLatestImportBatchStatus,
  getLatestImportBatchForSourceFile,
  hasProcessedGmailAttachmentIdentity,
  importRowReferenceKey,
  refreshImportReviewBatch,
} from "./import-repository";
import { buildPyeonhanDryRun, validatePyeonhanUpload } from "./pyeonhan-dry-run";
import { executeSafeImportAutomation } from "./import-auto-execution";
import { getImportAutomationPolicy, buildImportAccountCandidate } from "./import-automation-policy";
import { executeRuntimeApprovedImportCreates } from "./import-action-runtime";
import { executeRuntimePyeonhanBenefitCandidate } from "./pyeonhan-benefit-runtime";

function gmailAttachmentFile(attachment: { bytes: Buffer; filename: string }) {
  return new File([new Uint8Array(attachment.bytes)], attachment.filename, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function reviewBatchResult(
  dryRun: Awaited<ReturnType<typeof buildPyeonhanDryRun>>,
  input: {
    batchId: number;
    batchStatus: string;
    reused: boolean;
    rowIds: Map<string, number>;
  },
) {
  return {
    ...dryRun,
    batchId: input.batchId,
    batchStatus: input.batchStatus,
    reused: input.reused,
    createdRows: input.reused ? 0 : dryRun.rows.length,
    reviewRequiredCount: dryRun.summary.reviewRequired,
    possibleUpdateCount: dryRun.summary.possibleUpdates,
    mappingRequiredCount: dryRun.summary.mappingRequired,
    autoCreatableCount: dryRun.summary.autoCreatable,
    rows: dryRun.rows.map((row) => ({
      ...row,
      importRowId: input.rowIds.get(importRowReferenceKey(
        row.transaction.sourceIdentityKey,
        row.transaction.occurrenceIndex,
      )) ?? null,
    })),
  };
}

export function runRuntimeGmailImportDryRunPoll() {
  return runGmailImportDryRunPoll({
    loadCredentials: () => loadGmailOAuthCredentials(),
    createAdapter: (credentials) => createGmailApiAdapter({
      credentials,
      timeoutMs: Number(process.env.GMAIL_API_TIMEOUT_MS) || 15_000,
    }),
    wasProcessed: hasProcessedGmailAttachmentIdentity,
    wasSourceFileProcessed: async (sourceFileHash) => Boolean(
      await getLatestImportBatchForSourceFile(sourceFileHash),
    ),
    getLatestBatch: getLatestImportBatchStatus,
    loadProcessedAttachment: async (attachment) => {
      const file = gmailAttachmentFile(attachment);
      const validationError = validatePyeonhanUpload(file);
      if (validationError) throw new Error("invalid_gmail_attachment");
      const dryRun = await buildPyeonhanDryRun(file);
      const existing = await getImportBatchForGmailAttachment(
        attachment.messageId,
        attachment.attachmentId,
      ) ?? await getLatestImportBatchForSourceFile(dryRun.sourceFileHash);
      if (!existing) return null;
      const rowIds = await refreshImportReviewBatch({
        batchId: existing.batchId,
        sourceFileHash: dryRun.sourceFileHash,
        rows: dryRun.rows,
        possibleDeletes: dryRun.possibleDeletes,
      });
      return reviewBatchResult(dryRun, {
        batchId: existing.batchId,
        batchStatus: existing.status,
        reused: true,
        rowIds,
      });
    },
    importAttachment: async (attachment) => {
      const file = gmailAttachmentFile(attachment);
      const validationError = validatePyeonhanUpload(file);
      if (validationError) throw new Error("invalid_gmail_attachment");
      const dryRun = await buildPyeonhanDryRun(file);
      const review = await createImportReviewBatch({
        filename: attachment.filename,
        sourceFileHash: dryRun.sourceFileHash,
        startDate: dryRun.startDate,
        endDate: dryRun.endDate,
        rows: dryRun.rows,
        possibleDeletes: dryRun.possibleDeletes,
        gmailMessageId: attachment.messageId,
        gmailAttachmentId: attachment.attachmentId,
      });
      return reviewBatchResult(dryRun, {
        batchId: review.batchId,
        batchStatus: "review",
        reused: review.reused,
        rowIds: review.rowIds,
      });
    },
  });
}

export async function runRuntimeGmailImportPoll() {
  const poll = await runRuntimeGmailImportDryRunPoll();
  const policy = getImportAutomationPolicy();
  const latestBatch = poll.status === "polled" ? poll.latestBatch : null;
  const accountCreateCandidates = latestBatch?.mappingGaps?.map((gap) => (
    buildImportAccountCandidate(gap, process.env.WHOOING_SECTION_ID ?? "")
  )) ?? [];
  const execution = await executeSafeImportAutomation({
    enabled: poll.status === "polled" && policy.autoExecuteEnabled,
    rows: latestBatch?.rows ?? [],
    executeCreates: executeRuntimeApprovedImportCreates,
    executeBenefit: executeRuntimePyeonhanBenefitCandidate,
  });
  const completedCreates = new Set(execution.completedCreateRowIds);
  const completedBenefits = new Set(execution.completedBenefitRowIds);
  const existingBenefits = new Set(execution.existingBenefitRowIds);
  const responseBatch = latestBatch ? {
    ...latestBatch,
    rows: latestBatch.rows.map((row) => {
      if (!row.importRowId) return row;
      if (completedCreates.has(row.importRowId)) {
        return { ...row, status: "created" as const, reason: "Gmail safe 자동 반영으로 등록했습니다." };
      }
      if (completedBenefits.has(row.importRowId)) {
        return { ...row, cardBenefitStatus: "created" as const };
      }
      if (existingBenefits.has(row.importRowId)) {
        return { ...row, cardBenefitStatus: "event_exists" as const };
      }
      return row;
    }),
    summary: {
      ...latestBatch.summary,
      autoCreatable: Math.max(0, latestBatch.summary.autoCreatable - completedCreates.size),
      benefitCandidates: Math.max(
        0,
        latestBatch.summary.benefitCandidates - completedBenefits.size - existingBenefits.size,
      ),
      benefitExisting: latestBatch.summary.benefitExisting
        + completedBenefits.size + existingBenefits.size,
    },
  } : null;
  return {
    ...poll,
    latestBatch: responseBatch,
    dryRunOnly: policy.dryRunOnly,
    autoExecuteEnabled: policy.autoExecuteEnabled,
    safeOnly: policy.safeOnly,
    accountCreateEnabled: policy.accountCreateEnabled,
    accountCreateRequiresApproval: policy.accountCreateRequiresApproval,
    accountCreateCandidates,
    createdAccounts: 0,
    savedMappings: 0,
    ...execution,
  };
}
