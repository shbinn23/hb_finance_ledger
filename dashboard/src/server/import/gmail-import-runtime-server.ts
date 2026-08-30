import { createGmailApiAdapter } from "./gmail-api-adapter";
import { loadGmailOAuthCredentials } from "./gmail-credentials";
import { runGmailImportDryRunPoll } from "./gmail-import-runtime";
import {
  createImportReviewBatch,
  getLatestImportBatchForSourceFile,
  hasProcessedGmailAttachmentIdentity,
} from "./import-repository";
import { buildPyeonhanDryRun, validatePyeonhanUpload } from "./pyeonhan-dry-run";

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
    importAttachment: async (attachment) => {
      const file = new File([new Uint8Array(attachment.bytes)], attachment.filename, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
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
      return { batchId: review.batchId, reused: review.reused };
    },
  });
}
