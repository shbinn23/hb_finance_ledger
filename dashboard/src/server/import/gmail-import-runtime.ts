import type { GmailCredentialLoadResult } from "./gmail-credentials.ts";
import type { GmailAttachmentEnvelope, GmailWatcherAdapter } from "./gmail-watcher.ts";
import { getGmailImportRuntimeStatus, processGmailAttachment } from "./gmail-watcher.ts";

type GmailImportEnv = Record<string, string | undefined>;

export async function runGmailImportDryRunPoll<T extends { batchId: number; reused?: boolean }>(input: {
  env?: GmailImportEnv;
  loadCredentials: () => Promise<GmailCredentialLoadResult>;
  createAdapter: (credentials: Extract<GmailCredentialLoadResult, { state: "ready" }>["credentials"]) => GmailWatcherAdapter;
  wasProcessed: (identity: string) => Promise<boolean>;
  wasSourceFileProcessed: (sourceFileHash: string) => Promise<boolean>;
  importAttachment: (attachment: GmailAttachmentEnvelope) => Promise<T>;
}) {
  const runtime = getGmailImportRuntimeStatus(input.env, false);
  if (!runtime.enabled) {
    return { status: "disabled" as const, checkedMessages: 0, foundAttachments: 0, importedBatches: 0, reusedBatches: 0, batchIds: [], errors: [] };
  }
  if (!runtime.dryRunOnly) {
    return { status: "write_mode_blocked" as const, checkedMessages: 0, foundAttachments: 0, importedBatches: 0, reusedBatches: 0, batchIds: [], errors: ["gmail_dry_run_required"] };
  }
  const credentialResult = await input.loadCredentials();
  if (credentialResult.state !== "ready") {
    return { status: "needs_credentials" as const, checkedMessages: 0, foundAttachments: 0, importedBatches: 0, reusedBatches: 0, batchIds: [], errors: [credentialResult.reason] };
  }
  const search = await input.createAdapter(credentialResult.credentials).listAttachments(runtime.query);
  let importedBatches = 0;
  let reusedBatches = 0;
  const batchIds: number[] = [];
  const errors: string[] = [];
  for (const attachment of search.attachments) {
    try {
      const result = await processGmailAttachment(attachment, input);
      if (result.status === "handed_off") {
        if (result.result.reused) reusedBatches += 1;
        else importedBatches += 1;
        batchIds.push(result.result.batchId);
      } else {
        reusedBatches += 1;
      }
    } catch {
      errors.push("attachment_import_failed");
    }
  }
  return {
    status: "polled" as const,
    checkedMessages: search.checkedMessages,
    foundAttachments: search.attachments.length,
    importedBatches,
    reusedBatches,
    batchIds,
    errors,
  };
}
