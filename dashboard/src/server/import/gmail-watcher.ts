import { pyeonhanSourceFileHash } from "./pyeonhan-excel-parser.ts";

export interface GmailAttachmentEnvelope {
  messageId: string;
  attachmentId: string;
  filename: string;
  bytes: Buffer;
}

export interface GmailWatcherAdapter {
  listAttachments: (query: string) => Promise<GmailAttachmentEnvelope[]>;
}

export const GMAIL_IMPORT_QUERY_ENV = "PYEONHAN_GMAIL_QUERY";
export const GMAIL_IMPORT_POLL_INTERVAL_ENV = "PYEONHAN_GMAIL_POLL_INTERVAL_MS";
export const DEFAULT_PYEONHAN_GMAIL_QUERY = "has:attachment filename:xlsx subject:(편한가계부 OR 가계부)";

export function gmailAttachmentIdentity(input: Pick<GmailAttachmentEnvelope, "messageId" | "attachmentId">) {
  return `gmail:${input.messageId}:${input.attachmentId}`;
}

export async function processGmailAttachment<T>(
  attachment: GmailAttachmentEnvelope,
  dependencies: {
    wasProcessed: (identity: string) => Promise<boolean>;
    wasSourceFileProcessed: (sourceFileHash: string) => Promise<boolean>;
    importAttachment: (attachment: GmailAttachmentEnvelope) => Promise<T>;
  },
) {
  const identity = gmailAttachmentIdentity(attachment);
  if (await dependencies.wasProcessed(identity)) {
    return { status: "duplicate" as const, identity, result: null };
  }
  const sourceFileHash = pyeonhanSourceFileHash(attachment.bytes);
  if (await dependencies.wasSourceFileProcessed(sourceFileHash)) {
    return { status: "duplicate_file" as const, identity, sourceFileHash, result: null };
  }
  return {
    status: "handed_off" as const,
    identity,
    sourceFileHash,
    result: await dependencies.importAttachment(attachment),
  };
}
