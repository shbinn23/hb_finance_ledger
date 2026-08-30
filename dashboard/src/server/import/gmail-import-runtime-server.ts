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
