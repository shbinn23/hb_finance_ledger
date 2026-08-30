import type { GmailCredentialLoadResult } from "./gmail-credentials.ts";
import type { GmailAttachmentEnvelope, GmailWatcherAdapter } from "./gmail-watcher.ts";
import { getGmailImportRuntimeStatus, processGmailAttachment } from "./gmail-watcher.ts";

type GmailImportEnv = Record<string, string | undefined>;

interface GmailImportedBatchSummary {
  batchId: number;
  reused?: boolean;
  batchStatus?: string;
  createdRows?: number;
  reviewRequiredCount?: number;
  possibleUpdateCount?: number;
  mappingRequiredCount?: number;
  autoCreatableCount?: number;
}

function emptyPollResult(status: "disabled" | "write_mode_blocked" | "needs_credentials", errors: string[] = []) {
  return {
    status,
    checkedMessages: 0,
    foundAttachments: 0,
    importedBatches: 0,
    reusedBatches: 0,
    batchIds: [] as number[],
    skippedInvalidAttachments: 0,
    createdRows: 0,
    reviewRequiredCount: 0,
    possibleUpdateCount: 0,
    mappingRequiredCount: 0,
    autoCreatableCount: 0,
    latestBatchId: null as number | null,
    latestBatchStatus: null as string | null,
    latestBatch: null,
    errors,
  };
}

export async function runGmailImportDryRunPoll<T extends GmailImportedBatchSummary>(input: {
  env?: GmailImportEnv;
  loadCredentials: () => Promise<GmailCredentialLoadResult>;
  createAdapter: (credentials: Extract<GmailCredentialLoadResult, { state: "ready" }>["credentials"]) => GmailWatcherAdapter;
  wasProcessed: (identity: string) => Promise<boolean>;
  wasSourceFileProcessed: (sourceFileHash: string) => Promise<boolean>;
  importAttachment: (attachment: GmailAttachmentEnvelope) => Promise<T>;
  loadProcessedAttachment?: (attachment: GmailAttachmentEnvelope) => Promise<T | null>;
  getLatestBatch?: () => Promise<{ batchId: number; batchStatus: string } | null>;
}) {
  const runtime = getGmailImportRuntimeStatus(input.env, false);
  if (!runtime.enabled) {
    return emptyPollResult("disabled");
  }
  if (!runtime.dryRunOnly) {
    return emptyPollResult("write_mode_blocked", ["gmail_dry_run_required"]);
  }
  const credentialResult = await input.loadCredentials();
  if (credentialResult.state !== "ready") {
    return emptyPollResult("needs_credentials", [credentialResult.reason]);
  }
  const search = await input.createAdapter(credentialResult.credentials).listAttachments(runtime.query);
  let importedBatches = 0;
  let reusedBatches = 0;
  const batchIds: number[] = [];
  const errors: string[] = [];
  let createdRows = 0;
  let reviewRequiredCount = 0;
  let possibleUpdateCount = 0;
  let mappingRequiredCount = 0;
  let autoCreatableCount = 0;
  let latestBatch: T | null = null;
  for (const attachment of search.attachments) {
    try {
      const result = await processGmailAttachment(attachment, input);
      if (result.status === "handed_off") {
        if (result.result.reused) reusedBatches += 1;
        else {
          importedBatches += 1;
          createdRows += result.result.createdRows ?? 0;
          reviewRequiredCount += result.result.reviewRequiredCount ?? 0;
          possibleUpdateCount += result.result.possibleUpdateCount ?? 0;
          mappingRequiredCount += result.result.mappingRequiredCount ?? 0;
          autoCreatableCount += result.result.autoCreatableCount ?? 0;
        }
        latestBatch ??= result.result;
        batchIds.push(result.result.batchId);
      } else {
        reusedBatches += 1;
        if (result.result) {
          latestBatch ??= result.result;
          batchIds.push(result.result.batchId);
        }
      }
    } catch {
      errors.push("attachment_import_failed");
    }
  }
  const persistedLatestBatch = latestBatch ? null : await input.getLatestBatch?.();
  return {
    status: "polled" as const,
    checkedMessages: search.checkedMessages,
    foundAttachments: search.attachments.length,
    importedBatches,
    reusedBatches,
    batchIds,
    skippedInvalidAttachments: errors.length,
    createdRows,
    reviewRequiredCount,
    possibleUpdateCount,
    mappingRequiredCount,
    autoCreatableCount,
    latestBatchId: latestBatch?.batchId ?? persistedLatestBatch?.batchId ?? null,
    latestBatchStatus: latestBatch?.batchStatus ?? persistedLatestBatch?.batchStatus ?? null,
    latestBatch,
    errors,
  };
}
